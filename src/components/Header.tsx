import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import SearchBar from './SearchBar';
import AiAskModal from './AiAskModal';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth/AuthProvider';
import { signOutUser } from '../lib/auth/authService';
import logo from '../assets/logo.png';


const THEME_ICON: Record<string, string> = {
  system: '🖥',
  light: '☀',
  dark: '☾',
};

// Kept short on purpose — these are the links people reach for constantly.
// Everything else (still one click away) lives in the "메뉴" dropdown below,
// so the bar never wraps onto a second line no matter how many features get
// added later.
const NAV_PRIMARY = [
  { to: '/learning', label: '학습' },
  { to: '/my-skills', label: '나의 기술' },
  { to: '/coach', label: 'AI 코치' },
];

// Visually grouped for the "메뉴" dropdown / mobile menu — purely a
// rendering grouping, NAV_MORE below is flattened back out of this so every
// existing consumer (isInMore, NAV_ALL_MOBILE) sees the exact same flat list
// in the exact same order as before.
const NAV_MORE_GROUPS = [
  {
    label: '무술',
    items: [
      { to: '/arts', label: '무술 목록' },
      { to: '/techniques', label: '전체 기술' },
      { to: '/graph', label: '기술 그래프' },
      { to: '/techniques/request', label: '기술 요청' },
    ],
  },
  {
    label: '훈련',
    items: [
      { to: '/training', label: '훈련 홈' },
      { to: '/free-training', label: '자유훈련' },
      { to: '/training/routines', label: '훈련 루틴' },
      { to: '/training/exercises', label: '헬스 운동' },
      { to: '/combos', label: '콤보 북' },
      { to: '/tactics', label: '전술 셋업' },
      { to: '/skill-tree', label: '비주얼 기술 트리' },
      { to: '/shadow-boxing', label: 'AI 쉐도우 복싱' },
      { to: '/training-analytics', label: '훈련 분석/캘린더' },
      { to: '/review', label: '복습' },
      { to: '/sparring/record', label: '스파링 촬영' },
    ],
  },
  {
    label: '커리큘럼',
    items: [
      { to: '/learning', label: '학습 커리큘럼' },
      { to: '/ai-curriculum', label: 'AI 맞춤 커리큘럼' },
      { to: '/fighter-style', label: '선수 스타일 학습' },
      { to: '/marketplace', label: '커리큘럼 마켓' },
    ],
  },
  {
    label: '홈트',
    items: [
      { to: '/home-training', label: '홈트레이닝' },
      { to: '/home-training/request', label: '홈트 운동 요청' },
    ],
  },
  {
    label: '영양',
    items: [
      { to: '/nutrition', label: '오늘의 영양' },
      { to: '/nutrition/goals', label: '영양 목표' },
    ],
  },
  {
    label: 'AI',
    items: [
      { to: '/personal-coach', label: 'AI Personal Coach' },
      { to: '/ai-combo', label: 'AI 콤비네이션' },
      { to: '/ai-history', label: 'AI 질문 기록' },
    ],
  },
  {
    label: '커뮤니티',
    items: [{ to: '/community', label: '커뮤니티' }],
  },
  {
    label: '체육관',
    items: [
      { to: '/gym', label: '체육관 참가 (학생)' },
      { to: '/gym/admin', label: '체육관 관리 (관장님)' },
    ],
  },
  {
    label: '계정',
    items: [
      { to: '/dashboard', label: '대시보드' },
      { to: '/sparring', label: '스파링 분석' },
      { to: '/stats', label: '나의 통계' },
      { to: '/my-style', label: '나의 스타일' },
      { to: '/profile', label: '프로필' },
    ],
  },
];
const NAV_MORE = NAV_MORE_GROUPS.flatMap((g) => g.items);

// Below 720px, .nav-links (and everything inside it — 학습/나의 기술/AI 코치
// plus the "메뉴" dropdown covering all of NAV_MORE) is hidden by CSS with no
// replacement, which on any real phone (always ≤720px in portrait) makes
// those pages completely unreachable from the header. The mobile menu button
// is that replacement — same destinations (홈 + NAV_PRIMARY ungrouped, then
// NAV_MORE_GROUPS grouped the same way as the desktop dropdown), shown only
// at that breakpoint (see .mobile-menu-btn in global.css).

export default function Header() {
  const { theme, cycleTheme } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isConfigured, user, loading: authLoading } = useAuth();
  const [aiOpen, setAiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    await signOutUser();
    navigate('/login');
  }

  const isInMore = NAV_MORE.some((item) => pathname === item.to || pathname.startsWith(item.to + '/'));

  useEffect(() => {
    if (!moreOpen) return;
    function onDocumentClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [moreOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onDocumentClick(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMoreOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <NavLink to="/" className="brand">
          <img src={logo} alt="MARTIALDEX" className="brand__mark" />
          <span className="brand__text">MARTIALDEX</span>
        </NavLink>
        <nav className="nav-links">
          <NavLink to="/" end>
            홈
          </NavLink>
          {NAV_PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
          <div className="nav-more" ref={moreRef}>
            <button
              type="button"
              className={`nav-more__button ${isInMore ? 'active' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
            >
              메뉴 {moreOpen ? '▴' : '▾'}
            </button>
            {moreOpen && (
              <div className="nav-more__panel">
                {NAV_MORE_GROUPS.map((group) => (
                  <div key={group.label} className="nav-more__group">
                    <div className="nav-more__group-label">{group.label}</div>
                    {group.items.map((item) => (
                      <NavLink key={item.to} to={item.to}>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="header-spacer" />
        <div className="nav-more mobile-menu-wrap" ref={mobileMenuRef}>
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            title="메뉴"
          >
            ☰
          </button>
          {mobileMenuOpen && (
            <div className="nav-more__panel mobile-menu-panel">
              <NavLink to="/" end>
                홈
              </NavLink>
              {NAV_PRIMARY.map((item) => (
                <NavLink key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
              {NAV_MORE_GROUPS.map((group) => (
                <div key={group.label} className="nav-more__group">
                  <div className="nav-more__group-label">{group.label}</div>
                  {group.items.map((item) => (
                    <NavLink key={item.to} to={item.to}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="header-search-wrap">
          <SearchBar variant="header" />
        </div>
        <Link to="/techniques" className="icon-btn mobile-search-btn" title="기술 검색">
          ⌕
        </Link>
        <button className="icon-btn" onClick={() => setAiOpen(true)} title="AI에게 질문">
          ✦
        </button>
        <button
          className="icon-btn"
          onClick={cycleTheme}
          title={`테마: ${theme} (클릭해서 전환)`}
        >
          {THEME_ICON[theme]}
        </button>
        {isConfigured && !authLoading && (
          user ? (
            <button className="icon-btn" onClick={handleLogout} title="로그아웃">
              ⎋
            </button>
          ) : (
            <Link to="/login" className="icon-btn" title="로그인">
              👤
            </Link>
          )
        )}
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} />}
    </header>
  );
}
