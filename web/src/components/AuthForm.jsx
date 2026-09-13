'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AuthForm() {
  const router = useRouter();
  const { user, loading: authLoading, error: authInitError } = useAuth();

  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();

    if (!isValidEmail(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup' && (cleanName.length < 2 || cleanName.length > 32)) {
      setError('Name must be between 2 and 32 characters.');
      return;
    }

    setBusy(true);

    try {
      const supabase = getSupabase();

      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              display_name: cleanName,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace('/dashboard');
        } else {
          setMessage('Account created. Check your email if confirmation is enabled.');
          setMode('login');
          setPassword('');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInError) throw signInError;
        router.replace('/dashboard');
      }
    } catch (submitError) {
      setError(submitError.message || 'Unable to complete authentication.');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || user) {
    return <div className="auth-loading">Checking session…</div>;
  }

  if (authInitError) {
    return (
      <div className="auth-card">
        <div className="form-error" role="alert">{authInitError}</div>
        <p className="small-note">Check your Supabase environment variables and reload.</p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="brand-mark large">✦</div>
      <div className="eyebrow">COLLABCANVAS</div>
      <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
      <p className="auth-subtitle">Ideas, collaboration, and persistent shared data in one place.</p>

      <div className="auth-tabs">
        <button
          className={mode === 'login' ? 'active' : ''}
          onClick={() => {
            setMode('login');
            setError('');
            setMessage('');
          }}
          type="button"
        >
          Log in
        </button>
        <button
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => {
            setMode('signup');
            setError('');
            setMessage('');
          }}
          type="button"
        >
          Sign up
        </button>
      </div>

      <form onSubmit={submit} className="stack-form">
        {mode === 'signup' ? (
          <label>
            Display name
            <input
              value={displayName}
              maxLength={32}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ayush"
              autoComplete="name"
            />
          </label>
        ) : null}

        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimum 6 characters"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {message ? <div className="form-success" role="status">{message}</div> : null}

        <button className="primary-button" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Log in →' : 'Create account →'}
        </button>
      </form>

      <p className="small-note">Authentication is handled by Supabase Auth.</p>
    </div>
  );
}
