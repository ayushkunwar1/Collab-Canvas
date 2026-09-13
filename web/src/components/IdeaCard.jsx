'use client';

function relativeTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function IdeaCard({ idea, currentUserId, onEdit, onDelete, onToggleVote, voteBusy }) {
  const isOwner = idea.user_id === currentUserId;

  return (
    <article className="idea-card">
      <div className="idea-card-head">
        <div className="idea-category">{idea.category}</div>

        {isOwner ? (
          <div className="idea-owner-actions">
            <button
              className="icon-button"
              onClick={() => onEdit(idea)}
              aria-label="Edit idea"
              title="Edit"
            >
              ✎
            </button>
            <button
              className="icon-button danger"
              onClick={() => onDelete(idea)}
              aria-label="Delete idea"
              title="Delete"
              disabled={voteBusy}
            >
              ⌫
            </button>
          </div>
        ) : null}
      </div>

      <h3>{idea.title}</h3>
      {idea.description ? (
        <p>{idea.description}</p>
      ) : (
        <p className="muted">No description.</p>
      )}

      <div className="idea-meta">
        <div className="idea-author">
          <span className="avatar">
            {(idea.profile?.display_name || 'U').slice(0, 1).toUpperCase()}
          </span>
          <span>{idea.profile?.display_name || 'User'}</span>
          <span className="dot-separator">·</span>
          <span>{relativeTime(idea.created_at)}</span>
        </div>

        <button
          className={`upvote-button ${idea.hasUpvoted ? 'voted' : ''}`}
          onClick={() => onToggleVote(idea)}
          aria-pressed={idea.hasUpvoted}
          disabled={voteBusy}
        >
          {voteBusy ? '…' : idea.hasUpvoted ? '♥' : '♡'} {idea.upvoteCount}
        </button>
      </div>
    </article>
  );
}
