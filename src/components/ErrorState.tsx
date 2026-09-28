// Shared error display — same reasoning as LoadingState.tsx.
export default function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">⚠️</div>
      <p>{text}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
