import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';

export default function NotFound() {
  return (
    <div className="page">
      <div className="container">
        <EmptyState icon="🥋" text="페이지를 찾을 수 없습니다." />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/" className="btn btn-primary">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
