import { Link } from 'react-router-dom';
import type { MartialArtSummary } from '../types';

export default function MartialArtCard({ art }: { art: MartialArtSummary }) {
  const initial = art.nameKo.slice(0, 1);
  return (
    <Link to={`/arts/${art.id}`} className="art-card">
      <div className="art-card__badge" aria-hidden="true" />
      <div className="art-card__initial">{initial}</div>
      <div className="art-card__name-ko">{art.nameKo}</div>
      <div className="art-card__name-en">{art.nameEn ?? art.id}</div>
      <div className="art-card__count">
        <strong>{art.techniqueCount}</strong>개 기술 · {art.categories.length}개 카테고리
      </div>
    </Link>
  );
}
