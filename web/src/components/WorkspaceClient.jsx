'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import IdeaCard from './IdeaCard';
import IdeaForm from './IdeaForm';
import Presence from './Presence';
import CollaborativeCanvas from './CollaborativeCanvas';
import VoiceChat from './VoiceChat';

const FILTERS = ['All', 'General', 'Product', 'Study', 'Event', 'Design', 'Tech'];

export default function WorkspaceClient({ workspaceId }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [workspace, setWorkspace] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyVoteIds, setBusyVoteIds] = useState(new Set());
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [view, setView] = useState('ideas');
  const requestIdRef = useRef(0);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceError('');
    try {
      const result = await apiFetch(`/workspaces/${workspaceId}`);
      setWorkspace(result.workspace || null);
      setIsOwner(Boolean(result.isOwner));
    } catch (loadError) {
      setWorkspaceError(loadError.message || 'Unable to load this workspace.');
    }
  }, [workspaceId]);

  const loadIdeas = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (category !== 'All') query.set('category', category);

      const suffix = query.toString() ? `?${query.toString()}` : '';
      const result = await apiFetch(`/ideas/workspace/${workspaceId}${suffix}`);

      if (requestId === requestIdRef.current) {
        setIdeas(result.ideas || []);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError.message || 'Unable to load ideas.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [workspaceId, search, category]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) loadWorkspace();
  }, [user, loadWorkspace]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setTimeout(loadIdeas, 250);
    return () => clearTimeout(timer);
  }, [user, loadIdeas]);

  useEffect(() => {
    if (!user) return undefined;

    const supabase = getSupabase();
    const channel = supabase.channel(`workspace-live-${workspaceId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas', filter: `workspace_id=eq.${workspaceId}` },
        () => loadIdeas(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'upvotes', filter: `workspace_id=eq.${workspaceId}` },
        () => loadIdeas(),
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const flattened = Object.values(state)
          .flat()
          .map((person) => ({ userId: person.userId, name: person.name || 'User' }));

        const unique = [
          ...new Map(flattened.map((person) => [person.userId, person])).values(),
        ];

        setOnlineUsers(unique);
      })
      .subscribe(async (status) => {
        setRealtimeStatus(
          status === 'SUBSCRIBED' ? 'connected' : String(status).toLowerCase(),
        );

        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              userId: user.id,
              name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
            });
          } catch (trackError) {
            console.error('Presence tracking failed:', trackError);
          }
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user, loadIdeas]);

  function openCreateForm() {
    setEditingIdea(null);
    setShowForm(true);
    setError('');
  }

  function openEditForm(idea) {
    setEditingIdea(idea);
    setShowForm(true);
    setError('');
  }

  async function createOrUpdateIdea(values) {
    setBusy(true);
    setError('');

    try {
      if (editingIdea) {
        const result = await apiFetch(`/ideas/${editingIdea.id}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        });

        setIdeas((current) =>
          current.map((item) => (item.id === editingIdea.id ? result.idea : item)),
        );
      } else {
        const result = await apiFetch(`/ideas/workspace/${workspaceId}`, {
          method: 'POST',
          body: JSON.stringify(values),
        });

        const newIdea = result.idea;

        const matchesSearch = !search.trim() ||
          `${newIdea.title} ${newIdea.description}`.toLowerCase().includes(search.trim().toLowerCase());
        const matchesCategory = category === 'All' || newIdea.category === category;

        if (matchesSearch && matchesCategory) {
          setIdeas((current) => [newIdea, ...current]);
        }
      }

      setEditingIdea(null);
      setShowForm(false);
      void loadIdeas();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save idea.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteIdea(idea) {
    if (!window.confirm(`Delete “${idea.title}”?`)) return;

    setBusy(true);
    setError('');

    try {
      await apiFetch(`/ideas/${idea.id}`, { method: 'DELETE' });
      setIdeas((current) => current.filter((item) => item.id !== idea.id));
      void loadIdeas();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete idea.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleVote(idea) {
    setBusyVoteIds((current) => {
      const next = new Set(current);
      next.add(idea.id);
      return next;
    });

    setError('');

    try {
      if (idea.hasUpvoted) {
        await apiFetch(`/ideas/${idea.id}/upvote`, { method: 'DELETE' });
      } else {
        await apiFetch(`/ideas/${idea.id}/upvote`, { method: 'POST' });
      }

      setIdeas((current) =>
        current.map((item) => {
          if (item.id !== idea.id) return item;
          const delta = idea.hasUpvoted ? -1 : 1;
          return {
            ...item,
            hasUpvoted: !idea.hasUpvoted,
            upvoteCount: Math.max(0, item.upvoteCount + delta),
          };
        }),
      );
    } catch (voteError) {
      setError(voteError.message || 'Unable to update the vote.');
    } finally {
      setBusyVoteIds((current) => {
        const next = new Set(current);
        next.delete(idea.id);
        return next;
      });
    }
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const memberLabel = onlineUsers.length === 1 ? '1 person online' : `${onlineUsers.length} people online`;
  const showingFiltered = useMemo(
    () => Boolean(search.trim()) || category !== 'All',
    [search, category],
  );

  if (authLoading || !user) {
    return <main className="loading-page">Loading workspace…</main>;
  }

  if (workspaceError) {
    return (
      <main className="app-shell workspace-page">
        <header className="app-header">
          <Link className="nav-brand" href="/dashboard">
            <span className="brand-mark">✦</span> CollabCanvas
          </Link>
        </header>
        <section className="workspace-content">
          <ErrorState
            message={workspaceError}
            onRetry={loadWorkspace}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell workspace-page">
      <header className="app-header">
        <Link className="nav-brand" href="/dashboard">
          <span className="brand-mark">✦</span> CollabCanvas
        </Link>
        <div className="header-user">
          <span>{displayName}</span>
          <Link href="/dashboard" className="ghost-button">Dashboard</Link>
        </div>
      </header>

      <section className="workspace-content">
        <div className="workspace-header-row">
          <div>
            <Link href="/dashboard" className="back-link inline-back">← Workspaces</Link>
            <div className="eyebrow">SHARED WORKSPACE</div>
            <h1>{workspace?.name || 'Workspace'}</h1>
            <p>{workspace?.description || 'Collaborate on ideas and decisions in real time.'}</p>
            {workspace ? (
              <div className="workspace-id-row">
                <span>Workspace ID</span>
                <code>{workspace.id}</code>
                <button
                  className="mini-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(workspace.id);
                    } catch {
                      window.prompt('Copy workspace ID:', workspace.id);
                    }
                  }}
                >
                  Copy ID
                </button>
              </div>
            ) : null}
          </div>

          <div className="workspace-live">
            <Presence onlineUsers={onlineUsers} />
            <span className={`realtime-chip ${realtimeStatus === 'connected' ? 'good' : ''}`}>
              <span className="status-dot" /> {memberLabel}
            </span>
          </div>
        </div>

        <VoiceChat workspaceId={workspaceId} onlineUsers={onlineUsers} />

        <div className="view-tabs">
          <button className={view === 'ideas' ? 'active' : ''} onClick={() => setView('ideas')}>
            💡 Ideas
          </button>
          <button className={view === 'canvas' ? 'active' : ''} onClick={() => setView('canvas')}>
            ✎ Canvas
          </button>
        </div>

        {view === 'ideas' ? (
          <>
            <div className="workspace-tools">
              <div className="search-box">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ideas…"
                  maxLength={50}
                  aria-label="Search ideas"
                />
              </div>

              <div className="filter-row" aria-label="Filter ideas by category">
                {FILTERS.map((item) => (
                  <button
                    key={item}
                    className={`filter-button ${category === item ? 'active' : ''}`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <button className="primary-button add-idea-button" onClick={openCreateForm}>
                + Add idea
              </button>
            </div>

            {error ? <ErrorState message={error} onRetry={loadIdeas} /> : null}

            {showForm ? (
              <div className="inline-form-card">
                <div className="inline-form-head">
                  <div>
                    <div className="eyebrow">{editingIdea ? 'EDIT IDEA' : 'NEW IDEA'}</div>
                    <h2>{editingIdea ? 'Refine the idea' : 'Add something worth discussing'}</h2>
                  </div>
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowForm(false);
                      setEditingIdea(null);
                    }}
                    aria-label="Close idea form"
                  >
                    ×
                  </button>
                </div>

                <IdeaForm
                  initialIdea={editingIdea}
                  onSubmit={createOrUpdateIdea}
                  onCancel={() => {
                    setShowForm(false);
                    setEditingIdea(null);
                  }}
                  busy={busy}
                />
              </div>
            ) : null}

            <div className="feed-heading">
              <div>
                <span className="eyebrow">IDEA FEED</span>
                <h2>{showingFiltered ? 'Filtered ideas' : 'Latest ideas'}</h2>
              </div>
              <span>{ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'}</span>
            </div>

            {loading ? (
              <LoadingSkeleton rows={4} />
            ) : ideas.length === 0 ? (
              <EmptyState
                title={showingFiltered ? 'Nothing matched' : 'Your board is empty'}
                description={showingFiltered ? 'Try another search term or category.' : 'Add the first idea and give your team something to react to.'}
                action={<button className="primary-button" onClick={openCreateForm}>Add the first idea</button>}
              />
            ) : (
              <div className="ideas-grid">
                {ideas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    currentUserId={user.id}
                    onEdit={openEditForm}
                    onDelete={deleteIdea}
                    onToggleVote={toggleVote}
                    voteBusy={busyVoteIds.has(idea.id) || busy}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <CollaborativeCanvas workspaceId={workspaceId} canClear={isOwner} />
        )}

        <div className="workspace-footer-note">
          <span className="online-dot" />
          Realtime sync is active for ideas and votes. Canvas actions are persisted in Supabase.
        </div>
      </section>
    </main>
  );
}
