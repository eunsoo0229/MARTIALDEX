import { Link, Navigate, useParams } from 'react-router-dom';
import { getUnifiedMartialArt, getUnifiedTechniquesByMartialArt } from '../lib/userTechniques/service';
import { useAddTeqLibraryVersion } from '../lib/addTeq/useAddTeqLibrary';
import TechniqueRow from '../components/TechniqueRow';
import DifficultyBadge from '../components/DifficultyBadge';
import BackButton from '../components/BackButton';

export default function MartialArtDetail() {
  const { martialArtId = '' } = useParams();
  useAddTeqLibraryVersion();
  const art = getUnifiedMartialArt(martialArtId);
  const techniques = getUnifiedTechniquesByMartialArt(martialArtId);

  if (!art) return <Navigate to="/arts" replace />;

  const categoryCounts = new Map<string, number>();
  for (const t of techniques) categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
  const categories = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);

  const preview = techniques.slice(0, 8);

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/arts">무술 목록</Link>
          <span>/</span>
          <span>{art.nameKo}</span>
        </div>

        <div className="detail-hero">
          <div>
            <h1>{art.nameKo}</h1>
            <div className="detail-hero__korean">{art.nameEn ?? art.id}</div>
            <div className="chip-row">
              <span className="chip active">{art.techniqueCount}개 기술</span>
              <span className="chip active">{categories.length}개 카테고리</span>
              {Object.entries(art.difficultyCounts)
                .filter(([k]) => k !== 'unknown')
                .map(([level, count]) => (
                  <span className="chip" key={level}>
                    <DifficultyBadge difficulty={level as any} /> &nbsp;{count}
                  </span>
                ))}
            </div>
          </div>
          <div className="detail-actions">
            <Link to={`/arts/${art.id}/techniques`} className="btn btn-primary">
              전체 기술 보기 →
            </Link>
          </div>
        </div>

        <section>
          <div className="section-title">
            <h2>카테고리</h2>
          </div>
          <div className="chip-row">
            {categories.map(([category, count]) => (
              <Link
                key={category}
                to={`/arts/${art.id}/techniques?category=${encodeURIComponent(category)}`}
                className="chip"
              >
                {category} ({count})
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>기술 미리보기</h2>
            <Link to={`/arts/${art.id}/techniques`} className="see-all">
              전체보기 →
            </Link>
          </div>
          <div className="stack gap-2">
            {preview.map((t) => (
              <TechniqueRow key={t.id} technique={t} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
