import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminClient, HttpError, respond } from '@/lib/admin-http';
import { getSound } from '@/lib/library';
import { CLIP_BUCKET } from '@/lib/sound';

export function GET(request: NextRequest) {
  return respond(async () => {
    const client = await adminClient();
    const id = z.uuid().parse(request.nextUrl.searchParams.get('id'));
    const sound = await getSound(client, id);
    if (sound.status !== 'ready' || !sound.clip_path) throw new HttpError(409, 'บันทึกช่วงเสียงก่อนดาวน์โหลด');
    const { data, error } = await client.storage.from(CLIP_BUCKET).download(sound.clip_path);
    if (error || !data) throw new HttpError(503, 'โหลดคลิปเสียงไม่ได้ ลองใหม่อีกครั้ง');
    return new Response(data, { headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `attachment; filename="soundpad-${id}.mp3"; filename*=UTF-8''${encodeURIComponent(sound.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}.mp3`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  });
}
