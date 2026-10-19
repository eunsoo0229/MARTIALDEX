// 기준 영상 비교 자세 평가 — real Electron app, real MediaPipe, real Gemini.
//   env -u ELECTRON_RUN_AS_NODE node .devtools/qa-form-compare.mjs
// Requires the Vite dev server on :5173 and GEMINI_API_KEY in .env.
// Fixtures: .devtools/fixtures-form/*.webm — a rigged 3D fighter rendered in
// Blender (scripts/blender/form_fixtures/): a reference jab, the same jab
// 1.6x slower, the same jab with another background/clothing/distance, a
// partially correct jab, a clearly wrong one, a still clip and a side view.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const FX = path.join(APP_DIR, '.devtools/fixtures-form');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 900) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');

async function main() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-form-'))}`, '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    env,
    timeout: 120000,
  });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await sleep(1500);
  const goto = async (hash) => {
    await page.evaluate((h) => (window.location.hash = h), hash);
    await sleep(1500);
  };
  // page helper: base64 → File
  await page.evaluate(() => {
    window.__file = (data, name) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'video/webm' });
  });
  const sample = (name) =>
    page.evaluate(
      async ({ data, name }) => {
        const cc = await import('/src/lib/formCompare/clipCapture.ts');
        const clip = await cc.sampleVideoBlob(window.__file(data, name), { fps: 12 });
        window.__clips = { ...(window.__clips ?? {}), [name]: clip };
        const s = clip.signals;
        return { frames: clip.frames.length, poses: clip.poses.length, segment: s.segment, view: s.cameraView, visible: s.visibleRatio, full: s.fullBodyRatio, issues: s.issues, peak: Math.round(s.peakEnergy * 100) / 100 };
      },
      { data: b64(name), name }
    );

  // ---------- 1. local signals (MediaPipe, no AI) ----------
  const sig = {};
  for (const f of ['jab_reference.webm', 'jab_good.webm', 'jab_good_altlook.webm', 'jab_medium.webm', 'jab_wrong.webm', 'still_noaction.webm', 'jab_reference_side.webm']) sig[f] = await sample(f);
  const ref = sig['jab_reference.webm'];
  check('[1] 기준 영상: 사람·전신 인식, 수행 구간 자동 감지 (펀치 0.63–1.88초 포함)', ref.visible > 0.9 && ref.full > 0.9 && ref.segment && ref.segment.startMs <= 700 && ref.segment.endMs >= 1500 && ref.segment.endMs - ref.segment.startMs < 2400, ref);
  check('[1] 대기 시간이 긴 느린 영상도 수행 구간만 잘라냄 (1.5초 대기 제외)', sig['jab_good.webm'].segment && sig['jab_good.webm'].segment.startMs >= 1100, sig['jab_good.webm'].segment);
  check('[1] 가만히 서 있는 영상 → "기술 수행이 감지되지 않음" (재촬영 안내 대상)', !sig['still_noaction.webm'].segment && sig['still_noaction.webm'].issues.includes('no_movement'), sig['still_noaction.webm']);
  check('[1] 촬영 방향 추정: 정면 / 측면 구분', ref.view === 'front' && sig['jab_reference_side.webm'].view === 'side', { front: ref.view, side: sig['jab_reference_side.webm'].view });

  const fps60 = await page.evaluate(async ({ data }) => {
    const cc = await import('/src/lib/formCompare/clipCapture.ts');
    const clip = await cc.sampleVideoBlob(window.__file(data, 'r60.webm'), { fps: 60 });
    return { n: clip.poses.length, segment: clip.signals.segment, issues: clip.signals.issues };
  }, { data: b64('jab_reference.webm') });
  check('[1] 프레임 속도와 무관한 동작 감지 (60fps로 샘플해도 같은 수행 구간 — 실시간 카메라 조건)', !!fps60.segment && Math.abs(fps60.segment.startMs - ref.segment.startMs) <= 250 && Math.abs(fps60.segment.endMs - ref.segment.endMs) <= 300, { fps12: ref.segment, fps60 });
  const align = await page.evaluate(async () => {
    const m = await import('/src/lib/formCompare/motion.ts');
    const r = window.__clips['jab_reference.webm'];
    const g = window.__clips['jab_good.webm'];
    // full extension: reference frame 28 (1.125 s) ↔ slow clip frame 56 (2.29 s) — fixtures.json
    const a = m.alignTimes(r.poses, r.signals.segment, g.poses, g.signals.segment, [1125]);
    const vw = m.viewWarning('front', window.__clips['jab_reference_side.webm'].signals.cameraView);
    return { refPeak: r.signals.segment.peakMs, userPeak: Math.round(a?.userTimesMs[0] ?? -1), goodPeak: g.signals.segment.peakMs, speed: Math.round(((g.signals.segment.endMs - g.signals.segment.startMs) / (r.signals.segment.endMs - r.signals.segment.startMs)) * 100) / 100, vw };
  });
  check('[1] 속도가 다른 영상 시간 정렬(DTW): 기준의 완전히 뻗은 순간(1.13초) → 느린 영상의 같은 순간(2.29초 ±0.35)', Math.abs(align.userPeak - 2290) <= 350 && align.speed > 1.2, align);
  check('[1] 촬영 방향이 다르면 경고 문구', !!align.vw, align.vw);

  // ---------- 2. score formula (pure) ----------
  const sc = await page.evaluate(async () => {
    const s = await import('/src/lib/formCompare/scoring.ts');
    const criteria = [
      { id: 'C1', phaseId: 'P1', aspect: 'start_posture', description: 'a', importance: 'support', evidence: '' },
      { id: 'C2', phaseId: 'P2', aspect: 'limb_motion', description: 'b', importance: 'core', evidence: '' },
      { id: 'C3', phaseId: 'P2', aspect: 'trajectory', description: 'c', importance: 'core', evidence: '' },
      { id: 'C4', phaseId: 'P3', aspect: 'finish', description: 'd', importance: 'minor', evidence: '' },
    ];
    const phases = [{ id: 'P1', name: '준비' }, { id: 'P2', name: '실행' }, { id: 'P3', name: '회수' }];
    const signals = { visibleRatio: 1, issues: [] };
    const j = (verdicts, extra = {}) => ({ sameTechnique: true, techniquePerformed: true, criteria: verdicts.map((v, i) => ({ criterionId: `C${i + 1}`, verdict: v, confidence: 'high', observation: '', referenceObservation: '' })), phases: [], strengths: [], differences: [], focus: [], drills: [], limitations: [], ...extra });
    const run = (verdicts, extra, sig = signals) => s.scoreComparison({ criteria, phases, judgement: j(verdicts, extra), signals: sig, viewMatches: true });
    return {
      perfect: run(['match', 'match', 'match', 'match']),
      oneCore: run(['match', 'mismatch', 'match', 'match']),
      twoCore: run(['match', 'mismatch', 'mismatch', 'match']),
      partial: run(['match', 'partial', 'match', 'partial']),
      supportPartial: run(['partial', 'match', 'match', 'partial']),
      corePartials: run(['match', 'partial', 'partial', 'match']),
      missPlusPartial: run(['match', 'mismatch', 'partial', 'match']),
      hidden: run(['not_observable', 'match', 'not_observable', 'not_observable']),
      other: run(['match', 'match', 'match', 'match'], { sameTechnique: false }),
      none: run(['match', 'match', 'match', 'match'], { techniquePerformed: false }),
      dark: run(['match', 'match', 'match', 'match'], {}, { visibleRatio: 0.2, issues: [] }),
    };
  });
  check('[2] 점수 = 가중 평균(핵심3·중요2·세부1) — 모두 일치 100, 부분 일치 반영', sc.perfect.score === 100 && sc.supportPartial.score === Math.round((100 * (2 * 0.5 + 3 + 3 + 1 * 0.5)) / 9), { perfect: sc.perfect.score, supportPartial: sc.supportPartial.score });
  check('[2] 핵심 결손 = 불일치 1 + 부분 0.5: 부분 2개 → 최대 70, 불일치 1 + 부분 1 → 최대 70', sc.corePartials.cap?.value === 70 && sc.corePartials.score <= 70 && sc.missPlusPartial.cap?.value === 70, { cp: [sc.corePartials.rawScore, sc.corePartials.score], mp: [sc.missPlusPartial.rawScore, sc.missPlusPartial.score] });
  check('[2] 핵심 기준이 부분 일치면 최대 85', sc.partial.rawScore === Math.round((100 * (2 + 3 * 0.5 + 3 + 1 * 0.5)) / 9) && sc.partial.score === Math.min(85, sc.partial.rawScore) && sc.partial.cap?.value === 85, sc.partial);
  check('[2] 겉모습이 비슷해도 핵심 기준 불일치는 상한(1개 → 70, 2개 → 50)', sc.oneCore.score <= 70 && sc.oneCore.cap?.value === 70 && sc.twoCore.score <= 50, { one: [sc.oneCore.rawScore, sc.oneCore.score], two: [sc.twoCore.rawScore, sc.twoCore.score] });
  check('[2] 안 보이는 기준은 맞았다고 하지 않음 → 관찰 비중 부족이면 평가 불가', sc.hidden.status === 'insufficient' && sc.hidden.score === null, sc.hidden);
  check('[2] 다른 기술 / 기술 미수행 / 사람 인식 부족 → 점수 없음', sc.other.status === 'different_technique' && sc.none.status === 'not_performed' && sc.dark.status === 'insufficient' && sc.dark.score === null, [sc.other.status, sc.none.status, sc.dark.status]);

  // ---------- 3. reference registration ----------
  const yt = await page.evaluate(async () => {
    const svc = await import('/src/lib/formCompare/service.ts');
    return { bad: await svc.checkYoutubeReference('https://example.com/video'), missing: await svc.checkYoutubeReference('https://www.youtube.com/watch?v=zzzzzzzzzz0'), real: await svc.checkYoutubeReference('https://www.youtube.com/watch?v=4YvY1bObBCs') };
  });
  check('[3] 잘못된 주소 / 존재하지 않거나 재생 불가 영상은 등록 거부', !yt.bad.ok && !yt.missing.ok, { bad: yt.bad.message, missing: yt.missing.message });
  check('[3] 실제 공개 영상은 재생 가능 확인 + 제목·길이', yt.real.ok && yt.real.lengthSeconds > 30, yt.real);

  const fileRef = await page.evaluate(async ({ data }) => {
    const svc = await import('/src/lib/formCompare/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique('kickboxing__jab');
    const tooLong = await svc.registerFileReference(t, { file: window.__file(data, 'jab_reference.webm'), startSeconds: 3, endSeconds: 45, cameraView: 'front' });
    const reg = await svc.registerFileReference(t, { file: window.__file(data, 'jab_reference.webm'), startSeconds: 0, endSeconds: 2.5, cameraView: 'front' });
    if (!reg.ok) return { reg };
    const t0 = Date.now();
    const prof = await svc.ensureProfile(t, reg.reference);
    return { tooLong: tooLong.ok ? 'accepted' : tooLong.message, reg: { ok: true, id: reg.reference.id }, ms: Date.now() - t0, prof: prof.ok ? prof.reference.profile : prof };
  }, { data: b64('jab_reference.webm') });
  const p = fileRef.prof;
  check('[3] 기준 영상 파일 등록 (영상 밖 구간은 거부)', fileRef.reg?.ok && typeof fileRef.tooLong === 'string', fileRef.tooLong);
  check('[3] 기준 영상만으로 평가 기준 자동 생성 — 단계·기준·중요도·근거 (관절 각도 수작업 없음)', !!p?.criteria && p.criteria.length >= 3 && p.phases.length >= 2 && p.criteria.some((c) => c.importance === 'core') && p.criteria.every((c) => c.description && !/\d+\s*(도|°)/.test(c.description)) && p.matchesTechnique, { ms: fileRef.ms, phases: p?.phases?.map((x) => x.name), criteria: p?.criteria?.map((c) => `${c.importance}:${c.description}`), excluded: p?.excluded });

  // ---------- 4. comparisons (real AI) ----------
  const compare = (name) =>
    page.evaluate(async ({ refId, name }) => {
      const svc = await import('/src/lib/formCompare/service.ts');
      const store = await import('/src/lib/formCompare/referenceStore.ts');
      const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
      const t0 = Date.now();
      const r = await svc.compareAttempt(resolveTechnique('kickboxing__jab'), store.getReference(refId), window.__clips[name]);
      if (!r.ok) return { ok: false, message: r.message, retake: r.retake ?? null };
      const rec = r.outcome.record;
      return {
        ok: true,
        ms: Date.now() - t0,
        status: rec.breakdown.status,
        score: rec.breakdown.score,
        raw: rec.breakdown.rawScore,
        cap: rec.breakdown.cap,
        reliability: rec.breakdown.reliability,
        align: rec.alignment,
        view: rec.viewWarning,
        verdicts: rec.judgement.criteria.map((c) => `${c.criterionId}:${c.verdict}/${c.confidence}`),
        differences: rec.judgement.differences.map((d) => d.what),
        focus: rec.judgement.focus,
        userFrames: r.outcome.userFrames.map((f) => `${f.tMs}:${f.note}`),
        refFrames: r.outcome.refFrames.length,
        hints: rec.poseHints ?? [],
        agreement: rec.judgement.agreement,
      };
    }, { refId: fileRef.reg.id, name });

  const res = {};
  for (const f of ['jab_good.webm', 'jab_good_altlook.webm', 'jab_medium.webm', 'jab_wrong.webm']) {
    res[f] = await compare(f);
    console.log(`  · ${f}: ${JSON.stringify(res[f]).slice(0, 1200)}`);
  }
  const s = (f) => (res[f]?.ok ? res[f].score : null);
  check('[4] 좋은 수행(1.6배 느림) → 점수 + DTW 정렬', res['jab_good.webm'].ok && res['jab_good.webm'].status === 'scored' && s('jab_good.webm') >= 70 && res['jab_good.webm'].align.method === 'dtw', res['jab_good.webm']);
  check('[4] 배경·복장·거리만 다른 좋은 수행 → 불필요한 감점 없음 (좋은 수행과 15점 이내)', s('jab_good_altlook.webm') !== null && Math.abs(s('jab_good_altlook.webm') - s('jab_good.webm')) <= 15, [s('jab_good.webm'), s('jab_good_altlook.webm')]);
  check('[4] 부정확한 수행 → 낮은 점수 + 다른 부분·이유 피드백', s('jab_wrong.webm') !== null ? s('jab_wrong.webm') <= s('jab_good.webm') - 25 && res['jab_wrong.webm'].differences.length >= 1 : res['jab_wrong.webm'].ok && res['jab_wrong.webm'].status !== 'scored', res['jab_wrong.webm']);
  check('[4] 점수 순서: 좋음 ≥ 중간 ≥ 부정확', s('jab_medium.webm') !== null && s('jab_good.webm') >= s('jab_medium.webm') && s('jab_medium.webm') >= (s('jab_wrong.webm') ?? 0), [s('jab_good.webm'), s('jab_medium.webm'), s('jab_wrong.webm')]);
  const med2 = await compare('jab_medium.webm');
  console.log(`  · jab_medium (2nd): ${JSON.stringify(med2).slice(0, 900)}`);
  check('[4] 중간 수행 재평가 일관성 — 두 번 모두 좋은 수행보다 확실히 낮고(10점 이상) 점수 차 ≤ 15', s('jab_medium.webm') !== null && med2.score !== null && s('jab_good.webm') - Math.max(s('jab_medium.webm'), med2.score) >= 10 && Math.abs(med2.score - s('jab_medium.webm')) <= 15, [s('jab_good.webm'), s('jab_medium.webm'), med2.score]);
  check('[4] 자동 보조 신호가 중간 수행의 실제 결함(뒷손 = 오른손이 아래로)을 찾아냄 — 기술별 설정 없이', res['jab_medium.webm'].hints.some((h) => /오른손목/.test(h) && /아래로/.test(h)), res['jab_medium.webm'].hints);
  const again = await compare('jab_good.webm');
  console.log(`  · jab_good (2nd): ${JSON.stringify(again).slice(0, 900)}`);
  check('[4] 같은 영상 재평가 일관성 (점수 차 ≤ 15)', again.ok && s('jab_good.webm') !== null && again.score !== null && Math.abs(again.score - s('jab_good.webm')) <= 15, [s('jab_good.webm'), again.score]);
  const still = await compare('still_noaction.webm');
  check('[4] 기술 수행이 없는 영상 → AI 호출 없이 재촬영 안내', !still.ok && (still.retake ?? []).includes('no_movement'), still);
  const side = await compare('jab_reference_side.webm');
  check('[4] 촬영 방향이 다른 영상 → 경고 표시 + 신뢰도 반영', side.ok && !!side.view && side.reliability !== 'high', side);

  // ---------- 5. records ----------
  const recs = await page.evaluate(async () => {
    const store = await import('/src/lib/formCompare/referenceStore.ts');
    const pose = await import('/src/lib/poseAnalysis/recordsService.ts');
    const list = store.listCompareRecords('kickboxing__jab');
    const poseRecs = pose.getRecordsForTechnique('kickboxing__jab').filter((r) => r.method === 'video_compare');
    const raw = localStorage.getItem('martialdex:form-compare-records') ?? '';
    return { n: list.length, scored: list.filter((r) => r.breakdown.score !== null).length, pose: poseRecs.length, linked: poseRecs.every((r) => list.some((c) => c.poseRecordId === r.recordId)), hasImages: /data:image/.test(raw), summary: pose.getTechniqueSkillSummary('kickboxing__jab') };
  });
  check('[5] 평가 기록 저장 + 기존 자세 분석 기록·숙련도 요약과 연결 (점수 있는 것만)', recs.n >= 6 && recs.pose === recs.scored && recs.linked && recs.summary.analysisCount === recs.pose, recs);
  check('[5] 기록에 영상·프레임 이미지는 저장하지 않음', !recs.hasImages);

  // ---------- 6. YouTube reference (Gemini reads the public video by URL) ----------
  const ytRef = await page.evaluate(async () => {
    const svc = await import('/src/lib/formCompare/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique('kickboxing__jab');
    const reg = await svc.registerYoutubeReference(t, { url: 'https://www.youtube.com/watch?v=4YvY1bObBCs', startSeconds: 47, endSeconds: 57, cameraView: 'front' });
    if (!reg.ok) return { reg };
    const prof = await svc.ensureProfile(t, reg.reference);
    if (!prof.ok) return { prof };
    const cmp = await svc.compareAttempt(t, prof.reference, window.__clips['jab_good.webm']);
    return { id: reg.reference.id, criteria: prof.reference.profile.criteria.map((c) => `${c.importance}:${c.description}`), view: prof.reference.profile.cameraView, cmp: cmp.ok ? { status: cmp.outcome.record.breakdown.status, score: cmp.outcome.record.breakdown.score, align: cmp.outcome.record.alignment.method, rel: cmp.outcome.record.breakdown.reliability } : cmp };
  });
  check('[6] YouTube 기준 영상: 공개 영상 구간을 Gemini가 직접 분석해 평가 기준 생성', (ytRef.criteria ?? []).length >= 3, ytRef);
  check('[6] YouTube 기준과 내 영상 비교 실행 (수행 구간 기준 시간 정렬)', ytRef.cmp?.align === 'segment' && ['scored', 'insufficient'].includes(ytRef.cmp.status), ytRef.cmp);

  // ---------- 7. UI: technique page → reference → upload attempt → result ----------
  await goto('#/arts/kickboxing/techniques/kickboxing__jab');
  await page.locator('[data-testid="form-compare-open"]').click();
  await page.locator('[data-testid="form-compare"]').waitFor({ timeout: 10000 });
  const refUi = await page.evaluate(() => ({ step: document.querySelector('[data-testid="form-compare"]')?.dataset.step, profile: document.querySelectorAll('[data-testid="form-profile-criteria"] li').length, picks: document.querySelectorAll('[data-testid="form-ref-pick"]').length }));
  // pick the file reference (side-by-side frames)
  const picks = page.locator('[data-testid="form-ref-pick"]');
  for (let i = 0; i < (await picks.count()); i++)
    if (/jab_reference/.test((await picks.nth(i).textContent()) ?? '')) {
      await picks.nth(i).click();
      break;
    }
  const picked = await page.evaluate(() => document.querySelectorAll('[data-testid="form-profile-criteria"] li').length);
  check('[7] 기술 상세 → 기준 영상 비교: 등록한 기준 영상 목록·선택, 자동 평가 기준 표시', refUi.step === 'reference' && refUi.picks >= 2 && picked >= 3, { ...refUi, picked });
  await page.locator('[data-testid="form-ref-next"]').click();
  await page.locator('[data-testid="form-capture"]').waitFor();
  const guide = await page.textContent('[data-testid="form-capture-guide"]');
  check('[7] 촬영 전 안내: 기준 영상 촬영 방향 + 전신 + 준비 자세', /정면/.test(guide) && /몸 전체/.test(guide), guide);
  await page.locator('[data-testid="form-capture-file-mode"]').click();
  fs.writeFileSync(path.join(os.tmpdir(), 'qa-jab-medium.webm'), fs.readFileSync(path.join(FX, 'jab_medium.webm')));
  await page.locator('[data-testid="form-capture-file"]').setInputFiles(path.join(os.tmpdir(), 'qa-jab-medium.webm'));
  await page.locator('[data-testid="form-result"]').waitFor({ timeout: 180000 });
  const ui = await page.evaluate(() => ({
    status: document.querySelector('[data-testid="form-result"]')?.dataset.status,
    score: document.querySelector('[data-testid="form-score"]')?.textContent ?? document.querySelector('[data-testid="form-score-none"]')?.textContent,
    criteria: document.querySelectorAll('[data-testid="form-criteria-results"] li').length,
    frames: document.querySelectorAll('[data-testid="form-frames"] figure').length,
    pairs: document.querySelectorAll('[data-testid="form-frames"] figure img').length,
    userVideo: !!document.querySelector('[data-testid="form-user-video"]'),
    reliability: document.querySelector('[data-testid="form-reliability"]')?.textContent ?? '',
    focus: !!document.querySelector('[data-testid="form-focus"], [data-testid="form-differences"]'),
  }));
  check('[7] 결과 화면: 종합 점수·신뢰도·기준별 비교·단계별 기준/내 프레임 나란히·내 영상 재생·피드백', !!ui.score && ui.criteria >= 3 && ui.frames >= 3 && ui.pairs > ui.frames && ui.userVideo && /분석 신뢰도/.test(ui.reliability) && ui.focus, ui);

  // live camera: the "camera" is the slow good jab looping (getUserMedia replaced by a video stream)
  await page.locator('[data-testid="form-retry"]').click();
  await page.evaluate(async ({ data }) => {
    const v = document.createElement('video');
    v.src = URL.createObjectURL(window.__file(data, 'cam.webm'));
    v.muted = true;
    v.loop = true;
    // attached + visible, or Chromium may throttle a detached video and freeze its captureStream
    v.style.cssText = 'position:fixed;right:0;bottom:0;width:160px;height:120px;z-index:9999;opacity:0.01';
    document.body.appendChild(v);
    await v.play();
    window.__camVideo = v;
    navigator.mediaDevices.getUserMedia = async () => v.captureStream();
  }, { data: b64('jab_good.webm') });
  await page.locator('[data-testid="form-capture-camera"]').click();
  await page.locator('[data-testid="form-camera-start"]').click();
  await page.locator('[data-testid="form-record-start"]').waitFor({ timeout: 30000 });
  await sleep(1500);
  const live = await page.evaluate(() => document.querySelector('[data-testid="form-live-check"]')?.dataset);
  check('[7] 카메라 촬영: 전신이 화면에 들어오는지 실시간 확인', live?.full === 'true', live);
  await page.locator('[data-testid="form-record-start"]').click();
  await page.locator('[data-testid="form-result"], [data-testid="form-retake"]').first().waitFor({ timeout: 240000 });
  const liveRes = await page.evaluate(() => ({ status: document.querySelector('[data-testid="form-result"]')?.dataset.status ?? null, retake: document.querySelector('[data-testid="form-retake"]')?.textContent ?? null, video: !!document.querySelector('[data-testid="form-user-video"]') }));
  check('[7] 카메라로 촬영 → 비교 결과 (녹화 영상 재생 포함)', liveRes.status !== null && liveRes.video, liveRes);
  await page.locator('[data-testid="form-close"]').click();

  // invalid URL in the UI
  await page.locator('[data-testid="form-compare-open"]').click();
  await page.locator('[data-testid="form-ref-add"]').click();
  await page.fill('[data-testid="form-ref-url"]', 'https://www.youtube.com/watch?v=zzzzzzzzzz0');
  await page.fill('[data-testid="form-ref-end"]', '10');
  await page.locator('[data-testid="form-ref-save"]').click();
  await page.locator('[data-testid="form-error"]').waitFor({ timeout: 30000 });
  check('[7] 화면에서 재생 불가 영상 주소 입력 → 오류 안내', /영상/.test((await page.textContent('[data-testid="form-error"]')) ?? ''));
  await page.locator('[data-testid="form-close"]').click();

  // existing feature untouched
  await goto('#/arts/boxing/techniques/boxing__jab');
  const legacy = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /내 자세 분석하기/.test(b.textContent)) && !!document.querySelector('[data-testid="form-compare-open"]'));
  check('[8] 기존 관절 지표 분석 버튼 유지 + 새 비교 평가 버튼', legacy);

  // ---------- 9. Android / web transport: no Electron bridge → the deployed gemini-ask Edge Function ----------
  const winP = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }) => {
    const w = new BrowserWindow({ width: 1100, height: 900, webPreferences: { contextIsolation: true } }); // no preload = no window.martialdex
    void w.loadURL('http://localhost:5173/');
  });
  const web = await winP;
  await web.waitForLoadState('load');
  await sleep(2500);
  const webRes = await web.evaluate(async ({ ref, user }) => {
    if (window.martialdex) return { error: 'bridge present' };
    const mk = (d, n) => new File([Uint8Array.from(atob(d), (c) => c.charCodeAt(0))], n, { type: 'video/webm' });
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const su = await supabase.auth.signUp({ email: `qa-form-${Date.now()}@martialdex-test.local`, password: 'QaForm!2026x' });
    if (!su.data.session) return { error: 'signup failed: ' + (su.error?.message ?? 'no session') };
    const svc = await import('/src/lib/formCompare/service.ts');
    const cc = await import('/src/lib/formCompare/clipCapture.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique('kickboxing__jab');
    const reg = await svc.registerFileReference(t, { file: mk(ref, 'ref.webm'), startSeconds: 0, endSeconds: 2.5, cameraView: 'front' });
    if (!reg.ok) return { error: reg.message };
    const prof = await svc.ensureProfile(t, reg.reference);
    if (!prof.ok) return { error: prof.message };
    const out = {};
    for (const [name, data] of Object.entries(user)) {
      const clip = await cc.sampleVideoBlob(mk(data, name), { fps: 12 });
      const r = await svc.compareAttempt(t, prof.reference, clip);
      out[name] = r.ok ? { score: r.outcome.record.breakdown.score, status: r.outcome.record.breakdown.status, verdicts: r.outcome.record.judgement.criteria.map((c) => c.verdict) } : { error: r.message };
    }
    await supabase.auth.signOut();
    return { criteria: prof.reference.profile.criteria.length, out };
  }, { ref: b64('jab_reference.webm'), user: { good: b64('jab_good.webm'), wrong: b64('jab_wrong.webm') } });
  console.log(`  · edge transport: ${JSON.stringify(webRes).slice(0, 900)}`);
  check('[9] Android/웹 전송 경로(배포된 gemini-ask Edge Function, Electron 브리지 없음): 기준 생성 + 비교 실행, 좋은 수행 > 부정확한 수행', !webRes.error && webRes.criteria >= 2 && webRes.out.good.score !== null && webRes.out.good.score !== undefined && (webRes.out.wrong.score ?? 0) < webRes.out.good.score, webRes);

  check('[Z] 페이지 에러 없음', errors.length === 0, errors);
  await app.close();
  const passed = results.filter((x) => x.pass).length;
  console.log(`=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed !== results.length) console.log('FAILURES:', results.filter((x) => !x.pass).map((x) => x.name));
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
