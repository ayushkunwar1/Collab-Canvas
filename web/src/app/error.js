'use client';

export default function GlobalError({ reset }) {
  return (
    <main className="error-page">
      <div className="error-state large" role="alert">
        <div>
          <strong>Something went wrong.</strong>
          <p>We could not render this page. Your saved data is safe in Supabase.</p>
        </div>
        <button onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
