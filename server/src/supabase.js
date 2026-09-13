import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
}

if (!secretKey) {
  throw new Error('Missing SUPABASE_SECRET_KEY');
}

const authOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

export function createAuthClient() {
  return createClient(url, publishableKey, authOptions);
}

export function createAdminClient() {
  return createClient(url, secretKey, authOptions);
}
