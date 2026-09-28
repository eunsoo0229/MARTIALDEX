import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';

// Non-blocking guidance for the personal-data features item 7 lists (내
// 커리큘럼/훈련 기록/숙련도/스파링 기록/나의 스타일) — these keep working
// fully from local data whether or not the user is logged in (breaking that
// would violate item 1's "기존 기능 보호"), this just points out that
// logging in lets the same data be backed up to their account.
export default function LoginToBackupBanner({ featureName }: { featureName: string }) {
  const { isConfigured, user, loading } = useAuth();
  if (!isConfigured || loading || user) return null;

  return (
    <div className="ai-inline-warning">
      로그인하면 {featureName}을(를) 계정에 백업해 다른 기기에서도 이어서 볼 수 있습니다.{' '}
      <Link to="/login">로그인</Link> · <Link to="/signup">회원가입</Link>
    </div>
  );
}
