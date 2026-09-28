import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

// Hits the REAL, live Supabase project (0026_community_posts.sql, just
// applied) — creates real throwaway QA-tagged accounts, real posts/likes/
// comments/saves/reposts, and verifies RLS + duplicate-prevention via direct
// REST, same pattern as qa-nutrition-supabase-live.mjs/qa-gym-supabase-live.mjs.

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const STAMP = Date.now();
const USER_A = { email: `mdx.qa.community.a.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA커뮤A' };
const USER_B = { email: `mdx.qa.community.b.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA커뮤B' };

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(1500);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function goto(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(500);
}
async function waitUntil(conditionFn, timeoutMs = 12000, stepMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await sleep(stepMs);
  }
  return false;
}

async function fillSignup(page, user) {
  await goto(page, '#/signup');
  try {
    await page.waitForSelector('form input[type="email"]', { timeout: 8000 });
  } catch {
    // Router occasionally hadn't mounted yet on the very first navigation after launch — retry once.
    await goto(page, '#/signup');
    await page.waitForSelector('form input[type="email"]', { timeout: 15000 });
  }
  await page.fill('form input[type="email"]', user.email);
  const passwordInputs = await page.$$('form input[type="password"]');
  await passwordInputs[0].fill(user.password);
  await passwordInputs[1].fill(user.password);
  await page.fill('form input[type="text"]', user.nickname);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== '#/signup') return true;
    return page.evaluate(() => document.querySelector('.ai-inline-warning') !== null);
  });
  await sleep(800);
}

async function fillLogin(page, user) {
  await goto(page, '#/login');
  try {
    await page.waitForSelector('form input[type="email"]', { timeout: 8000 });
  } catch {
    await goto(page, '#/login');
    await page.waitForSelector('form input[type="email"]', { timeout: 15000 });
  }
  await page.fill('form input[type="email"]', user.email);
  await page.fill('form input[type="password"]', user.password);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => (await page.evaluate(() => location.hash)) !== '#/login');
  await sleep(800);
}

async function getUserId(page) {
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  });
}

async function getAccessToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key)).access_token ?? null;
    } catch {
      return null;
    }
  });
}

