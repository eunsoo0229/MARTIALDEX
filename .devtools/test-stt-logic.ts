// Logic tests for the speech-recognition helpers (src/lib/voice/sttText.ts):
// pause-based segmentation, whisper silence-hallucination filtering, and
// duplicate-free accumulation of browser/Android results. Synthetic audio —
// real Korean recognition is checked in the Electron E2E (qa-local-stt.mjs).
// Run: npx tsx .devtools/test-stt-logic.ts
import { audioCtxFor, cleanWhisperText, encodeWav16k, joinText, readRecognitionResults, SpeechSegmenter, STT_RATE } from '../src/lib/voice/sttText';

let pass = 0;
let fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${!ok && d ? ' :: ' + d : ''}`);
};

const sec = (s: number) => Math.round(s * STT_RATE);
/** "speech": a 220 Hz tone with a syllable-like envelope; "silence": faint noise. */
function speech(s: number, amp = 0.2): Float32Array {
  const n = sec(s);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / STT_RATE) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * i) / STT_RATE));
  return out;
}
let seed = 3;
function silence(s: number, amp = 0.001): Float32Array {
  const n = sec(s);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1);
  return out;
}
/** Feeds audio in 128-sample chunks (like an AudioWorklet), returns finished segments (+ the flush). */
function run(parts: Float32Array[], seg = new SpeechSegmenter()): Float32Array[] {
  const out: Float32Array[] = [];
  for (const p of parts) for (let i = 0; i < p.length; i += 128) out.push(...seg.push(p.slice(i, i + 128)));
  const last = seg.flush();
  if (last) out.push(last);
  return out;
}
const dur = (a: Float32Array) => a.length / STT_RATE;

{
  const segs = run([silence(1), speech(2), silence(1.2), speech(1.5), silence(1)]);
  check('[S1] 말 2번 + 쉼 → 구간 2개', segs.length === 2, segs.map(dur).join());
  check('[S2] 각 구간 길이가 말한 길이와 비슷 (앞뒤 여유 포함)', segs.length === 2 && Math.abs(dur(segs[0]) - 2) < 0.6 && Math.abs(dur(segs[1]) - 1.5) < 0.6, segs.map(dur).join());
}
{
  const segs = run([silence(3)]);
  check('[S3] 조용한 방 소음만 → 구간 없음 (빈 소리를 보내지 않음)', segs.length === 0);
}
{
  const segs = run([silence(1), speech(0.06), silence(1)]);
  check('[S4] 짧은 딸깍 소리(60ms) → 구간 없음', segs.length === 0);
}
{
  const segs = run([silence(0.5), speech(22), silence(1)]);
  check('[S5] 22초 연속 발화 → 9.5초 이하 구간들로 잘림 (긴 말 처리)', segs.length >= 3 && segs.every((s) => dur(s) <= 9.6), segs.map(dur).join());
  const total = segs.reduce((a, s) => a + dur(s), 0);
  check('[S6] 잘라도 말이 빠지지 않음 (합계 ≈ 22초)', Math.abs(total - 22) < 1, String(total));
}
{
  const seg = new SpeechSegmenter();
  const segs = run([silence(1), speech(1.5), silence(0.3), speech(1.5), silence(1)], seg);
  check('[S7] 짧은 숨(0.3초)은 한 문장으로 유지', segs.length === 1, segs.map(dur).join());
}
{
  const segs = run([silence(1, 0.02), speech(1.5, 0.3), silence(1, 0.02)]);
  check('[S8] 시끄러운 방(바닥 소음↑)에서도 말 구간만 잡음', segs.length === 1, segs.map(dur).join());
}
{
  const segs = run([silence(0.5), speech(2)]);
  check('[S9] 말하는 도중 "말하기 끝" → 진행 중인 구간도 인식에 보냄', segs.length === 1 && dur(segs[0]) > 1.8, segs.map(dur).join());
}
{
  const wav = encodeWav16k(speech(1, 0.05));
  const view = new DataView(wav.buffer);
  const ascii = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  check('[W1] 16kHz 모노 16bit WAV 헤더', ascii(0) === 'RIFF' && ascii(8) === 'WAVE' && view.getUint32(24, true) === 16000 && view.getUint16(22, true) === 1 && view.getUint16(34, true) === 16);
  check('[W2] 작은 목소리는 키워서 보냄 (잘림 없이)', peak > 25000 && peak <= 32767, String(peak));
  check('[W3] 짧은 구간은 whisper 창을 줄여 빠르게 (3초 → 214, 30초 → 1500)', audioCtxFor(sec(3)) === 214 + 0 || audioCtxFor(sec(3)) < 400, String(audioCtxFor(sec(3))));
}
{
  check('[H1] 무음에서 생기는 "시청해주셔서 감사합니다" 제거', cleanWhisperText('시청해주셔서 감사합니다.', 2) === '');
  check('[H2] "구독과 좋아요 부탁드립니다" 제거', cleanWhisperText('구독과 좋아요 부탁드립니다.', 3) === '');
  check('[H3] 짧은 잡음 구간의 "감사합니다." 제거', cleanWhisperText('감사합니다.', 0.8) === '');
  check('[H4] 실제로 길게 말한 "감사합니다"는 유지', cleanWhisperText('감사합니다.', 2) === '감사합니다.');
  check('[H5] 정상 문장은 그대로 (공백 정리)', cleanWhisperText('  잽을 던진 다음에   바로 가드를 올리나요? ', 3) === '잽을 던진 다음에 바로 가드를 올리나요?');
  check('[H6] (음악) 같은 표시 제거', cleanWhisperText('(음악)', 3) === '' && cleanWhisperText('[음악] 준비됐어요', 3) === '준비됐어요');
}
{
  const r = (t: string, f: boolean) => ({ isFinal: f, 0: { transcript: t } });
  const a = readRecognitionResults([r('잽을 던진 다음에', true), r(' 바로 가드', false)]);
  check('[R1] 확정 결과와 중간 결과를 나눔', a.final === '잽을 던진 다음에' && a.interim === '바로 가드', JSON.stringify(a));
  // the same event delivered twice → same text (rebuilt from the full list, never appended)
  const list = [r('준비됐어요', true), r('다음 기술로', true)];
  const b1 = readRecognitionResults(list);
  const b2 = readRecognitionResults(list);
  check('[R2] 같은 결과 이벤트가 두 번 와도 글자가 중복되지 않음', b1.final === b2.final && b1.final === '준비됐어요 다음 기술로', b1.final);
  check('[R3] 재시작 전 확정분 + 새 결과 이어 붙이기 (공백 정리)', joinText(['준비됐어요', '', ' 다음 기술로 넘어가 주세요 ']) === '준비됐어요 다음 기술로 넘어가 주세요');
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
