export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase URL or publishable key.');
  return { url, key };
}

export function resumableEndpoint() {
  const { url } = supabaseConfig();
  const endpoint = new URL(url);
  if (endpoint.hostname.endsWith('.supabase.co')) {
    endpoint.hostname = endpoint.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
  }
  return new URL('/storage/v1/upload/resumable/sign', endpoint).href;
}

export const sessionCookieOptions = { httpOnly: true, secure: process.env.VERCEL === '1' };
