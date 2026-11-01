import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { env, isBackendConfigured } from './env';
import { chunkedSecureStorage } from './secureStorage';

// Uses only the publishable key. Authorization is enforced by RLS and server-side functions, not by this client.
export const supabase = isBackendConfigured
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        storage: chunkedSecureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
