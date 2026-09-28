import { useNavigate } from 'react-router-dom';
import type { Technique } from '../types';
import DifficultyBadge from './DifficultyBadge';
import { useFavorites } from '../lib/userData';
import { getMartialArt } from '../lib/loadData';

export default function TechniqueRow({
  technique,
  showMartialArt = true,
}: {
  technique: Technique;
  /** Hide the martial-art label when the surrounding page already makes it obvious (e.g. a single-art technique list). */
  showMartialArt?: boolean;
}) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(technique.id);
  const art = getMartialArt(technique.martialArt);

  const otherPositions = technique.positions.filter((p) => p !== technique.category);

  return (
    <div
      className="technique-row"
      onClick={() => navigate(`/arts/${technique.martialArt}/techniques/${technique.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/arts/${technique.martialArt}/techniques/${technique.id}`);
      }}
    >
      <div className="technique-row__main">
        <div className="technique-row__name">
          {technique.name}
          {technique.koreanName && technique.koreanName !== technique.name && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-meta)' }}>
              {technique.koreanName}
            </span>
          )}
        </div>
        <div className="technique-row__sub">
          {showMartialArt && <strong>{art?.nameKo ?? technique.martialArt}</strong>}
          {showMartialArt && ' · '}
          {technique.category}
          {otherPositions.length > 0 && (
            <span className="technique-row__positions">
              {' '}
              · 포지션: {otherPositions.slice(0, 3).join(', ')}
              {otherPositions.length > 3 ? ` 외 ${otherPositions.length - 3}개` : ''}
            </span>
          )}
        </div>
      </div>
      <div className="technique-row__right">
        <DifficultyBadge difficulty={technique.difficulty} />
        <button
          className={`favorite-btn ${fav ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(technique.id);
          }}
          aria-label="즐겨찾기"
          title="즐겨찾기"
        >
          {fav ? '★' : '☆'}
        </button>
      </div>
    </div>
  );
}
