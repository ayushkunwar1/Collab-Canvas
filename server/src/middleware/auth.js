import { createAdminClient, createAuthClient } from '../supabase.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const accessToken = authHeader.slice(7).trim();

    if (!accessToken) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.getUser(accessToken);

    if (error || !data?.user) {
      console.error('JWT verification failed:', error);
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    // All API database work runs server-side with the Secret key.
    // Authorization is enforced explicitly in the route handlers.
    req.supabase = createAdminClient();
    req.user = data.user;

    return next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Authentication service unavailable.' });
  }
}
