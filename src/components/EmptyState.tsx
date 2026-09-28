export default function EmptyState({ icon = '🥋', text }: { icon?: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <p>{text}</p>
    </div>
  );
}
