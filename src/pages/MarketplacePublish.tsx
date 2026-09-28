import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { getCurriculum, saveCustomCurriculum } from '../lib/curriculum/curriculumService';
import { publishCurriculumToMarketplace } from '../lib/marketplace/service';
import type { MarketplaceListing } from '../lib/marketplace/types';
import BackButton from '../components/BackButton';

const COVER_ICON_PRESETS = ['🥋', '🥊', '🧠', '🔥', '⭐', '🏆', '🛡️', '⚔️'];

export default function MarketplacePublish() {
  const { curriculumId = '' } = useParams();
  const navigate = useNavigate();
  const { user, profile, isConfigured } = useAuth();
  const curriculum = getCurriculum(curriculumId);

  const [title, setTitle] = useState(curriculum?.title ?? '');
  const [description, setDescription] = useState(curriculum?.description ?? '');
  const [difficulty, setDifficulty] = useState<MarketplaceListing['difficulty']>('beginner');
  const [coverIcon, setCoverIcon] = useState(curriculum?.coverIcon ?? COVER_ICON_PRESETS[0]);
  const [isFree, setIsFree] = useState(true);
  const [priceInput, setPriceInput] = useState('5000');
  const [tagsInput, setTagsInput] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [learningGoalsInput, setLearningGoalsInput] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!curriculum) return <Navigate to="/learning" replace />;
  if (curriculum.marketplaceListingId) return <Navigate to={`/marketplace/${curriculum.marketplaceListingId}`} replace />;

  if (!isConfigured || !user || !profile) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="card info-card">
            <p className="video-status-message">마켓에 게시하려면 로그인이 필요합니다.</p>
            <Link to="/login" className="btn btn-primary">
              로그인
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handlePublish() {
    if (!title.trim()) {
      setError('커리큘럼 이름을 입력해주세요.');
      return;
    }
    setPublishing(true);
    setError(null);
    const priceKrw = isFree ? 0 : Math.max(0, Math.round(Number(priceInput) || 0));
    const result = await publishCurriculumToMarketplace({
      curriculum: curriculum!,
      sellerUserId: user!.id,
      sellerNickname: profile!.nickname,
      title,
      description,
      difficulty,
      coverIcon,
      priceKrw,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      targetAudience,
      learningGoals: learningGoalsInput.split('\n').map((g) => g.trim()).filter(Boolean),
    });
    setPublishing(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // The seller's own local curriculum is left otherwise untouched — only
    // this back-reference is added, so "마켓에 게시" doesn't show again.
    saveCustomCurriculum({ ...curriculum!, marketplaceListingId: result.data.id });
    navigate(`/marketplace/${result.data.id}`);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/marketplace">커리큘럼 마켓</Link>
          <span>/</span>
          <span>마켓에 게시</span>
        </div>

        <div className="section-title">
          <h2>🛒 커리큘럼 마켓에 게시</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          "{curriculum.title}"의 Day/기술 내용을 그대로 사용해 마켓에 게시합니다. 원본 커리큘럼은 그대로 유지됩니다.
        </p>

        <div className="card info-card">
          <label className="field-label">커리큘럼 이름</label>
          <input className="select" style={{ width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} />

          <label className="field-label" style={{ marginTop: 12 }}>
            설명
          </label>
          <textarea style={{ width: '100%', minHeight: 70 }} value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="chip-row" style={{ marginTop: 12 }}>
            <div>
              <label className="field-label">무술</label>
              <br />
              <span className="chip">{curriculum.martialArt}</span>
            </div>
            <div>
              <label className="field-label">난이도</label>
              <br />
              <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value as MarketplaceListing['difficulty'])}>
                <option value="beginner">초급</option>
                <option value="intermediate">중급</option>
                <option value="advanced">고급</option>
                <option value="mixed">혼합</option>
              </select>
            </div>
            <div>
              <label className="field-label">기간</label>
              <br />
              <span className="chip">{curriculum.days.length}일 (원본 그대로)</span>
            </div>
          </div>

          <label className="field-label" style={{ marginTop: 12 }}>
            대표 이미지 (아이콘)
          </label>
          <div className="chip-row">
            {COVER_ICON_PRESETS.map((icon) => (
              <button key={icon} type="button" className={`chip ${coverIcon === icon ? 'active' : ''}`} onClick={() => setCoverIcon(icon)}>
                {icon}
              </button>
            ))}
          </div>

          <label className="field-label" style={{ marginTop: 12 }}>
            가격
          </label>
          <div className="chip-row">
            <label className="chip-row" style={{ alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} /> 무료로 게시
            </label>
            {!isFree && (
              <input
                type="number"
                className="select"
                style={{ width: 120 }}
                min={0}
                step={100}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
            )}
            {!isFree && <span>원</span>}
          </div>

          <label className="field-label" style={{ marginTop: 12 }}>
            태그 (쉼표로 구분)
          </label>
          <input className="select" style={{ width: '100%' }} placeholder="예: 초보자, 테이크다운, 30일" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />

          <label className="field-label" style={{ marginTop: 12 }}>
            추천 대상
          </label>
          <input className="select" style={{ width: '100%' }} placeholder="예: 주짓수를 막 시작한 초보자" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />

          <label className="field-label" style={{ marginTop: 12 }}>
            학습 목표 (한 줄에 하나씩)
          </label>
          <textarea style={{ width: '100%', minHeight: 60 }} value={learningGoalsInput} onChange={(e) => setLearningGoalsInput(e.target.value)} />

          {error && <div className="ai-error" role="alert">{error}</div>}

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
              {publishing ? '게시 중...' : '마켓에 게시'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
