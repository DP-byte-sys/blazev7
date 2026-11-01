import { createClient } from '@supabase/supabase-js';

const url: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const key: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

// Publishable key only. Authorization is enforced by RLS and server-side functions, not by this client.
// Sessions use supabase-js defaults (localStorage); keep the app free of XSS (no raw HTML injection).
export const supabase =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
