export function EmptyState({ title, description, action, standalone = false }) {
  return (
    <div className={`empty-state${standalone ? ' standalone' : ''}`}>
      <div className="empty-icon">✦</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
