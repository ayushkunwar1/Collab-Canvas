export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="skeleton-list" aria-label="Loading" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-card" key={index}>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
          <span className="skeleton skeleton-meta" />
        </div>
      ))}
    </div>
  );
}
