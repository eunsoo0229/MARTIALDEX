import { useNavigate } from 'react-router-dom';

// A real "go back to whatever screen the user was actually on" button —
// distinct from every page's existing `.breadcrumb` (a static forward-chain
// of Links to fixed ancestor routes, never the user's actual prior screen).
// Uses the same history the browser back button would use; only falls back
// to `fallback` when there is genuinely no prior in-app entry to return to
// (e.g. this was the first screen opened this session), never as the
// default behavior.
export default function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate();

  function handleClick() {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm back-button" onClick={handleClick} aria-label="이전 화면으로 돌아가기">
      ← 이전
    </button>
  );
}
