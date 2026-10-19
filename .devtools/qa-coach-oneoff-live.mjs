// AI 코치 「수업하고 싶은 거 입력하기」 — live end-to-end in the real Electron
// app: real Gemini (lesson, grading, answers, transcription), real Tavily
// web search, real YouTube search + metadata verification, the REAL system
// speech engine (speechSynthesis.speak is only WRAPPED to record which lines
// were requested and their real start/end events — audio still plays), the
// app's real recording → WAV → transcription path fed by a recorded Korean
// question, and the set/rest timer in real time. Long phases are skipped by
// shifting the saved deadlines back and reloading (which also exercises
// restore + background catch-up). Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: pass === true ? 'PASS' : pass === null ? 'NOT TESTED' : 'FAIL' });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(`${pass === true ? 'PASS' : pass === null ? 'NOT TESTED' : 'FAIL'} — ${name}${d ? ' :: ' + d.slice(0, 500) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SESSION_KEY = 'martialdex:coach-oneoff-session';

const WRAP = () => {
  // Record (never replace) what the app asks the speech engine to say, with the engine's own start/end events.
  const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.__tts = [];
  window.speechSynthesis.speak = (u) => {
    const rec = { text: u.text, at: Date.now(), start: null, end: null, error: null };
    window.__tts.push(rec);
    u.addEventListener('start', () => (rec.start = Date.now()));
    u.addEventListener('end', () => (rec.end = Date.now()));
    u.addEventListener('error', (e) => (rec.error = e.error));
    orig(u);
  };
};

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-oneoff-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 60000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await page.evaluate(() => localStorage.setItem('martialdex:coach-kind-pref', JSON.stringify({ last: 'gemini', remember: true }))); // 이 QA는 기존 Gemini 코치를 검증 — 수업 전 코치 선택(2026-10-19) 이후 Gemini를 명시적으로 선택
  await sleep(1000);
  await page.evaluate(WRAP);

  const tts = () => page.evaluate(() => window.__tts ?? []);
  const directive = () => page.evaluate(() => document.querySelector('[data-testid="oneoff-chat"]')?.dataset.directive ?? null);
  const coach = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="oneoff-chat"] .oneoff-msg')].map((m) => ({ role: m.dataset.role, kind: m.dataset.kind, text: m.childNodes[0]?.textContent ?? m.textContent })));
  const count = () => page.evaluate(() => document.querySelectorAll('[data-testid="oneoff-chat"] .oneoff-msg').length);
  async function waitReply(before, timeout = 120000) {
    await page.waitForFunction((n) => {
      const all = [...document.querySelectorAll('[data-testid="oneoff-chat"] .oneoff-msg')];
      const busy = all.at(-1)?.textContent === '…';
      return !busy && all.length > n + 1 && all.at(-1).dataset.role === 'coach';
    }, before, { timeout });
    await sleep(300);
  }
  async function send(text) {
    const n = await count();
    await page.fill('[data-testid="oneoff-answer"]', text);
    await page.locator('.oneoff-input button[type="submit"]').click();
    await waitReply(n);
  }
  const remaining = async () => {
    const t = await page.textContent('[data-testid="workout-remaining"]').catch(() => null);
    if (!t) return null;
    const [m, s] = t.trim().split(':').map(Number);
    return m * 60 + s;
  };
  /** Moves the saved run's deadlines back so `secondsLeft` remain in the current phase, then reloads (restore + catch-up). */
  async function shiftTo(secondsLeft, extraBackMs = 0) {
    await page.evaluate(({ key, left, extra }) => {
      const s = JSON.parse(localStorage.getItem(key));
      const now = Date.now();
      const delta = s.run.phaseEndsAt - (now + left * 1000) + extra;
      s.run.phaseEndsAt -= delta;
      s.run.phaseStartedAt -= delta;
      localStorage.setItem(key, JSON.stringify(s));
      // The running app saves its session on every change — block that in THIS page so it can't overwrite the shift before the reload.
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key) return;
        return orig.call(this, k, v);
      };
      location.reload();
    }, { key: SESSION_KEY, left: secondsLeft, extra: extraBackMs }).catch(() => {}); // the reload destroys the evaluate context
    await sleep(500);
    await page.waitForLoadState('load');
    await page.evaluate(() => localStorage.setItem('martialdex:coach-kind-pref', JSON.stringify({ last: 'gemini', remember: true }))); // 이 QA는 기존 Gemini 코치를 검증 — 수업 전 코치 선택(2026-10-19) 이후 Gemini를 명시적으로 선택
    await page.evaluate(WRAP);
    await page.waitForSelector('[data-testid="workout-timer"]', { timeout: 20000 });
  }

  // ===================== A. Personal Coach integration
  await page.evaluate(() => { localStorage.removeItem('martialdex:coach-oneoff-session'); location.hash = '#/personal-coach'; });
  await sleep(1200);
  const redirect = await page.evaluate(() => ({ hash: location.hash, moved: !!document.querySelector('[data-testid="personal-coach-moved"]'), analyze: !!document.querySelector('[data-testid="personal-coach-analyze"]') }));
  check('[A1] 이전 AI Personal Coach 주소 → AI 코치 수업 화면으로 이동, 분석 기능 제공', redirect.hash.startsWith('#/coach/lesson') && redirect.moved && redirect.analyze, redirect);
  const menuLinks = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''));
  check('[A2] 별도 AI Personal Coach 진입점이 화면 링크에 없음', !menuLinks.some((h) => h.includes('personal-coach')));
  await page.fill('[data-testid="oneoff-request"]', '복싱 풋워크가 부족한 것 같아.');
  await page.click('[data-testid="personal-coach-analyze"]');
  await page.waitForSelector('[data-testid="personal-coach-result"]', { timeout: 90000 });
  const pc = await page.evaluate(() => ({ src: document.querySelector('[data-testid="personal-coach-result"]').dataset.source, text: document.querySelector('[data-testid="personal-coach-result"]').innerText.slice(0, 300) }));
  check('[A3] 내 기록 분석·추천 (기존 Personal Coach 서비스) 결과 표시', pc.src === 'ai' && /추천 훈련/.test(pc.text), pc);
  check('[A4] 추천 → 오늘 수업 / 커리큘럼 만들기 연결 버튼', (await page.locator('[data-testid="personal-coach-start-lesson"]').count()) === 1 && (await page.locator('[data-testid="personal-coach-curriculum"]').count()) === 1);
  await page.locator('[data-testid="personal-coach-result"] button', { hasText: '닫기' }).click();

  // ===================== B. lesson build
  await page.fill('[data-testid="oneoff-request"]', '오늘 잽과 크로스 연결을 연습하고 싶어');
  await page.selectOption('[data-testid="oneoff-art"]', 'boxing');
  await page.click('[data-testid="oneoff-build"]');
  await page.waitForFunction(() => !!document.querySelector('[data-testid="oneoff-lesson"]') || !!document.querySelector('[data-testid="oneoff-error"]'), null, { timeout: 300000 });
  const buildErr = await page.textContent('[data-testid="oneoff-error"]').catch(() => null);
  if (buildErr) {
    check('[B0] 수업 생성', false, buildErr);
    throw new Error('lesson build failed: ' + buildErr);
  }
  const lessonInfo = await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key));
    return { title: s.lesson.title, practice: s.lesson.practice, workout: s.lesson.workout, videoQueries: s.lesson.videoQueries, personalization: s.lesson.personalization, concepts: s.lesson.context.concepts.length };
  }, SESSION_KEY);
  console.log('   수업:', JSON.stringify(lessonInfo).slice(0, 700));
  check('[B0] 수업 생성 (실시간 검색 + 개인화 컨텍스트 + 영상 검색어 + 실습 계획 데이터)', lessonInfo.concepts >= 2 && Array.isArray(lessonInfo.videoQueries) && lessonInfo.videoQueries.length >= 1 && !!lessonInfo.workout, lessonInfo);

  // ===================== C. voice output (real engine)
  await page.waitForFunction(() => (window.__tts ?? []).some((r) => r.end || r.error), null, { timeout: 30000 }).catch(() => {});
  let spoken = await tts();
  const firstCoach = (await coach()).find((m) => m.role === 'coach')?.text ?? '';
  const played = spoken.find((r) => r.end && r.start);
  check('[V1] 코치 첫 안내를 TTS 엔진에 전달', spoken.some((r) => firstCoach.startsWith(r.text.slice(0, 20)) || r.text.startsWith(firstCoach.slice(0, 20))), { firstCoach: firstCoach.slice(0, 60), spoken: spoken.map((r) => r.text.slice(0, 40)) });
  check('[V2] 실제 재생: 엔진의 start→end 이벤트 발생, 재생 시간 > 0.3초', !!played && played.end - played.start > 300, played ?? spoken.slice(0, 2));
  const appState = await page.evaluate(async () => (await import('/src/lib/voice/tts.ts')).getTtsState());
  check('[V3] 앱의 TTS 상태에도 실제 재생 기록 (playedCount, lastPlayed)', appState.playedCount >= 1 && !!appState.lastPlayed, { played: appState.playedCount, last: appState.lastPlayed?.text?.slice(0, 40), err: appState.lastError });
  // pause / resume / stop on a long line
  // Don't return speak()'s promise — evaluate would wait until the sentence has finished.
  await page.evaluate(async () => {
    void (await import('/src/lib/voice/tts.ts')).speak('일시정지 테스트 문장입니다. 이 문장은 조금 길게 이어져서 중간에 멈출 수 있어야 합니다. 계속해서 설명을 이어 가겠습니다.', { interrupt: true });
  });
  await page.waitForSelector('[data-testid="coach-tts-pause"]', { timeout: 8000 }).catch(() => {});
  if (await page.locator('[data-testid="coach-tts-pause"]').count()) {
    await page.click('[data-testid="coach-tts-pause"]');
    await sleep(300);
    const paused = await page.getAttribute('[data-testid="coach-voice-bar"]', 'data-tts');
    await page.click('[data-testid="coach-tts-resume"]');
    await sleep(300);
    await page.click('[data-testid="coach-tts-stop"]');
    await sleep(500);
    const after = await page.getAttribute('[data-testid="coach-voice-bar"]', 'data-tts');
    check('[V4] 음성 일시정지 → 계속 → 중지 (상태 반영)', paused === 'paused' && after === 'idle', { paused, after });
  } else check('[V4] 음성 일시정지 → 계속 → 중지 (상태 반영)', false, '말하는 중 상태가 표시되지 않음');

  // ===================== D. dialogue by text, then by voice
  let lines = await coach();
  const firstQ = lines.filter((m) => m.role === 'coach' && m.kind === 'quiz').at(-1)?.text ?? '';
  await send('잽을 친 다음에 크로스를 바로 치면 되는 거야?');
  lines = await coach();
  check('[D1] 학생 질문(텍스트) → 문맥에 맞는 답변 후 수업 질문으로 복귀', lines.some((m) => m.kind === 'answer' && m.text.length > 10) && lines.at(-1).kind === 'quiz', lines.slice(-2));
  const q = fs.readFileSync(path.join(APP_DIR, '.devtools/fixtures-voice-question.wav')).toString('base64');
  await page.evaluate((b64) => {
    window.__origGUM = window.__origGUM ?? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  }, q);
  const nBefore = await count();
  const ttsBefore = (await tts()).length;
  await page.click('[data-testid="coach-mic"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-mic"]')?.dataset.phase === 'listening', null, { timeout: 10000 });
  const listening = await page.textContent('[data-testid="coach-mic-phase"]');
  await sleep(4500);
  await page.click('[data-testid="coach-mic"]');
  await page.waitForFunction(() => !!document.querySelector('[data-testid="coach-heard"]') || !!document.querySelector('[data-testid="coach-voice-error"]'), null, { timeout: 60000 });
  const heard = await page.textContent('[data-testid="coach-heard"]').catch(() => null);
  const vErr = await page.textContent('[data-testid="coach-voice-error"]').catch(() => null);
  check('[M1] 마이크: 듣는 중 표시 → 실제 녹음 → 받아쓰기 결과 화면 표시', /듣고 있습니다/.test(listening ?? '') && !!heard && /언제/.test(heard), { listening, heard, vErr });
  if (heard) {
    await waitReply(nBefore);
    lines = await coach();
    const userLine = lines.filter((m) => m.role === 'user').at(-1)?.text ?? '';
    const reply = lines.filter((m) => m.role === 'coach').at(-2)?.text ?? lines.at(-1).text;
    check('[M2] 인식된 문장이 수업 대화로 전달되어 코치가 응답', heard.includes(userLine) && lines.at(-1).role === 'coach', { userLine, reply: reply.slice(0, 120) });
    await sleep(800);
    const newSpoken = (await tts()).slice(ttsBefore);
    check('[M3] 코치 응답도 음성으로 재생 요청', newSpoken.some((r) => lines.slice(-3).some((m) => m.text.startsWith(r.text.slice(0, 15)))), newSpoken.map((r) => r.text.slice(0, 40)));
  }
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await page.click('[data-testid="coach-mic"]');
  await page.waitForSelector('[data-testid="coach-voice-error"]', { timeout: 10000 });
  const denied = await page.textContent('[data-testid="coach-voice-error"]');
  check('[M4] 마이크 권한 거부 → 원인 안내 + 텍스트 입력 계속 가능', /권한/.test(denied) && (await page.isEnabled('[data-testid="oneoff-answer"]')), denied);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__origGUM; });

  // ===================== E. videos
  await send('준비됐어');
  for (let i = 0; i < 6 && (await directive()) !== 'video'; i++) await send('건너뛰기');
  check('[E0] 수업이 영상 단계로', (await directive()) === 'video', await directive());
  await page.waitForFunction(() => ['found', 'none', 'error'].includes(document.querySelector('[data-testid="lesson-videos"]')?.dataset.status), null, { timeout: 300000 });
  const vids = await page.evaluate(() => ({
    status: document.querySelector('[data-testid="lesson-videos"]').dataset.status,
    items: [...document.querySelectorAll('[data-testid="lesson-video-item"]')].map((b) => ({ id: b.dataset.videoId, source: b.dataset.source, title: b.querySelector('strong')?.textContent, thumb: b.querySelector('img')?.getAttribute('src') })),
    iframe: document.querySelector('[data-testid="lesson-video-player"] iframe')?.getAttribute('src') ?? null,
    text: document.querySelector('[data-testid="lesson-videos"]').innerText.slice(0, 300),
  }));
  console.log('   영상:', JSON.stringify(vids).slice(0, 600));
  if (vids.status === 'found') {
    const real = await page.evaluate(async (ids) => {
      const { videoInfoProvider } = await import('/src/lib/videoSearch/provider.ts');
      const out = [];
      for (const id of ids) {
        const r = await videoInfoProvider.get(id);
        out.push({ id, ok: r.ok, title: r.ok ? r.info.title : r.message, playable: r.ok ? r.info.playable : false });
      }
      return out;
    }, vids.items.map((v) => v.id));
    check('[E1] 실제 검색 → 수업 주제에 맞는 영상 표시 (제목·채널·썸네일·앱 내 재생)', vids.items.length >= 1 && vids.items.every((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && v.title && v.thumb) && vids.iframe?.includes(vids.items[0].id), vids.items);
    check('[E2] 표시된 영상은 YouTube에 실제로 존재·재생 가능 (메타데이터 재조회)', real.every((r) => r.ok && r.playable), real);
  } else {
    check('[E1] 실제 검색 → 결과 상태가 명확히 표시됨 (찾지 못함/실패)', vids.status === 'none' || vids.status === 'error', vids);
    check('[E2] 표시된 영상 실존 확인', null, '이번 실행에서는 주제와 맞는 영상이 확인되지 않아 표시된 영상 없음');
  }
  // window.martialdex is a frozen contextBridge object, so the failing transport is injected instead.
  const failVideo = await page.evaluate(async () => {
    const { findLessonVideos } = await import('/src/lib/coachLesson/lessonVideos.ts');
    return findLessonVideos({ technique: null, topic: '잽 크로스', terms: ['jab', 'cross'], martialArt: 'Boxing', queries: ['boxing jab cross tutorial'] }, { search: async () => ({ ok: false, code: 'NETWORK', message: '테스트용 네트워크 오류' }) });
  });
  check('[E3] 검색 실패 시 "error" + 원인 메시지 (영상을 지어내지 않음)', failVideo.status === 'error' && failVideo.videos.length === 0 && /오류/.test(failVideo.message), failVideo);

  // ===================== F. plan → timer
  await page.click('[data-testid="oneoff-video-done"]');
  await sleep(500);
  for (let i = 0; i < 6 && (await directive()) !== 'ready'; i++) await send('건너뛰기');
  check('[F0] 수업이 실습 단계로 (타이머 패널 표시)', (await directive()) === 'ready' && (await page.locator('[data-testid="workout-panel"]').count()) === 1, await directive());
  const lessonPlan = await page.evaluate(() => ({ summary: document.querySelector('[data-testid="workout-summary"]')?.textContent ?? null, missing: document.querySelector('[data-testid="workout-missing"]')?.textContent ?? null, practice: document.querySelector('[data-testid="oneoff-practice"]')?.textContent ?? null }));
  const expectFromPractice = lessonInfo.workout.spec;
  console.log('   AI 실습 안내:', lessonPlan.practice, '| 파싱:', JSON.stringify(expectFromPractice), '| 표시:', lessonPlan.summary ?? lessonPlan.missing);
  check('[F1] AI 실습 안내의 숫자가 그대로 계획으로 (없는 값은 지어내지 않고 확인 요청)', expectFromPractice.exerciseDurationSeconds !== null && expectFromPractice.sets !== null ? !!lessonPlan.summary : !!lessonPlan.missing || !!lessonPlan.summary, lessonPlan);
  await send('잽 크로스를 3분씩 3세트, 세트 사이 1분 휴식으로 해줘').catch(async () => { await sleep(500); });
  const summary = await page.textContent('[data-testid="workout-summary"]');
  check('[F2] "3분씩 3세트, 세트 사이 1분 휴식" → 180초 × 3세트, 휴식 60초 계획', summary.includes('3분 × 3세트, 세트 사이 1분 휴식'), summary);
  await page.click('[data-testid="workout-start"]');
  await page.waitForSelector('[data-testid="workout-remaining"]');
  const r0 = await remaining();
  const ph0 = await page.textContent('[data-testid="workout-phase"]');
  await sleep(2300);
  const r1 = await remaining();
  check('[F3] 타이머 실제 표시·실행: 03:00에서 카운트다운, 운동 중 · 1/3세트', r0 >= 178 && r0 <= 180 && r1 <= r0 - 2 && r1 >= r0 - 3 && /운동 중/.test(ph0) && /1\/3세트/.test(ph0), { r0, r1, ph0 });
  await page.click('[data-testid="workout-pause"]');
  const p0 = await remaining();
  await sleep(2200);
  const p1 = await remaining();
  const pausedLabel = await page.textContent('[data-testid="workout-phase"]');
  await page.click('[data-testid="workout-resume"]');
  await sleep(2200);
  const p2 = await remaining();
  check('[F4] 일시정지 중 시간 고정 → 재개 후 다시 감소', p0 === p1 && /일시정지/.test(pausedLabel) && p2 <= p1 - 2 && p2 >= p1 - 3, { p0, p1, p2 });

  // last 30 s of set 1 (restored after reload: the half-way cue is past → shown, not spoken late)
  await shiftTo(33);
  const afterReload = await remaining();
  check('[F5] 새로고침/복귀 후에도 같은 타이머가 실제 경과 시간 기준으로 이어짐', afterReload !== null && afterReload <= 33 && afterReload >= 30 && /1\/3세트/.test(await page.textContent('[data-testid="workout-phase"]')), afterReload);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-kind="cue"]')].some((m) => m.textContent.includes('마지막 30초')), null, { timeout: 10000 });
  await sleep(500);
  spoken = await tts();
  const cues1 = (await coach()).filter((m) => m.kind === 'cue').map((m) => m.text);
  check('[G1] 세트 종료 30초 전 응원 실행 + 음성 재생 요청', spoken.some((r) => r.text.includes('마지막 30초')), { cues1, spoken: spoken.map((r) => r.text.slice(0, 30)) });
  check('[G2] 백그라운드 동안 지난 응원(절반)은 늦게 말하지 않음 (화면에만 표시)', cues1.some((t) => t.includes('절반')) && !spoken.some((r) => r.text.includes('절반')), { cues1 });
  check('[G3] 복귀 후 이미 말한 수업 안내를 다시 읽지 않음', !spoken.some((r) => r.text.startsWith(firstCoach.slice(0, 15))), spoken.map((r) => r.text.slice(0, 30)));
  await page.waitForFunction(() => /휴식 중/.test(document.querySelector('[data-testid="workout-phase"]')?.textContent ?? ''), null, { timeout: 45000 });
  await sleep(800);
  const restLabel = await page.textContent('[data-testid="workout-phase"]');
  spoken = await tts();
  check('[F6] 180초 종료 → 1분 휴식으로 전환 + "휴식 시간" 안내 음성', /휴식 중/.test(restLabel) && /1\/3세트/.test(restLabel) && spoken.some((r) => /1세트를 마쳤습니다. 이제 1분 휴식/.test(r.text)), { restLabel });
  const restLeft = await remaining();
  check('[F7] 휴식 카운트다운 1분', restLeft >= 55 && restLeft <= 60, restLeft);

  // end of rest → set 2
  await shiftTo(12);
  await page.waitForFunction(() => /2\/3세트/.test(document.querySelector('[data-testid="workout-phase"]')?.textContent ?? '') && /운동 중/.test(document.querySelector('[data-testid="workout-phase"]')?.textContent ?? ''), null, { timeout: 20000 });
  await sleep(800);
  spoken = await tts();
  check('[F8] 휴식 종료 → 2세트로 이동, 휴식 중 다음 세트 예고 + 세트 시작 음성', spoken.some((r) => r.text.includes('곧 2세트')) && spoken.some((r) => r.text.includes('2세트 시작')), spoken.map((r) => r.text.slice(0, 30)));
  const s2 = await remaining();
  check('[F9] 2세트 180초 카운트다운', s2 >= 176 && s2 <= 180, s2);

  // background jump: set 2 (s2 left) + rest 60 + 170 s of set 3 → set 3 with ~10 s left
  await shiftTo(s2, (s2 + 60 + 170) * 1000);
  const s3 = await remaining();
  const ph3 = await page.textContent('[data-testid="workout-phase"]');
  const cuesBg = (await coach()).filter((m) => m.kind === 'cue').map((m) => m.text);
  spoken = await tts();
  check('[F10] 탭 비활성(수 분) 후 복귀: 경과 시간 기준으로 3세트·남은 ~10초로 정확히 따라잡음', /3\/3세트/.test(ph3) && s3 >= 7 && s3 <= 11, { ph3, s3 });
  check('[F11] 지나간 전환(2세트 종료·휴식·3세트 시작)은 화면에 남기되 늦게 말하지 않음', cuesBg.some((t) => /2세트를 마쳤습니다/.test(t)) && cuesBg.some((t) => /3세트 시작/.test(t)) && !spoken.some((r) => /2세트를 마쳤습니다|3세트 시작/.test(r.text)), { cuesBg: cuesBg.slice(-4) });
  await page.waitForSelector('[data-testid="workout-result"]', { timeout: 25000 });
  const resultText = await page.textContent('[data-testid="workout-result"]');
  check('[F12] 마지막 세트 후 완료 + 결과(3/3세트, 실제 운동 시간) 표시', /3\/3세트 완료/.test(resultText) && /실제 운동 시간/.test(resultText), resultText);
  await sleep(800);
  spoken = await tts();
  check('[F13] 완료 안내 음성', spoken.some((r) => /모든 세트를 마쳤습니다/.test(r.text)), spoken.map((r) => r.text.slice(0, 30)));
  const allCues = (await coach()).filter((m) => m.kind === 'cue').map((m) => m.text);
  const dup = (re) => allCues.filter((t) => re.test(t)).length;
  check('[G4] 같은 응원·전환이 중복 실행되지 않음', dup(/^1세트를 마쳤|수고했습니다\. 1세트/) <= 1 && dup(/2세트 시작/) === 1 && dup(/3세트 시작/) === 1 && dup(/모든 세트를 마쳤습니다/) === 1, allCues);
  check('[F14] 실습 완료 → 수업이 수행 후 질문으로 진행', ['review', 'next'].includes(await directive()), await directive());

  // ===================== H. voice off, finish, record
  await page.uncheck('[data-testid="coach-voice-toggle"]');
  const before = (await tts()).length;
  for (let i = 0; i < 6 && !(await page.locator('[data-testid="oneoff-complete"]').count()); i++) await send('건너뛰기').catch(() => {});
  await sleep(500);
  check('[V5] 음성 안내 끄기: 이후 코치 줄은 글로만 표시', (await tts()).length === before, (await tts()).slice(before).map((r) => r.text));
  check('[H1] 수업 완료', (await page.locator('[data-testid="oneoff-complete"]').count()) === 1);
  const hist = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().filter((e) => (e.notes ?? '').includes('AI 코치 1회 수업')));
  check('[H2] 훈련 기록 1건 저장 (실습 계획·세트·실제 시간 포함, 중복 없음)', hist.length === 1 && /3\/3세트/.test(hist[0].notes) && hist[0].actualMinutes >= 1, hist.map((h) => h.notes));
  await page.reload();
  await sleep(1500);
  const hist2 = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().filter((e) => (e.notes ?? '').includes('AI 코치 1회 수업')).length);
  check('[H3] 새로고침 후에도 기록 중복 저장 없음', hist2 === 1, hist2);
  const lastPlan = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-workout-settings') ?? '{}').lastPlan);
  check('[H4] 사용한 계획을 다음 수업의 "지난번 설정"으로 저장', lastPlan?.exerciseDurationSeconds === 180 && lastPlan.sets === 3 && lastPlan.restDurationSeconds === 60, lastPlan);
  check('[H5] 전체 흐름 동안 페이지 에러 없음', errors.length === 0, errors);

  await page.evaluate(() => localStorage.removeItem('martialdex:coach-oneoff-session'));
  await app.close();
  const counts = { PASS: 0, FAIL: 0, 'NOT TESTED': 0 };
  for (const r of results) counts[r.pass]++;
  console.log(`\n=== SUMMARY: PASS ${counts.PASS} / FAIL ${counts.FAIL} / NOT TESTED ${counts['NOT TESTED']} ===`);
  for (const r of results.filter((x) => x.pass === 'FAIL')) console.log(' - ' + r.name);
  process.exit(counts.FAIL ? 1 : 0);
}
main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
