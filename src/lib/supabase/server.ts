import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sessionCookieOptions, supabaseConfig } from './config';

export async function createSessionClient(signal?: AbortSignal) {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    ...(signal ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
      ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000), ...(init?.signal ? [init.signal] : [])]),
    }) } } : {}),
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          // Server Components read cookies refreshed by the admin proxy.
        }
      },
    },
  });
}

export function createPublicClient() {
  const { url, key } = supabaseConfig();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

export async function hasAdminSession(client: Awaited<ReturnType<typeof createSessionClient>>) {
  const { data } = await client.auth.getClaims();
  return data?.claims.app_metadata?.soundpad_admin === true;
}
