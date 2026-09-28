// A shared, consistent loading indicator — alongside EmptyState.tsx's
// established convention (icon + short text, centered). Existing pages'
// own ad-hoc "불러오는 중..." text is left as-is (touching all of them
// would be a large, disproportionate change for a cosmetic unification);
// this is available for new/updated screens going forward.
export default function LoadingState({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  );
}
