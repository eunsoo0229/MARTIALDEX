// TTS playback tracking + lesson-video evidence checks — offline.
// tts.ts runs against a FAKE speechSynthesis that behaves like the browser
// engine (queue, onstart/onend/onerror, cancel, pause) so the tracking
// logic is exercised deterministically. Run: node .devtools/test-coach-voice-video.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-voice-'));
fs.writeFileSync(path.join(dir, 'entry.ts'), `export * from ${JSON.stringify(path.join(APP, 'src/lib/voice/tts.ts'))};`);
await build({ entryPoints: [path.join(dir, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'tts.mjs'), logLevel: 'error' });
// lessonVideos imports network providers; only the pure checker is needed — bundle it with those stubbed.
fs.writeFileSync(path.join(dir, 'stub2.ts'), 'export const getUnifiedMartialArt = () => null; export const normalizeTechniqueName = (s: string) => s.toLowerCase();');
fs.writeFileSync(path.join(dir, 'stub.ts'), 'export const videoInfoProvider = {}; export const videoSearchProvider = {}; export const askGeminiForJsonWithGrounding = async () => ({ ok: false }); export const findTutorVideos = async () => ({ videos: [] });');
await build({
  entryPoints: [path.join(APP, 'src/lib/coachLesson/lessonVideos.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(dir, 'videos.mjs'),
  logLevel: 'error',
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(videoSearch\/provider|userTechniques\/geminiJson|tutorVideoFinder)$/ }, () => ({ path: path.join(dir, 'stub.ts') })); b.onResolve({ filter: /userTechniques\/service$/ }, () => ({ path: path.join(dir, 'stub2.ts') })); } }],
}).catch(async (e) => {
  throw e;
});

