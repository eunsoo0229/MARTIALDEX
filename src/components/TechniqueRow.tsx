import { useNavigate } from 'react-router-dom';
import type { Technique } from '../types';
import DifficultyBadge from './DifficultyBadge';
import { useFavorites } from '../lib/userData';
import { getMartialArt } from '../lib/loadData';
import { isTechniqueInArt, techniqueArts, techniqueCategoryInArt, techniqueNameInArt } from '../lib/techniqueCanonical';

export default function TechniqueRow({
  technique,
  showMartialArt = true,
  contextArt,
}: {
  technique: Technique;
  /** Hide the martial-art label when the surrounding page already makes it obvious (e.g. a single-art technique list). */
  showMartialArt?: boolean;
  /** The art this list is showing — a canonical technique linked to several arts opens and shows its category in that art. */
  contextArt?: string;
}) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(technique.id);
  const viewArt = contextArt && isTechniqueInArt(technique, contextArt) ? contextArt : technique.martialArt;
  // One row per canonical technique, labelled with every art it belongs to ("주짓수 · 레슬링").
  const artLabel = techniqueArts(technique)
    .map((id) => getMartialArt(id)?.nameKo ?? id)
    .join(' · ');
  const category = techniqueCategoryInArt(technique, viewArt);
  const href = `/arts/${viewArt}/techniques/${technique.id}`;

  const otherPositions = technique.positions.filter((p) => p !== category);
  // On a one-art list, the name that art uses (Karate: Mae Geri, Taekwondo: 앞차기).
  const label = techniqueNameInArt(technique, contextArt && isTechniqueInArt(technique, contextArt) ? contextArt : null);

  return (
    <div
      className="technique-row"
      onClick={() => navigate(href)}
      data-testid="technique-row"
      data-technique-id={technique.id}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(href);
      }}
    >
      <div className="technique-row__main">
        <div className="technique-row__name" data-testid="technique-row-name">
          {label.name}
          {label.koreanName && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-meta)' }}>
              {label.koreanName}
            </span>
          )}
          {contextArt && label.otherNames.length > 0 && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-meta)' }} data-testid="technique-row-aka">
              ({label.otherNames.slice(0, 2).join(' / ')})
            </span>
          )}
        </div>
        <div className="technique-row__sub">
          {showMartialArt && <strong>{artLabel}</strong>}
          {showMartialArt && ' · '}
          {category}
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
