import { randomUUID } from 'node:crypto';
import { HttpError } from './admin-http';
import { CLIP_BUCKET, SOURCE_BUCKET, sourcePath, type AudioDetails, type Sound } from './sound';
import type { createSessionClient } from './supabase/server';

type Client = Awaited<ReturnType<typeof createSessionClient>>;

export const soundColumns = 'id,status,name,category_id,source_name,source_kind,source_bytes,source_duration_ms,duration_ms,trim_start_ms,trim_end_ms,clip_path,revision';

export async function getSound(client: Client, id: string) {
  const { data, error } = await client.from('sounds').select(soundColumns).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'ไม่พบเสียงนี้ในคลัง');
  return data as Sound;
}

export function assertCurrent(sound: Sound, revision?: string) {
  if (sound.status === 'deleting' || (revision && sound.revision !== revision)) {
    throw new HttpError(409, 'เสียงนี้มีการเปลี่ยนแปลง กรุณาโหลดรายการแล้วลองอีกครั้ง');
  }
}

export async function updateSound(client: Client, sound: Sound, patch: Partial<Sound> & { waveform?: number[] }) {
  const { data, error } = await client.from('sounds')
    .update({ ...patch, revision: randomUUID() }).eq('id', sound.id).eq('revision', sound.revision)
    .select(soundColumns).maybeSingle();
  if (error?.code === '23503') throw new HttpError(409, 'ไม่พบหมวดหมู่นี้ กรุณาเลือกหมวดใหม่');
  if (error) throw error;
  if (!data) throw new HttpError(409, 'เสียงนี้มีการเปลี่ยนแปลง กรุณาโหลดรายการแล้วลองอีกครั้ง');
  return data as Sound;
}

export async function originalUrl(client: Client, sound: Sound) {
  const { data, error } = await client.storage.from(SOURCE_BUCKET).createSignedUrl(sourcePath(sound), 3600);
  if (error || !data?.signedUrl) throw new HttpError(422, 'เปิดต้นฉบับไม่ได้ ตรวจว่าอัปโหลดไฟล์ครบแล้ว');
  return data.signedUrl;
}

export async function details(client: Client, sound: Sound): Promise<AudioDetails> {
  assertCurrent(sound);
  if (sound.source_duration_ms === null) throw new HttpError(409, 'กรุณาวิเคราะห์ไฟล์ต้นฉบับก่อน');
  const { data, error } = await client.from('sounds').select('waveform').eq('id', sound.id).single();
  if (error) throw error;
  return {
    durationMs: sound.source_duration_ms,
    peaks: data.waveform as number[],
    sourceUrl: await originalUrl(client, sound),
  };
}

export async function deleteSound(client: Client, sound: Sound, revision: string) {
  if (sound.revision !== revision) throw new HttpError(409, 'รายการเปลี่ยนแปลง กรุณาโหลดใหม่');
  const deleting = sound.status === 'deleting'
    ? sound
    : await updateSound(client, sound, { status: 'deleting' });
  try {
    const clips = client.storage.from(CLIP_BUCKET);
    const paths: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await clips.list(sound.id, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      paths.push(...data.map(({ name }) => `${sound.id}/${name}`));
      if (data.length < 100) break;
    }
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await clips.remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
    const { error: sourceError } = await client.storage.from(SOURCE_BUCKET).remove([sourcePath(sound)]);
    if (sourceError) throw sourceError;
    const { error } = await client.from('sounds').delete().eq('id', sound.id).eq('revision', deleting.revision);
    if (error) throw error;
  } catch {
    throw new HttpError(503, 'นำแพดออกจากหน้าเล่นแล้ว แต่ลบไฟล์ไม่สำเร็จ กรุณากดลบอีกครั้ง');
  }
  return { ok: true };
}
