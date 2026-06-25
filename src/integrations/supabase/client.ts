import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { resolveSupabaseConfig, SUPABASE_AUTH_STORAGE_KEY } from './config';

/**
 * Safe storage implementation for environments where localStorage is unavailable
 */
function createSafeStorage(): Storage {
  try {
    const t = '__supabase_probe__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    const noop = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    console.warn('[Supabase] localStorage unavailable — using no-op storage.');
    return noop;
  }
}

const resolvedConfig = resolveSupabaseConfig(import.meta.env);
const SUPABASE_URL: string = resolvedConfig.url;
const SUPABASE_API_KEY: string = resolvedConfig.key;
export const isUsingEnvVars = true;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_API_KEY,
  {
    auth: {
      storage: createSafeStorage(),
      persistSession: true,
      autoRefreshToken: true,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      detectSessionInUrl: true,
      // PKCE flow returns `?code=` (query) instead of `#access_token` (hash).
      // The query survives the ASWebAuthenticationSession → main WebView handoff
      // used by chravel-mobile, where hash params are otherwise lost (App Store 2.1a).
      flowType: 'pkce',
    },
    realtime: {
      params: {
        eventsPerSecond: 40,
      },
    },
  },
);

// Export URL for edge function calls
export const SUPABASE_PROJECT_URL = SUPABASE_URL;

// Export public API key (publishable preferred, legacy anon supported) for edge fetch headers.
export const SUPABASE_PUBLIC_API_KEY = SUPABASE_API_KEY;
// Backward compatibility alias for older imports.
export const SUPABASE_PUBLIC_ANON_KEY = SUPABASE_PUBLIC_API_KEY;
