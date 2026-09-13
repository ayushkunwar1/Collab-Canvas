'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

function validateWorkspace(name, description) {
  const cleanName = name.trim();
  const cleanDescription = description.trim();

  if (cleanName.length < 2) return 'Workspace name must be at least 2 characters.';
  if (cleanName.length > 80) return 'Workspace name must be 80 characters or fewer.';
  if (cleanDescription.length > 500) return 'Description must be 500 characters or fewer.';

  return '';
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const closeModals = () => {
    setShowCreate(false);
    setShowJoin(false);
    setFormError('');
  };

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiFetch('/workspaces');
      setWorkspaces(result.workspaces || []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load workspaces.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) loadWorkspaces();
  }, [user, loadWorkspaces]);

  async function createWorkspace(event) {
    event.preventDefault();
    setFormError('');

    const validation = validateWorkspace(name, description);
    if (validation) {
      setFormError(validation);
      return;
    }

    setBusy(true);

    try {
      const result = await apiFetch('/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      closeModals();
      setName('');
      setDescription('');
      router.push(`/workspace/${result.workspace.id}`);
    } catch (createError) {
      setFormError(createError.message || 'Unable to create workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function joinWorkspace(event) {
    event.preventDefault();
    setFormError('');

    const cleanId = workspaceId.trim();

    if (!isUuid(cleanId)) {
      setFormError('Enter a valid workspace ID.');
      return;
    }

    setBusy(true);

    try {
      await apiFetch(`/workspaces/${cleanId}/join`, { method: 'POST' });
      closeModals();
      setWorkspaceId('');
      router.push(`/workspace/${cleanId}`);
    } catch (joinError) {
      setFormError(joinError.message || 'Unable to join workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace('/');
  }

  if (authLoading || !user) {
    return <main className="loading-page">Loading your account…</main>;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="nav-brand" href="/dashboard">
          <span className="brand-mark">✦</span>
          CollabCanvas
        </Link>

        <div className="header-user">
          <span>{user.user_metadata?.display_name || user.email}</span>
          <button className="ghost-button" onClick={signOut}>
            Log out
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="section-intro">
          <div>
            <div className="eyebrow">YOUR WORKSPACES</div>
            <h1>Where ideas become plans.</h1>
            <p>
              Create a shared workspace, send teammates the ID, and watch shared data update live.
            </p>
          </div>

          <div className="intro-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setFormError('');
                setShowJoin(true);
                setShowCreate(false);
              }}
            >
              Join workspace
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setFormError('');
                setShowCreate(true);
                setShowJoin(false);
              }}
            >
              + New workspace
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadWorkspaces} />
        ) : workspaces.length === 0 ? (
          <EmptyState
            title="No workspaces yet"
            description="Create your first workspace or join one using its ID."
            action={
              <button className="primary-button" onClick={() => setShowCreate(true)}>
                Create workspace
              </button>
            }
          />
        ) : (
          <div className="workspace-grid">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                className="workspace-card"
                href={`/workspace/${workspace.id}`}
              >
                <div className="workspace-card-top">
                  <span className="workspace-icon">✦</span>
                  <span className="role-chip">{workspace.role}</span>
                </div>
                <h3>{workspace.name}</h3>
                <p>{workspace.description || 'No description yet.'}</p>
                <div className="workspace-card-footer">
                  <span>Open workspace</span>
                  <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {(showCreate || showJoin) && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModals();
          }}
        >
          <div className="modal-card" role="dialog" aria-modal="true">
            <button className="modal-close" onClick={closeModals} aria-label="Close">
              ×
            </button>

            {showCreate ? (
              <>
                <div className="eyebrow">NEW WORKSPACE</div>
                <h2>Create a shared room</h2>
                <p>Start a space for ideas, votes, and collaboration.</p>

                <form className="stack-form" onSubmit={createWorkspace}>
                  <label>
                    Workspace name
                    <input
                      value={name}
                      maxLength={80}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Hackathon Ideas"
                      autoFocus
                    />
                  </label>

                  <label>
                    Description
                    <textarea
                      value={description}
                      maxLength={500}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="What are you building together?"
                      rows={4}
                    />
                  </label>

                  {formError ? <div className="form-error" role="alert">{formError}</div> : null}

                  <button className="primary-button" disabled={busy}>
                    {busy ? 'Creating…' : 'Create workspace →'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="eyebrow">JOIN WORKSPACE</div>
                <h2>Enter a workspace ID</h2>
                <p>Ask a teammate for the workspace ID shown in their workspace.</p>

                <form className="stack-form" onSubmit={joinWorkspace}>
                  <label>
                    Workspace ID
                    <input
                      value={workspaceId}
                      onChange={(event) => setWorkspaceId(event.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      autoFocus
                    />
                  </label>

                  {formError ? <div className="form-error" role="alert">{formError}</div> : null}

                  <button className="primary-button" disabled={busy}>
                    {busy ? 'Joining…' : 'Join workspace →'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
