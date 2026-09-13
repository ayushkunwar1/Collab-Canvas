import { getSupabase } from './supabase';

export async function apiFetch(path, options = {}) {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();

  const headers = new Headers(options.headers || {});

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = sessionData?.session?.access_token;
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new Error('Network error. Please check your connection and try again.');
  }

  if (response.status === 401) {
    throw new Error('Your session has expired. Please log in again.');
  }

  const contentType = response.headers.get('content-type') || '';
  let payload = null;

  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}.`);
  }

  return payload;
}
