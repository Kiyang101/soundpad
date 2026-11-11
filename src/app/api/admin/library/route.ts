import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminClient, HttpError, readJson, respond } from '@/lib/admin-http';
import { assertCurrent, copySound, deleteSound, details, getSound, soundColumns, updateSound } from '@/lib/library';
import { SOURCE_BUCKET, sourcePath, uploadSpec, type Sound } from '@/lib/sound';
import { resumableEndpoint } from '@/lib/supabase/config';

const uuid = z.uuid();
const categoryName = z.string().trim().min(1).max(60);
const soundName = z.string().trim().min(1).max(80);
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('categories.add'), name: categoryName }),
  z.object({ action: z.literal('categories.rename'), id: uuid, name: categoryName }),
  z.object({ action: z.literal('categories.delete'), id: uuid }),
  z.object({ action: z.literal('sounds.upload'), id: uuid.optional(), fileName: z.string().min(1).max(255), bytes: z.number().int() }),
  z.object({ action: z.literal('sounds.details'), id: uuid }),
  z.object({ action: z.literal('sounds.list') }),
  z.object({ action: z.literal('sounds.copy'), id: uuid, revision: uuid }),
  z.object({ action: z.literal('sounds.rename'), id: uuid, revision: uuid, name: soundName, categoryId: uuid }),
  z.object({ action: z.literal('sounds.delete'), id: uuid, revision: uuid }),
]);

export function POST(request: NextRequest) {
  return respond(async () => {
    const input = inputSchema.parse(await readJson(request));
    const client = await adminClient();
    switch (input.action) {
      case 'categories.add':
      case 'categories.rename': {
        const table = client.from('sound_categories');
        const query = input.action === 'categories.add'
          ? table.insert({ name: input.name })
          : table.update({ name: input.name }).eq('id', input.id);
        const { data, error } = await query.select('id,name').maybeSingle();
        if (error?.code === '23505') throw new HttpError(409, 'มีหมวดหมู่ชื่อนี้แล้ว');
        if (error) throw error;
        if (!data) throw new HttpError(404, 'ไม่พบหมวดหมู่นี้');
        return data;
      }
      case 'categories.delete': {
        const { error } = await client.from('sound_categories').delete().eq('id', input.id);
        if (error?.code === '23503') throw new HttpError(409, 'ย้ายเสียงออกจากหมวดนี้ก่อนลบหมวด');
        if (error) throw error;
        return { ok: true };
      }
      case 'sounds.upload': {
        const spec = uploadSpec(input.fileName, input.bytes);
        if (!spec) throw new HttpError(400, 'เลือกไฟล์ MP3, WAV หรือ M4A ขนาดไม่เกิน 50 MB');
        let sound: Sound;
        if (input.id) {
          sound = await getSound(client, input.id);
          if (sound.status !== 'draft' || sound.source_duration_ms !== null ||
              sound.source_name !== input.fileName || sound.source_bytes !== input.bytes) {
            throw new HttpError(409, 'เลือกไฟล์ต้นฉบับเดิมเพื่ออัปโหลดต่อ');
          }
        } else {
          const base = input.fileName.slice(0, input.fileName.lastIndexOf('.')).trim();
          const name = Array.from(base).slice(0, 80).join('').trimEnd() || 'เสียงใหม่';
          const { data, error } = await client.from('sounds').insert({
            name, source_name: input.fileName, source_kind: spec.kind, source_bytes: input.bytes,
          }).select(soundColumns).single();
          if (error) throw error;
          sound = data as Sound;
        }
        const path = sourcePath(sound);
        const { data, error } = await client.storage.from(SOURCE_BUCKET).createSignedUploadUrl(path, { upsert: false });
        if (error || !data) throw new HttpError(409, 'เริ่มอัปโหลดไม่ได้ หากไฟล์อัปโหลดครบแล้วให้กดวิเคราะห์ไฟล์');
        return { sound, path, token: data.token, endpoint: resumableEndpoint() };
      }
      case 'sounds.list': {
        const { data, error } = await client.from('sounds').select(soundColumns).order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      }
      case 'sounds.details':
        return details(client, await getSound(client, input.id));
      case 'sounds.copy':
        return copySound(client, await getSound(client, input.id), input.revision);
      case 'sounds.rename': {
        const sound = await getSound(client, input.id);
        assertCurrent(sound, input.revision);
        if (sound.status !== 'ready') throw new HttpError(409, 'บันทึกช่วงเสียงก่อนแก้ไขรายการ');
        return updateSound(client, sound, { name: input.name, category_id: input.categoryId });
      }
      case 'sounds.delete':
        return deleteSound(client, await getSound(client, input.id), input.revision);
    }
  });
}
