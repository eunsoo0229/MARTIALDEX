// MARTIALDEX 통합 기능 개선 — 신규 기능 회귀/기능 테스트
// (영상 탐색/저장, AI 학습기술 제외, 헬스 세트별 무게, 해시태그, 댓글 답글)
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-qa-'))}`], env: cleanEnv, timeout: 120000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);

  // ---- 1. 해시태그 추출/정규화 (순수 함수) ----
  const hashtagResult = await page.evaluate(async () => {
    const { extractHashtags, normalizeHashtag, postHasHashtag } = await import('/src/lib/communityPost/hashtags.ts');
    return {
      extracted: extractHashtags('오늘 BJJ 스파링함 #BJJ #스파링 #레슬링 그리고 #BJJ 다시'),
      normalized: [normalizeHashtag('BJJ'), normalizeHashtag('bjj')],
      hasTag: postHasHashtag('#BJJ 스파링', 'bjj'),
      noTag: postHasHashtag('오늘 훈련함', 'bjj'),
    };
  });
  check('[해시태그] 본문에서 실제 해시태그만 추출, 중복 제거', JSON.stringify(hashtagResult.extracted) === JSON.stringify(['BJJ', '스파링', '레슬링']), hashtagResult.extracted);
  check('[해시태그] 대소문자 무관 정규화 (#BJJ == #bjj)', hashtagResult.normalized[0] === hashtagResult.normalized[1], hashtagResult.normalized);
  check('[해시태그] postHasHashtag 대소문자 무관 매칭', hashtagResult.hasTag === true && hashtagResult.noTag === false, hashtagResult);

  // ---- 2. 헬스 루틴 세트별 무게: 레거시 scalar -> per-set 배열 정규화 ----
  const gymNormalizeResult = await page.evaluate(async () => {
    const { gymRoutineRepository } = await import('/src/lib/gymRoutine/repository.ts');
    const legacyRoutine = {
      id: 'qa-legacy-routine',
      name: 'QA 레거시',
      days: [
        {
          weekday: 1,
          exercises: [
            { techniqueId: 'bench-press', targetSets: 3, targetReps: 10, targetSeconds: null, targetWeightKg: 40, restSeconds: 90 },
          ],
        },
      ],
    };
    // save() normalizes on write, list()/get() normalize on read — write then read back
    gymRoutineRepository.save(legacyRoutine);
    const loaded = gymRoutineRepository.get('qa-legacy-routine');
    return { targetReps: loaded.days[0].exercises[0].targetReps, targetWeightKg: loaded.days[0].exercises[0].targetWeightKg };
  });
  check(
    '[헬스] 레거시 scalar targetWeightKg(40)가 세트 수만큼 배열([40,40,40])로 업그레이드됨',
    JSON.stringify(gymNormalizeResult.targetWeightKg) === JSON.stringify([40, 40, 40]),
    gymNormalizeResult
  );
  check('[헬스] targetReps도 동일하게 정규화됨', JSON.stringify(gymNormalizeResult.targetReps) === JSON.stringify([10, 10, 10]), gymNormalizeResult.targetReps);

  // ---- 3. setSetWeight / setAllSetsWeight — 세트별 다른 무게 지정 ----
  const perSetWeightResult = await page.evaluate(async () => {
    const { gymRoutineRepository } = await import('/src/lib/gymRoutine/repository.ts');
    const { setSetWeight } = await import('/src/lib/gymRoutine/service.ts');
    let routine = gymRoutineRepository.get('qa-legacy-routine');
    routine = setSetWeight(routine, 1, 0, 0, 40);
    routine = setSetWeight(routine, 1, 0, 1, 45);
    routine = setSetWeight(routine, 1, 0, 2, 50);
    return routine.days[0].exercises[0].targetWeightKg;
  });
  check(
    '[헬스] 세트별로 다른 무게 저장 가능 (1세트40/2세트45/3세트50 — spec 예시 그대로)',
    JSON.stringify(perSetWeightResult) === JSON.stringify([40, 45, 50]),
    perSetWeightResult
  );

  // ---- 4. computeCarryForwardTarget — 계획된 per-set 무게가 실제 이전 세트값보다 우선 ----
  const carryForwardResult = await page.evaluate(async () => {
    const { computeCarryForwardTarget } = await import('/src/components/GymSetInput.tsx');
    const sets = [{ completed: true, actualReps: 10, weightKg: 40 }, { completed: false, actualReps: null, weightKg: null }];
    // set 1 completed at 40kg; set 2's PLANNED weight is 50kg (pyramid) — should prefill 50, not carry the 40 forward
    const withPlan = computeCarryForwardTarget(sets, 1, { targetWeightKg: 40, targetReps: 10, weightPerSet: [40, 50, 55] });
    // without a plan, old behavior (carry the actual forward) is preserved
    const withoutPlan = computeCarryForwardTarget(sets, 1, { targetWeightKg: 40, targetReps: 10 });
    return { withPlan, withoutPlan };
  });
  check(
    '[헬스] weightPerSet 계획이 있으면 그 계획값을 사용 (실제 이전 세트값으로 덮어쓰지 않음)',
    carryForwardResult.withPlan.weightKg === 50,
    carryForwardResult.withPlan
  );
  check(
    '[헬스] weightPerSet 계획이 없으면 기존처럼 이전 세트 실제값을 carry-forward (회귀 없음)',
    carryForwardResult.withoutPlan.weightKg === 40,
    carryForwardResult.withoutPlan
  );
  await page.evaluate(async () => {
    const { deleteGymRoutine } = await import('/src/lib/gymRoutine/service.ts');
    deleteGymRoutine('qa-legacy-routine');
  });

  // ---- 5. AI 커리큘럼 "이미 학습한 기술 제외" — fallbackTechniquePool 순수 로직 (Gemini 호출 없음) ----
  const excludeLearnedResult = await page.evaluate(async () => {
    const { fallbackTechniquePool } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const withoutMastery = fallbackTechniquePool('wrestling', 'beginner', { limit: 20 });
    const masteryMap = new Map(withoutMastery.slice(0, 3).map((m) => [m.techniqueId, 'proficient']));
    const withExclude = fallbackTechniquePool('wrestling', 'beginner', { limit: 20, masteryByTechniqueId: masteryMap, excludeLearned: true });
    const stillPresent = withExclude.filter((m) => masteryMap.has(m.techniqueId));
    return { markedLearnedCount: masteryMap.size, stillPresentAfterExclude: stillPresent.length, totalWithout: withoutMastery.length, totalWith: withExclude.length };
  });
  check(
    '[AI 커리큘럼] excludeLearned:true 시 이미 학습한(proficient) 기술이 후보 풀에서 완전히 제외됨',
    excludeLearnedResult.stillPresentAfterExclude === 0 && excludeLearnedResult.markedLearnedCount > 0,
    excludeLearnedResult
  );

  // ---- 6. techniqueVideo service — 로컬 저장/조회 round-trip (순수) ----
  const videoPickResult = await page.evaluate(async () => {
    const { saveTechniqueVideoPick, getTechniqueVideoPick, clearTechniqueVideoPick } = await import('/src/lib/techniqueVideo/service.ts');
    const before = getTechniqueVideoPick('qa-test-technique-id');
    saveTechniqueVideoPick('qa-test-technique-id', [{ title: 'QA Test Video', videoId: 'abc123', channel: 'QA Channel' }]);
    const after = getTechniqueVideoPick('qa-test-technique-id');
    clearTechniqueVideoPick('qa-test-technique-id');
    const afterClear = getTechniqueVideoPick('qa-test-technique-id');
    return { before, after, afterClear };
  });
  check('[영상] 저장 전에는 pick 없음', videoPickResult.before === undefined, videoPickResult.before);
  check(
    '[영상] saveTechniqueVideoPick 후 getTechniqueVideoPick으로 즉시 조회 가능',
    videoPickResult.after?.videos?.[0]?.videoId === 'abc123' && videoPickResult.after?.source === 'user_selected',
    videoPickResult.after
  );
  check('[영상] clearTechniqueVideoPick 후 다시 없음', videoPickResult.afterClear === undefined, videoPickResult.afterClear);

  // ---- 7. 실제 Supabase — 댓글 답글 + technique_video_picks 실제 DB round-trip ----
  const testEmail = `qa-integration-${Date.now()}@martialdex-test.local`;
  const signup = await page.evaluate(async ({ email, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { ok: !error, hasSession: !!data?.session, userId: data?.user?.id ?? null };
  }, { email: testEmail, password: 'QaTest!2026Integration' });
  check('[Supabase] 실제 테스트 계정 로그인 세션 확보', signup.ok && signup.hasSession, signup);

  if (signup.ok && signup.hasSession) {
    // technique_video_picks 실제 DB 저장/조회 (migration 0029 + RLS 검증)
    const dbVideoPick = await page.evaluate(async (userId) => {
      const { supabase } = await import('/src/lib/supabase/client.ts');
      const { syncTechniqueVideoPicksBidirectional } = await import('/src/lib/cloudSync/techniqueVideoPickSync.ts');
      const { saveTechniqueVideoPick } = await import('/src/lib/techniqueVideo/service.ts');
      saveTechniqueVideoPick('qa-db-technique-id', [{ title: 'DB QA Video', videoId: 'xyz789', channel: 'DB QA Channel' }]);
      const syncResult = await syncTechniqueVideoPicksBidirectional(userId);
      const { data, error } = await supabase.from('technique_video_picks').select('*').eq('technique_id', 'qa-db-technique-id').eq('user_id', userId).maybeSingle();
      return { syncOk: syncResult.ok, pushed: syncResult.ok ? syncResult.data.pushed : 0, dbRow: data, dbError: error?.message };
    }, signup.userId);
    check('[Supabase] technique_video_picks 실제 push 성공 (migration 0029 실동작 확인)', dbVideoPick.syncOk && dbVideoPick.pushed >= 1, dbVideoPick);
    check('[Supabase] 실제 DB row에 저장된 videoId 일치', dbVideoPick.dbRow?.data?.videos?.[0]?.videoId === 'xyz789', dbVideoPick.dbRow);

    // 댓글 답글 실제 DB round-trip (migration 0030 트리거 검증)
    const replyResult = await page.evaluate(async ({ userId, nickname }) => {
      const { createPost, addComment, listComments, listReplies, deleteComment, deletePost } = await import('/src/lib/communityPost/service.ts');
      const postResult = await createPost({ authorId: userId, authorNickname: nickname, content: '통합 QA 테스트 게시물', media: [], gym: null, curriculumSnapshot: null });
      if (!postResult.ok) return { error: postResult.message };
      const post = postResult.data;

      const topLevel = await addComment(post.id, userId, nickname, '최상위 댓글입니다');
      if (!topLevel.ok) return { error: topLevel.message };
      const reply1 = await addComment(post.id, userId, nickname, '답글 1', topLevel.data.id);
      const reply2 = await addComment(post.id, userId, nickname, '답글 2', topLevel.data.id);

      const topLevelList = await listComments(post.id);
      const repliesList = await listReplies(topLevel.data.id);

      // reply_count 트리거가 실제로 반영됐는지 재조회로 확인 (캐시 아님)
      const refetchedTopLevel = await listComments(post.id);
      const refetchedComment = refetchedTopLevel.ok ? refetchedTopLevel.data.comments.find((c) => c.id === topLevel.data.id) : null;

      // 답글 하나 삭제 후 reply_count가 줄어드는지 확인
      await deleteComment(reply1.data.id, userId);
      const afterDelete = await listComments(post.id);
      const afterDeleteComment = afterDelete.ok ? afterDelete.data.comments.find((c) => c.id === topLevel.data.id) : null;

      await deletePost(post.id, userId, []);

      return {
        topLevelIncludesOnlyParent: topLevelList.ok && topLevelList.data.comments.length === 1 && topLevelList.data.comments[0].id === topLevel.data.id,
        repliesCount: repliesList.ok ? repliesList.data.length : -1,
        replyCountAfterAdd: refetchedComment?.replyCount,
        replyCountAfterDelete: afterDeleteComment?.replyCount,
      };
    }, { userId: signup.userId, nickname: 'QA통합테스트' });

    if (replyResult.error) {
      check('[댓글] 답글 테스트 준비 실패', false, replyResult.error);
    } else {
      check('[댓글] listComments는 최상위 댓글만 반환 (답글 제외)', replyResult.topLevelIncludesOnlyParent, replyResult);
      check('[댓글] listReplies로 실제 답글 2개 조회됨', replyResult.repliesCount === 2, replyResult.repliesCount);
      check('[댓글] 답글 추가 후 reply_count 트리거가 실제로 2로 반영됨 (migration 0030 실동작)', replyResult.replyCountAfterAdd === 2, replyResult.replyCountAfterAdd);
      check('[댓글] 답글 삭제 후 reply_count가 1로 감소 (트리거 재계산 확인)', replyResult.replyCountAfterDelete === 1, replyResult.replyCountAfterDelete);
    }
  }

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length > 0) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' - ' + f.name + ' :: ' + JSON.stringify(f.detail));
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
