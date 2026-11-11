import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL: url, SUPABASE_SECRET_KEY: key,
  SOUNDPAD_ADMIN_EMAIL: email, SOUNDPAD_ADMIN_PASSWORD: password,
} = process.env;

if (!url || !key || !email || !password || password.length < 12) {
  console.error('Set SUPABASE_URL, SUPABASE_SECRET_KEY, SOUNDPAD_ADMIN_EMAIL, and a password of at least 12 characters.');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await client.auth.admin.createUser({
  email, password, email_confirm: true, app_metadata: { soundpad_admin: true },
});

if (error) {
  console.error(`Could not create the admin account (${error.code ?? error.status ?? 'unknown'}).`);
  process.exit(1);
}

console.log('Soundpad admin account created.');
