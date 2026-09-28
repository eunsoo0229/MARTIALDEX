import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUpWithEmail } from '../lib/auth/authService';
import { useAuth } from '../lib/auth/AuthProvider';

export default function Signup() {
  const { isConfigured, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const navigate = useNavigate();

  // See Login.tsx's identical fix — navigate() must not be called
  // synchronously during render (React logs "Cannot update a component
  // while rendering a different component"); useEffect is the correct
  // place for a navigation that reacts to `user` becoming truthy.
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  if (user) {
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    const result = await signUpWithEmail(email, password, nickname.trim());
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.data.needsEmailConfirmation) {
      setNeedsEmailConfirmation(true);
    } else {
      navigate('/', { replace: true });
    }
  }

  if (needsEmailConfirmation) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 440 }}>
          <div className="section-title">
            <h2>회원가입 완료</h2>
          </div>
          <div className="card info-card">
            <p>가입 확인 이메일을 {email}로 보냈습니다. 이메일의 링크를 클릭해 인증을 완료한 뒤 로그인해주세요.</p>
          </div>
          <div className="modal-actions modal-actions--start">
            <Link to="/login" className="btn btn-primary">
              로그인하러 가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="section-title">
          <h2>회원가입</h2>
        </div>

        {!isConfigured && <div className="ai-inline-warning">Supabase 설정이 되어 있지 않아 회원가입을 사용할 수 없습니다.</div>}

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
            autoComplete="new-password"
            minLength={6}
          />

          <div className="field-label" style={{ marginTop: 12 }}>
            비밀번호 확인
          </div>
          <input
            className="select"
            style={{ width: '100%' }}
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />

          <div className="field-label" style={{ marginTop: 12 }}>
            닉네임
          </div>
          <input className="select" style={{ width: '100%' }} type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={30} />

          {error && <div className="ai-inline-warning">{error}</div>}

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="btn btn-primary" type="submit" disabled={loading || !isConfigured}>
              {loading ? '가입 중…' : '회원가입'}
            </button>
          </div>
        </form>

        <p className="video-status-message">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </p>
      </div>
    </div>
  );
}
