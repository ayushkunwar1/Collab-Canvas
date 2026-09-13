'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <div className="nav-brand">
          <span className="brand-mark">✦</span>
          CollabCanvas
        </div>

        {!loading && (
          user ? (
            <Link className="nav-button" href="/dashboard">
              Open dashboard →
            </Link>
          ) : (
            <Link className="nav-button" href="/login">
              Get started →
            </Link>
          )
        )}
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">REAL-TIME COLLABORATION</div>
          <h1>
            Think together.
            <br />
            Build together.
          </h1>
          <p>
            CollabCanvas gives teams a shared workspace for ideas, voting,
            decisions, and live collaboration — with data that stays after refresh.
          </p>

          <div className="hero-actions">
            <Link
              className="primary-button link-button"
              href={user ? '/dashboard' : '/login'}
            >
              {user ? 'Open workspace →' : 'Start collaborating →'}
            </Link>
            <a className="secondary-link" href="#features">
              See features
            </a>
          </div>
        </div>

        <div className="hero-preview" aria-hidden="true">
          <div className="preview-toolbar">
            <span>✦</span>
            <span>Ideas</span>
            <span className="preview-live">● LIVE</span>
          </div>

          <div className="preview-card">
            <div className="preview-title">Build an AI study assistant</div>
            <div className="preview-meta">💡 Product · Ayush</div>
            <div className="preview-actions">♥ 12 · just updated</div>
          </div>

          <div className="preview-card compact">
            <div className="preview-title">Campus marketplace</div>
            <div className="preview-meta">🎓 Student life · Rahul</div>
            <div className="preview-actions">♡ 8 · live feed</div>
          </div>

          <div className="preview-online">
            <span className="online-dot" /> 3 collaborators online
          </div>
        </div>
      </section>

      <section id="features" className="feature-grid">
        <article>
          <span>⚡</span>
          <h3>Live updates</h3>
          <p>Ideas and votes appear across open workspaces without a manual refresh.</p>
        </article>
        <article>
          <span>🔐</span>
          <h3>Ownership</h3>
          <p>Users can edit or delete only the ideas they own, enforced by RLS.</p>
        </article>
        <article>
          <span>👍</span>
          <h3>Upvote ideas</h3>
          <p>Let the group surface the ideas everyone should pay attention to.</p>
        </article>
        <article>
          <span>🎨</span>
          <h3>Shared canvas</h3>
          <p>Sketch alongside your ideas with a persistent collaborative whiteboard.</p>
        </article>
      </section>
    </main>
  );
}
