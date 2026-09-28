import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signInWithEmail } from '../lib/auth/authService';
import { useAuth } from '../lib/auth/AuthProvider';

export default function Login() {
  const { isConfigured, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  // Redirecting from inside the render body itself (calling navigate()
  // synchronously whenever `user` is truthy) is a React anti-pattern —
  // navigate() updates the Router's own state, so doing it mid-render
  // logs "Cannot update a component while rendering a different
  // component." Confirmed to actually fire under real signup/login
  // timing (not just theoretical) once AuthProvider's account-switch
  // guard shifted exactly when `user` transitions land relative to this
  // component's render. useEffect is the correct place for a
  // navigation that reacts to a prop/context change.
  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true });
  }, [user, redirectTo, navigate]);

  if (user) {
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signInWithEmail(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate(redirectTo, { replace: true });
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="section-title">
          <h2>로그인</h2>
        </div>

        {!isConfigured && <div className="ai-inline-warning">Supabase 설정이 되어 있지 않아 로그인을 사용할 수 없습니다. 기술 백과사전은 로그인 없이 계속 이용할 수 있습니다.</div>}

        <form className="card info-card" onSubmit={handleSubmit}>
          <div className="field-label">이메일</div>
          <input className="select" style={{ width: '100%' }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />

          <div className="field-label" style={{ marginTop: 12 }}>
            비밀번호
          </div>
          <input
            className="select"
            style={{ width: '100%' }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && <div className="ai-inline-warning">{error}</div>}

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="btn btn-primary" type="submit" disabled={loading || !isConfigured}>
              {loading ? '로그인 중…' : '로그인'}
            </button>
          </div>
        </form>

        <p className="video-status-message">
          계정이 없으신가요? <Link to="/signup">회원가입</Link>
        </p>
        <p className="video-status-message">
          <Link to="/reset-password">비밀번호를 잊으셨나요?</Link>
        </p>
        <p className="video-status-message">
          <Link to="/">로그인 없이 둘러보기 →</Link>
        </p>
      </div>
    </div>
  );
}