// ---------------- fake browser speech engine
let mode = 'normal'; // normal | silent (never starts) | fail
const log = [];
class Utt {
  constructor(text) { this.text = text; this.rate = 1; this.lang = ''; }
}
const engine = {
  queue: [],
  speaking: false,
  pending: false,
  paused: false,
  speak(u) { this.queue.push(u); this.pending = true; log.push(u.text); this._next(); },
  _next() {
    if (this.current || this.paused || mode === 'silent') return;
    const u = this.queue.shift();
    if (!u) { this.speaking = false; this.pending = false; return; }
    this.current = u;
    this.speaking = true;
    setTimeout(() => {
      if (this.current !== u) return;
      if (mode === 'fail') { this.current = null; u.onerror?.({ error: 'audio-busy' }); this._next(); return; }
      u.onstart?.();
      u._t = setTimeout(() => { if (this.current !== u) return; this.current = null; u.onend?.(); this._next(); }, 20 + u.text.length);
    }, 5);
  },
  cancel() { const all = [this.current, ...this.queue].filter(Boolean); this.queue = []; if (this.current) clearTimeout(this.current._t); this.current = null; this.speaking = false; this.pending = false; for (const u of all) u.onerror?.({ error: 'canceled' }); },
  pause() { this.paused = true; },
  resume() { const was = this.paused; this.paused = false; if (was) this._next(); },
  getVoices: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.window = globalThis;
globalThis.speechSynthesis = engine;
globalThis.SpeechSynthesisUtterance = Utt;
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
const events = [];
globalThis.dispatchEvent = (e) => events.push(e.type);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const T = await import(pathToFileURL(path.join(dir, 'tts.mjs')).href);
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

{
  const r = await T.speak('좋습니다. 지금 리듬을 유지해 보세요.');
  check('[V1] 엔진의 실제 onstart → onend 후에만 재생 성공 (재생 시간 기록)', r.ok && r.playedMs > 0 && T.getTtsState().lastPlayed?.text.includes('리듬') && T.getTtsState().playedCount === 1, r);
  check('[V2] 상태 이벤트 발행 (UI가 말하는 중/대기 표시)', events.includes('martialdex:tts-state') && T.getTtsState().status === 'idle');
}
{
  const long = Array.from({ length: 8 }, (_, i) => `${i + 1}번째 문장입니다. 잽을 낸 손을 가드로 회수하면서 반대 손으로 크로스를 연결하는 데 집중해 보세요.`).join(' ');
  const parts = T.splitForSpeech(long);
  check('[V3] 긴 설명은 문장 단위로 나눠 읽음 (조각 ≤160자, 내용 손실 없음)', parts.length > 1 && parts.every((p) => p.length <= 160) && parts.join(' ').replace(/\s+/g, '') === long.replace(/\s+/g, ''), parts.map((p) => p.length));
  log.length = 0;
  const r = await T.speak(long);
  check('[V4] 나눈 조각이 순서대로 모두 재생됨', r.ok && log.length === parts.length && log[0].startsWith('1번째'), log.length);
}
{
  log.length = 0;
  const a = T.speak('첫 번째 안내입니다. 조금 길게 이어지는 설명입니다.');
  const b = T.speak('두 번째 안내입니다.');
  check('[V5] 여러 줄은 겹치지 않고 큐에 쌓임 (재생 중 pending>1)', T.getTtsState().pending === 2 && T.isSpeaking());
  await Promise.all([a, b]);
  check('[V6] 큐 순서대로 재생 완료', log.join('|') === '첫 번째 안내입니다. 조금 길게 이어지는 설명입니다.|두 번째 안내입니다.' && T.getTtsState().pending === 0);
}
{
  const a = T.speak('길게 말하는 중인 설명입니다. 이 문장은 중지될 예정입니다.');
  await sleep(10);
  T.pauseSpeaking();
  check('[V7] 일시정지 상태 표시', T.getTtsState().status === 'paused');
  T.resumeSpeaking();
  check('[V8] 재개 시 말하는 중으로', T.getTtsState().status === 'speaking');
  T.stopSpeaking();
  const r = await a;
  check('[V9] 중지: 남은 줄 취소(canceled), 상태 대기', !r.ok && r.reason === 'canceled' && T.getTtsState().status === 'idle' && T.getTtsState().pending === 0, r);
}
{
  const a = T.speak('예전 안내입니다. 아직 남아 있는 줄입니다.');
  const b = T.speak('마지막 30초입니다.', { interrupt: true });
  const [ra, rb] = await Promise.all([a, b]);
  check('[V10] interrupt: 이전 줄을 끊고 타이머 안내를 바로 재생', !ra.ok && ra.reason === 'canceled' && rb.ok, { ra, rb });
}
{
  mode = 'fail';
  const r = await T.speak('오디오 장치 오류 테스트입니다.');
  check('[V11] 엔진 오류(audio-busy) → 실패로 보고 + 이유 표시 (성공으로 위장하지 않음)', !r.ok && r.reason === 'failed' && /오디오 장치/.test(T.getTtsState().lastError ?? ''), { r, err: T.getTtsState().lastError });
  mode = 'normal';
  await T.speak('정상 복구 문장입니다.');
  check('[V12] 다음 정상 재생 시 오류 해제', T.getTtsState().lastError === null);
}
{
  mode = 'silent';
  const t0 = Date.now();
  const r = await T.speak('음성 엔진이 응답하지 않는 경우입니다.');
  check('[V13] 엔진이 시작하지 않으면 6초 내 "재생되지 않음"으로 보고 (무한 대기 없음)', !r.ok && r.reason === 'failed' && Date.now() - t0 < 7500 && /재생되지 않았습니다/.test(r.message ?? ''), { r, ms: Date.now() - t0 });
  mode = 'normal';
  engine.cancel();
}
{
  const r = await T.speak('   ');
  check('[V14] 빈 문장은 재생 시도 안 함', !r.ok && r.reason === 'empty');
}

// ---------------- lesson video evidence (pure)
const V = await import(pathToFileURL(path.join(dir, 'videos.mjs')).href);
const info = { videoId: 'abcdefghijk', title: 'Boxing Distance Management', channel: 'Coach X', description: 'In this tutorial we cover distance management and footwork drills to control range against taller opponents.', lengthSeconds: 600, keywords: ['boxing', 'footwork'], category: 'Sports', playable: true };
const terms = ['거리 조절', 'distance management', 'footwork'];
check('[E1] 설명 인용 + 주제 단어 + 강좌 → 통과', V.checkTopicEvidence(info, terms, { verdict: 'VERIFIED', contentType: 'tutorial', evidenceQuotes: ['distance management and footwork drills'], reason: 'ok' }).ok);
check('[E2] 제목만 인용 → 거부 (제목만으로 판단하지 않음)', !V.checkTopicEvidence(info, terms, { verdict: 'VERIFIED', contentType: 'tutorial', evidenceQuotes: ['Boxing Distance Management'], reason: '' }).ok);
check('[E3] 메타데이터에 없는 지어낸 인용 → 거부', !V.checkTopicEvidence(info, terms, { verdict: 'VERIFIED', contentType: 'tutorial', evidenceQuotes: ['how to jab like a pro'], reason: '' }).ok);
check('[E4] 하이라이트 영상 → 거부', !V.checkTopicEvidence(info, terms, { verdict: 'VERIFIED', contentType: 'competition_highlight', evidenceQuotes: ['distance management and footwork drills'], reason: '' }).ok);
check('[E5] 주제 단어 없는 인용 → 거부', !V.checkTopicEvidence(info, ['클린치'], { verdict: 'VERIFIED', contentType: 'tutorial', evidenceQuotes: ['in this tutorial we cover'], reason: '' }).ok);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
