import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { HttpError, readJson, respond } from '@/lib/admin-http';
import { createSessionClient } from '@/lib/supabase/server';

const credentials = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(256) });
const windowMs = 60_000;
const attempts = new Map<string, { count: number; until: number }>();

function checkRate(request: NextRequest) {
  // shortcut: this counter is per process; use the Vercel Firewall rule for a shared limit.
  const ip = request.headers.get('x-vercel-forwarded-for') ?? 'local';
  const now = Date.now();
  for (const [key, value] of attempts) {
    if (value.until <= now) attempts.delete(key);
  }
  const attempt = attempts.get(ip) ?? { count: 0, until: now + windowMs };
  if (attempt.count >= 5 || attempts.size >= 1_000) {
    throw new HttpError(429, 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอหนึ่งนาที');
  }
  attempt.count++;
  attempts.set(ip, attempt);
}

export function POST(request: NextRequest) {
  return respond(async () => {
    const input = credentials.parse(await readJson(request));
    checkRate(request);
    const username = process.env.SOUNDPAD_ADMIN_USERNAME;
    const email = process.env.SOUNDPAD_ADMIN_EMAIL;
    if (!username || !email) throw new HttpError(503, 'บัญชีแอดมินยังไม่ได้ตั้งค่า');
    if (input.username.toLowerCase() !== username.toLowerCase()) {
      throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }

    const client = await createSessionClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password: input.password });
    if (error?.status === 429) throw new HttpError(429, 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
    if (error || data.user?.app_metadata.soundpad_admin !== true) {
      if (data.session) await client.auth.signOut({ scope: 'local' });
      throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    return { ok: true };
  });
}

export function DELETE(request: NextRequest) {
  return respond(async () => {
    await readJson(request);
    const client = await createSessionClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return { ok: true };
  });
}
