import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="error-page">
      <div className="empty-state standalone">
        <div className="empty-icon">?</div>
        <h3>Page not found</h3>
        <p>The page you requested does not exist.</p>
        <Link className="primary-button link-button" href="/">
          Back to home
        </Link>
      </div>
    </main>
  );
}
