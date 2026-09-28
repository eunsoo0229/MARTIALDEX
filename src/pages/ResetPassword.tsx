import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../lib/auth/authService';
import { useAuth } from '../lib/auth/AuthProvider';

export default function ResetPassword() {
  const { isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="section-title">
          <h2>비밀번호 재설정</h2>
        </div>

        {!isConfigured && <div className="ai-inline-warning">Supabase 설정이 되어 있지 않아 이 기능을 사용할 수 없습니다.</div>}

        {sent ? (
          <div className="card info-card">
            <p>{email}로 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해주세요.</p>
          </div>
        ) : (
          <form className="card info-card" onSubmit={handleSubmit}>
            <div className="field-label">가입한 이메일</div>
            <input className="select" style={{ width: '100%' }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
            {error && <div className="ai-inline-warning">{error}</div>}
            <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={loading || !isConfigured}>
                {loading ? '전송 중…' : '재설정 메일 보내기'}
              </button>
            </div>
          </form>
        )}

        <p className="video-status-message">
          <Link to="/login">로그인으로 돌아가기</Link>
        </p>
      </div>
    </div>
  );
}