async function restQuery(page, url, apikey, table, query, accessToken, opts = {}) {
  return page.evaluate(
    async ({ url, apikey, table, query, accessToken, opts }) => {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: opts.method ?? 'GET',
        headers: {
          apikey,
          Authorization: `Bearer ${accessToken || apikey}`,
          ...(opts.body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const status = res.status;
      const body = await res.json().catch(() => null);
      return { status, body };
    },
    { url, apikey, table, query, accessToken, opts }
  );
}

function readEnvVar(name) {
  const envText = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
  const match = envText.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

async function main() {
  const { app, page, consoleErrors } = await launch();
  const SUPABASE_URL = readEnvVar('VITE_SUPABASE_URL');
  const SUPABASE_KEY = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  // ---- Setup: two real accounts ----
  // This launch reuses Electron's default profile dir (no --user-data-dir
  // override) — a PRIOR run of this same script may have left a session
  // logged in, which would make Signup.tsx redirect straight back to Home
  // instead of rendering the form. Always start from a clean, signed-out slate.
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    await supabase?.auth.signOut().catch(() => {});
  });
  await sleep(500);
  await fillSignup(page, USER_A);
  const userAId = await getUserId(page);
  check('[setup] User A 회원가입 + 로그인', !!userAId, userAId);

  // ---- Post creation: every combination ----
  const createResult = await page.evaluate(
    async ({ authorId, authorNickname }) => {
      const { createPost } = await import('/src/lib/communityPost/service.ts');
      const textOnly = await createPost({ authorId, authorNickname, content: 'QA 텍스트 전용 게시물', media: [] });
      // 1x1 transparent PNG, synthesized in-browser — exercises the REAL Storage upload path.
      const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
      const file = new File([pngBytes], 'qa.png', { type: 'image/png' });
      const withPhoto = await createPost({ authorId, authorNickname, content: 'QA 사진 포함 게시물', media: [{ file, type: 'image' }] });
      const curriculumPost = await createPost({
        authorId,
        authorNickname,
        content: 'QA 커리큘럼 공유 게시물',
        media: [],
        curriculumSnapshot: { curriculumId: 'qa-fake-curriculum', title: 'QA 테스트 커리큘럼', martialArt: 'boxing', totalDays: 14, techniqueCount: 20 },
      });
      return { textOnly, withPhoto, curriculumPost };
    },
    { authorId: userAId, authorNickname: USER_A.nickname }
  );
  check('[1] 텍스트 전용 게시물 생성', createResult.textOnly.ok && createResult.textOnly.data.postType === 'text', createResult.textOnly.ok ? createResult.textOnly.data.id : createResult.textOnly.message);
  check(
    '[2] 사진 포함 게시물 생성 (실제 Storage 업로드)',
    createResult.withPhoto.ok && createResult.withPhoto.data.postType === 'media' && createResult.withPhoto.data.media.length === 1,
    createResult.withPhoto.ok ? createResult.withPhoto.data.media : createResult.withPhoto.message
  );
  check(
    '[3] 커리큘럼 공유 게시물 생성',
    createResult.curriculumPost.ok && createResult.curriculumPost.data.postType === 'curriculum',
    createResult.curriculumPost.ok ? createResult.curriculumPost.data.curriculumSnapshot : createResult.curriculumPost.message
  );

  // Verify the uploaded image is actually publicly fetchable.
  if (createResult.withPhoto.ok) {
    const mediaUrl = createResult.withPhoto.data.media[0].url;
    const fetchResult = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.status;
    }, mediaUrl);
    check('[2b] 업로드된 사진이 공개 URL로 실제 접근 가능', fetchResult === 200, `status=${fetchResult}`);
  }

  const postId = createResult.textOnly.ok ? createResult.textOnly.data.id : null;

  // ---- Likes: toggle + duplicate prevention (structural, via PK) ----
  if (postId) {
    const likeOnce = await page.evaluate(async ({ postId, userId }) => {
      const { likePost } = await import('/src/lib/communityPost/service.ts');
      return likePost(postId, userId);
    }, { postId, userId: userAId });
    check('[4] 좋아요 성공', likeOnce.ok, likeOnce);

    const accessToken = await getAccessToken(page);
    const likeRowsAfterOne = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_post_likes', `post_id=eq.${postId}&user_id=eq.${userAId}`, accessToken);
    check('[4b] 좋아요 행이 정확히 1개 존재', Array.isArray(likeRowsAfterOne.body) && likeRowsAfterOne.body.length === 1, likeRowsAfterOne.body);

    // Duplicate like attempt (double-click race) — must not create a 2nd row.
    const likeTwice = await page.evaluate(async ({ postId, userId }) => {
      const { likePost } = await import('/src/lib/communityPost/service.ts');
      return likePost(postId, userId);
    }, { postId, userId: userAId });
    const likeRowsAfterTwo = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_post_likes', `post_id=eq.${postId}&user_id=eq.${userAId}`, accessToken);
    check(
      '[4c] 중복 좋아요 방지 (PK 구조적 차단, 여전히 1개)',
      likeTwice.ok && Array.isArray(likeRowsAfterTwo.body) && likeRowsAfterTwo.body.length === 1,
      { likeTwiceOk: likeTwice.ok, count: likeRowsAfterTwo.body?.length }
    );

    // Trigger-based counter check — like_count must reflect the real row count, not a client-settable value.
    const postAfterLike = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}&select=like_count`, accessToken);
    check('[4d] like_count 트리거가 실제 값(1)으로 갱신됨', postAfterLike.body?.[0]?.like_count === 1, postAfterLike.body);

    const unlike = await page.evaluate(async ({ postId, userId }) => {
      const { unlikePost } = await import('/src/lib/communityPost/service.ts');
      return unlikePost(postId, userId);
    }, { postId, userId: userAId });
    check('[4e] 좋아요 취소 성공', unlike.ok, unlike);

    // ---- Save toggle + duplicate prevention ----
    const saveOnce = await page.evaluate(async ({ postId, userId }) => {
      const { savePost } = await import('/src/lib/communityPost/service.ts');
      return savePost(postId, userId);
    }, { postId, userId: userAId });
    const saveTwice = await page.evaluate(async ({ postId, userId }) => {
      const { savePost } = await import('/src/lib/communityPost/service.ts');
      return savePost(postId, userId);
    }, { postId, userId: userAId });
    const saveRows = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_post_saves', `post_id=eq.${postId}&user_id=eq.${userAId}`, accessToken);
    check('[5] 저장 + 중복 저장 방지 (여전히 1개)', saveOnce.ok && saveTwice.ok && saveRows.body?.length === 1, saveRows.body);

    const savedList = await page.evaluate(async (userId) => {
      const { listSavedPosts } = await import('/src/lib/communityPost/service.ts');
      return listSavedPosts(userId);
    }, userAId);
    check('[5b] "저장한 게시물" 목록에 실제로 표시됨', savedList.ok && savedList.data.some((p) => p.id === postId), savedList.ok ? savedList.data.map((p) => p.id) : savedList.message);

    // ---- Comments: add, list, self-delete-only ----
    const comment = await page.evaluate(
      async ({ postId, userId, nickname }) => {
        const { addComment } = await import('/src/lib/communityPost/service.ts');
        return addComment(postId, userId, nickname, 'QA 댓글입니다');
      },
      { postId, userId: userAId, nickname: USER_A.nickname }
    );
    check('[6] 댓글 작성 성공', comment.ok, comment);

    const commentsList = await page.evaluate(async (postId) => {
      const { listComments } = await import('/src/lib/communityPost/service.ts');
      return listComments(postId);
    }, postId);
    check('[6b] 댓글 목록에 표시됨 + comment_count 트리거 반영', commentsList.ok && commentsList.data.comments.length === 1, commentsList.ok ? commentsList.data : commentsList.message);

    const postAfterComment = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}&select=comment_count`, accessToken);
    check('[6c] comment_count 트리거가 실제 값(1)으로 갱신됨', postAfterComment.body?.[0]?.comment_count === 1, postAfterComment.body);

    // ---- Repost + repost-of-repost resolves to true original ----
    const repostResult = await page.evaluate(
      async ({ userId, nickname, post }) => {
        const { repost } = await import('/src/lib/communityPost/service.ts');
        return repost(userId, nickname, post);
      },
      { userId: userAId, nickname: USER_A.nickname, post: createResult.textOnly.data }
    );
    check('[7] 리포스트 성공', repostResult.ok, repostResult);

    const myReposts = await page.evaluate(async (userId) => {
      const { listMyReposts } = await import('/src/lib/communityPost/service.ts');
      return listMyReposts(userId, userId);
    }, userAId);
    const repostItem = myReposts.ok ? myReposts.data.find((r) => r.repost.originalPostId === postId) : null;
    check('[7b] "내 리포스트" 목록에 원본이 올바르게 연결되어 표시됨', !!repostItem && repostItem.originalPost?.id === postId, repostItem);

    // A repost row itself is never a community_posts row — reposting the ORIGINAL again from the item's own originalPost reference (never the repost wrapper) is the only path the UI exposes, so chaining is structurally impossible. Verify: attempting to look up the repost's id in community_posts returns nothing.
    const repostAsPost = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${repostItem?.repost.id}`, accessToken);
    check('[7c] 리포스트 자체는 community_posts에 새 행을 만들지 않음 (체이닝 구조적 불가)', Array.isArray(repostAsPost.body) && repostAsPost.body.length === 0, repostAsPost.body);
  }

  // ---- Permissions: User B cannot edit/delete User A's post, cannot double-repost ----
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    await supabase.auth.signOut();
  });
  await sleep(500);
  await fillSignup(page, USER_B);
  const userBId = await getUserId(page);
  check('[8] User B 회원가입 + 로그인', !!userBId && userBId !== userAId, userBId);

  if (postId) {
    const bAccessToken = await getAccessToken(page);
    const bDeleteAttempt = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}`, bAccessToken, { method: 'DELETE' });
    const stillExists = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}`, bAccessToken);
    check('[9] 타인(User B)이 User A의 게시물을 삭제할 수 없음 (RLS 차단)', Array.isArray(stillExists.body) && stillExists.body.length === 1, { deleteStatus: bDeleteAttempt.status, stillExists: stillExists.body?.length });

    const bUpdateAttempt = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}`, bAccessToken, {
      method: 'PATCH',
      body: { content: '해킹 시도' },
    });
    const afterUpdateAttempt = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}&select=content`, bAccessToken);
    check(
      '[9b] 타인(User B)이 User A의 게시물을 수정할 수 없음 (RLS 차단)',
      afterUpdateAttempt.body?.[0]?.content !== '해킹 시도',
      afterUpdateAttempt.body
    );

    // User B likes User A's post — this SHOULD succeed (liking someone else's post is normal).
    const bLike = await page.evaluate(async ({ postId, userId }) => {
      const { likePost } = await import('/src/lib/communityPost/service.ts');
      return likePost(postId, userId);
    }, { postId, userId: userBId });
    check('[10] 타인(User B)이 User A의 게시물에 좋아요는 정상적으로 가능', bLike.ok, bLike);

    // User B comments, then deletes their OWN comment (allowed) — and cannot delete User A's comment (blocked).
    const bComment = await page.evaluate(
      async ({ postId, userId, nickname }) => {
        const { addComment } = await import('/src/lib/communityPost/service.ts');
        return addComment(postId, userId, nickname, 'User B 댓글');
      },
      { postId, userId: userBId, nickname: USER_B.nickname }
    );
    const bOwnDelete = bComment.ok
      ? await page.evaluate(async ({ commentId, userId }) => {
          const { deleteComment } = await import('/src/lib/communityPost/service.ts');
          return deleteComment(commentId, userId);
        }, { commentId: bComment.data.id, userId: userBId })
      : { ok: false };
    check('[11] 본인 댓글은 삭제 가능', bOwnDelete.ok, bOwnDelete);

    const aCommentsAfter = await page.evaluate(async (postId) => {
      const { listComments } = await import('/src/lib/communityPost/service.ts');
      return listComments(postId);
    }, postId);
    const userAComment = aCommentsAfter.ok ? aCommentsAfter.data.comments.find((c) => c.authorId === userAId) : null;
    const bDeleteOthersComment = userAComment
      ? await page.evaluate(async ({ commentId, userId }) => {
          const { deleteComment } = await import('/src/lib/communityPost/service.ts');
          return deleteComment(commentId, userId);
        }, { commentId: userAComment.id, userId: userBId })
      : { ok: false };
    const aCommentStillThere = await page.evaluate(async (postId) => {
      const { listComments } = await import('/src/lib/communityPost/service.ts');
      return listComments(postId);
    }, postId);
    check(
      '[11b] 타인의 댓글은 삭제할 수 없음 (RLS 차단)',
      aCommentStillThere.ok && aCommentStillThere.data.comments.some((c) => c.id === userAComment?.id),
      { deleteCallOk: bDeleteOthersComment.ok, stillThere: aCommentStillThere.ok ? aCommentStillThere.data.comments.map((c) => c.id) : null }
    );

    // Duplicate repost prevention.
    const bRepostOnce = await page.evaluate(
      async ({ userId, nickname, post }) => {
        const { repost } = await import('/src/lib/communityPost/service.ts');
        return repost(userId, nickname, post);
      },
      { userId: userBId, nickname: USER_B.nickname, post: createResult.textOnly.data }
    );
    const bRepostTwice = await page.evaluate(
      async ({ userId, nickname, post }) => {
        const { repost } = await import('/src/lib/communityPost/service.ts');
        return repost(userId, nickname, post);
      },
      { userId: userBId, nickname: USER_B.nickname, post: createResult.textOnly.data }
    );
    const repostRowsForB = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_post_reposts', `user_id=eq.${userBId}&original_post_id=eq.${postId}`, bAccessToken);
    check(
      '[12] 중복 리포스트 방지 (동일 원본, 여전히 1개)',
      bRepostOnce.ok && bRepostTwice.ok && repostRowsForB.body?.length === 1,
      { repostRows: repostRowsForB.body?.length }
    );
  }

  // ---- Edit/delete own post (User A) ----
  if (postId) {
    await page.evaluate(async () => {
      const { supabase } = await import('/src/lib/supabase/client.ts');
      await supabase.auth.signOut();
    });
    await sleep(500);
    await fillLogin(page, USER_A);
    const editResult = await page.evaluate(
      async ({ postId, userId }) => {
        const { updatePostContent } = await import('/src/lib/communityPost/service.ts');
        return updatePostContent(postId, userId, 'QA 텍스트 전용 게시물 (수정됨)');
      },
      { postId, userId: userAId }
    );
    check('[13] 본인 게시물 수정 성공', editResult.ok, editResult);

    const deleteResult = await page.evaluate(
      async ({ postId, userId, mediaUrls }) => {
        const { deletePost } = await import('/src/lib/communityPost/service.ts');
        return deletePost(postId, userId, mediaUrls);
      },
      { postId, userId: userAId, mediaUrls: [] }
    );
    check('[14] 본인 게시물 삭제 성공', deleteResult.ok, deleteResult);

    const accessTokenA = await getAccessToken(page);
    const afterDelete = await restQuery(page, SUPABASE_URL, SUPABASE_KEY, 'community_posts', `id=eq.${postId}`, accessTokenA);
    check('[14b] 삭제 후 실제로 조회되지 않음', Array.isArray(afterDelete.body) && afterDelete.body.length === 0, afterDelete.body);

    // Deleted original must not break the repost (original_post_id ON DELETE SET NULL, snippet preserved).
    const repostsAfterOriginalDeleted = await page.evaluate(async (userId) => {
      const { listMyReposts } = await import('/src/lib/communityPost/service.ts');
      return listMyReposts(userId, userId);
    }, userAId);
    const survivingRepost = repostsAfterOriginalDeleted.ok ? repostsAfterOriginalDeleted.data[0] : null;
    check(
      '[15] 원본 삭제 후에도 리포스트 자체는 깨지지 않고 스니펫으로 표시됨',
      !!survivingRepost && survivingRepost.repost.originalPostId === null && survivingRepost.originalPost === null && survivingRepost.repost.originalContentSnippet.includes('QA 텍스트 전용'),
      survivingRepost
    );
  }

  // ---- Feed smoke test ----
  const feed = await page.evaluate(async (userId) => {
    const { listFeed } = await import('/src/lib/communityPost/service.ts');
    return listFeed(userId, { filter: 'all' });
  }, userAId);
  check('[16] 피드 조회 성공', feed.ok, feed.ok ? { count: feed.data.items.length } : feed.message);

  // ---- Existing curriculum-sharing tab must still work (regression) ----
  await goto(page, '#/community');
  await sleep(600);
  const communityText = await page.evaluate(() => document.body.innerText);
  check('[17] 기존 커뮤니티(커리큘럼 탐색) 탭 정상 렌더', communityText.includes('커뮤니티') && communityText.includes('공유 코드로 가져오기'), communityText.slice(0, 200));
  const hasPostsTab = communityText.includes('게시물');
  check('[17b] 새 "게시물" 탭도 함께 존재', hasPostsTab);

  check('[규약] 콘솔 에러 없음', consoleErrors.length === 0, consoleErrors);

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
  }

  await app.close();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
