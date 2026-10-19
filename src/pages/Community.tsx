import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getMartialArt, martialArtSummaries } from '../lib/loadData';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../lib/homeTraining/library';
import { useBrowsableCurricula } from '../lib/curriculum/useCurriculum';
import { copyToMyCurricula } from '../lib/curriculum/curriculumService';
import { decodeShareCode, encodeShareCode, ShareCodeError } from '../lib/curriculum/shareCode';
import { copyToClipboard } from '../lib/clipboard';
import type { Curriculum } from '../lib/curriculum/types';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import ManualCopyBox from '../components/ManualCopyBox';
import CommunityFeed from '../components/community/CommunityFeed';

type SortMode = 'popular' | 'recent';
type CommunityTab = 'curriculum' | 'posts';

export default function Community() {
  const navigate = useNavigate();
  const location = useLocation();
  const browsable = useBrowsableCurricula();
  // 다른 화면(내 게시물/게시물 상세)에서 해시태그를 클릭해 navigate state로
  // hashtag를 들고 여기로 오면 "게시물" 탭으로 바로 진입 — 기본 탭(커리큘럼)에
  // 남아있으면 CommunityFeed 자체가 렌더링되지 않아 해시태그 필터가 무의미해짐.
  const [tab, setTab] = useState<CommunityTab>((location.state as { hashtag?: string } | null)?.hashtag ? 'posts' : 'curriculum');

  const [query, setQuery] = useState('');
  const [martialArt, setMartialArt] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');

  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{ curriculum: Curriculum; removedInvalidIds: string[] } | null>(
    null
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<{ id: string; code: string } | null>(null);

  const filtered = useMemo(() => {
    let list = browsable.slice();
    if (martialArt) list = list.filter((c) => c.martialArt === martialArt);
    if (difficulty) {
      list = list.filter((c) => c.days.some((d) => d.difficulty === difficulty));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.martialArt.toLowerCase().includes(q) ||
          `${c.totalDays}일`.includes(q)
      );
    }
    list.sort((a, b) =>
      sort === 'recent'
        ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        : (b.likes ?? 0) + (b.usageCount ?? 0) - ((a.likes ?? 0) + (a.usageCount ?? 0))
    );
    return list;
  }, [browsable, martialArt, difficulty, query, sort]);

  function handleDecode() {
    setImportError(null);
    setImportPreview(null);
    try {
      const result = decodeShareCode(importCode);
      setImportPreview(result);
    } catch (e) {
      setImportError(e instanceof ShareCodeError ? e.message : '공유 코드를 처리하는 중 문제가 발생했습니다.');
    }
  }

  function handleConfirmImport() {
    if (!importPreview) return;
    const saved = copyToMyCurricula(importPreview.curriculum);
    setImportCode('');
    setImportPreview(null);
    navigate(`/learning/${saved.martialArt}/${saved.id}`);
  }

  async function handleCopyShareCode(c: Curriculum) {
    const code = encodeShareCode(c);
    const result = await copyToClipboard(code);
    if (result === 'failed') {
      setManualCopy({ id: c.id, code });
      return;
    }
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>커뮤니티</span>
        </div>

        <div className="section-title">
          <h2>커뮤니티</h2>
          <Link to="/shorts" className="btn btn-primary btn-sm" data-testid="open-shorts">
            ▶ 숏폼으로 보기
          </Link>
        </div>

        <div className="chip-row community-tab-switcher">
          <button type="button" className={`chip ${tab === 'curriculum' ? 'active' : ''}`} onClick={() => setTab('curriculum')}>
            커리큘럼
          </button>
          <button type="button" className={`chip ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>
            게시물
          </button>
        </div>

        {tab === 'posts' && <CommunityFeed />}

        {tab === 'curriculum' && (
          <>
            <p className="video-status-message" style={{ marginTop: -8 }}>
              Martialdex는 아직 온라인 커뮤니티 서버가 없어, 지금은 이 기기에 저장된 내 공개 커리큘럼만 여기에
              표시됩니다. 다른 사람과 커리큘럼을 주고받으려면 아래 "공유 코드"를 복사해서 전달하거나, 받은 코드를
              붙여넣어 가져오세요.
            </p>

            <div className="card info-card">
          <h3>📥 공유 코드로 가져오기</h3>
          <textarea
            style={{ width: '100%', minHeight: 60 }}
            placeholder="MDCUR1. 로 시작하는 공유 코드를 붙여넣으세요"
            value={importCode}
            onChange={(e) => {
              setImportCode(e.target.value);
              setImportPreview(null);
              setImportError(null);
            }}
          />
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={handleDecode} disabled={!importCode.trim()}>
              코드 확인
            </button>
          </div>
          {importError && (
            <div className="ai-error" role="alert">
              {importError}
            </div>
          )}
          {importPreview && (
            <div className="curriculum-import-preview">
              <div>
                <strong>{importPreview.curriculum.title}</strong> · {importPreview.curriculum.authorName}
              </div>
              <div className="technique-row__sub">
                {importPreview.curriculum.martialArt} · {importPreview.curriculum.totalDays}일 ·{' '}
                {importPreview.curriculum.techniqueCount}개 기술
              </div>
              {importPreview.removedInvalidIds.length > 0 && (
                <div className="ai-inline-warning">
                  이 앱 버전에 없는 기술 {importPreview.removedInvalidIds.length}개는 제외하고 가져옵니다.
                </div>
              )}
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleConfirmImport}>
                내 커리큘럼에 추가
              </button>
            </div>
          )}
        </div>

        <div className="filter-bar">
          <div className="filter-bar__left">
            <input
              type="text"
              className="select filter-text-input"
              placeholder='검색 (예: "주짓수", "30일", "초급")'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
              <option value="">전체 무술</option>
              {martialArtSummaries.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameKo}
                </option>
              ))}
              <option value={HOME_TRAINING_MARTIAL_ART_ID}>{getMartialArt(HOME_TRAINING_MARTIAL_ART_ID)?.nameKo ?? '홈트'}</option>
            </select>
            <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">전체 난이도</option>
              <option value="beginner">초급</option>
              <option value="intermediate">중급</option>
              <option value="advanced">고급</option>
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="recent">최신순</option>
              <option value="popular">인기순</option>
            </select>
          </div>
          <span className="result-count">{filtered.length}개 커리큘럼</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="🌐" text="공개된 커리큘럼이 없습니다. 내 커리큘럼을 공개로 설정하거나 공유 코드를 가져와보세요." />
        ) : (
          <div className="stack gap-2">
            {filtered.map((c) => (
              <div key={c.id} className="card info-card">
                <div className="chip-row">
                  <Link to={`/learning/${c.martialArt}/${c.id}`} style={{ fontWeight: 700, fontSize: 16 }}>
                    {c.coverIcon ? `${c.coverIcon} ` : ''}
                    {c.title}
                  </Link>
                  <span className="chip">{c.visibility === 'public' ? '공개' : '링크 공개'}</span>
                </div>
                <p style={{ margin: '6px 0' }}>{c.description || '(설명 없음)'}</p>
                <div className="technique-row__sub">
                  작성자 {c.authorName} · {c.martialArt} · Day {c.totalDays}개 · 기술 {c.techniqueCount}개 · 약{' '}
                  {c.estimatedWeeks}주 · 좋아요 {c.likes ?? 0} · 사용 {c.usageCount ?? 0}회
                  {c.createdAt ? ` · ${c.createdAt.slice(0, 10)} 생성` : ''}
                </div>
                <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleCopyShareCode(c)}>
                    {copiedId === c.id ? '복사됨 ✓' : '공유 코드 복사'}
                  </button>
                </div>
                {manualCopy?.id === c.id && (
                  <ManualCopyBox text={manualCopy.code} onClose={() => setManualCopy(null)} />
                )}
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
