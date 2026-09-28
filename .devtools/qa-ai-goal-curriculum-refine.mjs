import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  cleanEnv.GEMINI_MODEL = 'gemini-3.5-flash'; // gemini-3.6-flash's free-tier daily quota is exhausted from this session's earlier testing
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 700));

  // spec section 13: "AI에게 다시 만들어달라고 하기" — regenerate with a
  // follow-up request, before saving. Confirms the refinement is actually
  // reflected (fewer training days requested -> lighter intensity/estimatedMinutes,
  // or a level change) rather than just producing an unrelated new curriculum.
  const result = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    const first = await generateGoalCurriculumPreview({
      freeText: '복싱 풋워크가 부족해',
      martialArt: 'boxing',
      durationDays: 30,
      dailyMinutes: 30,
    });
    if (!first.ok) return { firstOk: false, first };

    const refined = await generateGoalCurriculumPreview({
      freeText: '복싱 풋워크가 부족해',
      martialArt: 'boxing',
      durationDays: 30,
      dailyMinutes: 30,
      refinementHistory: ['초보자 수준으로 바꿔줘'],
      skipClarifying: true,
    });
    if (!refined.ok) return { firstOk: true, refinedOk: false, refined };

    return {
      firstOk: true,
      refinedOk: true,
      firstLevel: first.preview.analysis.estimatedLevel,
      refinedLevel: refined.preview.analysis.estimatedLevel,
      refinedSummary: refined.preview.analysis.summary,
    };
  });

  check('[13a] Initial preview generated successfully', result.firstOk, JSON.stringify(result).slice(0, 300));
  check('[13b] Regeneration with "초보자 수준으로 바꿔줘" succeeds', result.refinedOk, JSON.stringify(result).slice(0, 300));
  check('[13c] Regenerated analysis reflects the refinement (level = beginner)', result.refinedLevel === 'beginner', JSON.stringify(result));

  // Also exercise the actual UI regenerate button once, on a cheap durationDays=7 case.
  await page.evaluate(() => {
    location.hash = '#/ai-curriculum';
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.fill('textarea', '주짓수 가드 패스를 잘하고 싶어');
  const selects = await page.$$('select');
  if (selects[0]) await selects[0].selectOption('bjj');
  if (selects[1]) await selects[1].selectOption('7');
  await page.click('button:has-text("AI에게 커리큘럼 만들기")');
  await new Promise((r) => setTimeout(r, 12000));
  let text = await page.evaluate(() => document.body.innerText);
  if (text.includes('추가로 하나만')) {
    await page.click('button:has-text("건너뛰기")');
    await new Promise((r) => setTimeout(r, 10000));
    text = await page.evaluate(() => document.body.innerText);
  }
  check('[13d UI] First preview rendered', text.includes('AI 분석 결과'), text.slice(0, 200));

  await page.fill('input[placeholder*="훈련량을 줄여줘"]', '훈련량을 줄여줘');
  await page.click('button:has-text("AI에게 다시 만들어달라고 하기")');
  await new Promise((r) => setTimeout(r, 12000));
  text = await page.evaluate(() => document.body.innerText);
  check('[13d UI] Regenerated preview shown, and previous request is displayed', text.includes('AI 분석 결과') && text.includes('훈련량을 줄여줘'), text.slice(0, 300));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
