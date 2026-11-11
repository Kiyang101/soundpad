import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createSessionClient, hasAdminSession } from './supabase/server';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function readJson(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || (origin !== request.nextUrl.origin && origin !== `https://${host}` &&
      !(process.env.NODE_ENV === 'development' && origin === `http://${host}`))) {
    throw new HttpError(403, 'คำขอนี้ต้องมาจากหน้า Soundpad');
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new HttpError(415, 'รูปแบบคำขอไม่ถูกต้อง');
  }
  try {
    return await request.json() as unknown;
  } catch {
    throw new HttpError(400, 'อ่านข้อมูลที่ส่งมาไม่ได้');
  }
}

export async function adminClient() {
  const client = await createSessionClient();
  if (!await hasAdminSession(client)) throw new HttpError(401, 'กรุณาเข้าสู่ระบบแอดมินอีกครั้ง');
  return client;
}

export async function respond(run: () => Promise<unknown>) {
  try {
    const result = await run();
    return result instanceof Response ? result : json(result);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจแล้วลองอีกครั้ง' }, 400);
    console.error('Soundpad request failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง' }, 500);
  }
}
