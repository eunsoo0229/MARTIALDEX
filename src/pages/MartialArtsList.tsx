import { Link } from 'react-router-dom';
import MartialArtCard from '../components/MartialArtCard';
import { getUnifiedMartialArtSummaries, getUnifiedTechniqueCount } from '../lib/userTechniques/service';
import { useAddTeqLibraryVersion } from '../lib/addTeq/useAddTeqLibrary';
import { useCustomMartialArtLibraryVersion } from '../lib/customMartialArt/useCustomMartialArtLibrary';
import BackButton from '../components/BackButton';

export default function MartialArtsList() {
  useAddTeqLibraryVersion();
  useCustomMartialArtLibraryVersion();
  const martialArtSummaries = getUnifiedMartialArtSummaries();
  const totalTechniqueCount = getUnifiedTechniqueCount();
  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>무술 목록</span>
        </div>
        <div className="section-title">
          <h2>전체 무술 ({martialArtSummaries.length})</h2>
          <span className="result-count">총 {totalTechniqueCount}개 기술</span>
        </div>
        <div className="card-grid">
          {martialArtSummaries.map((art) => (
            <MartialArtCard key={art.id} art={art} />
          ))}
        </div>
        <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
          <Link to="/arts/add" className="btn btn-secondary">
            + 무술 추가
          </Link>
        </div>
      </div>
    </div>
  );
}
