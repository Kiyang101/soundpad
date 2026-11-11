import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminClient, HttpError, readJson, respond } from '@/lib/admin-http';
import { AudioError, inspectAudio, renderClip, withSource } from '@/lib/audio';
import { assertCurrent, details, getSound, originalUrl, updateSound } from '@/lib/library';
import { audioRange, CLIP_BUCKET } from '@/lib/sound';

export const runtime = 'nodejs';
export const maxDuration = 180;

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('analyze'), id: z.uuid() }),
  z.object({
    action: z.literal('save'), id: z.uuid(), revision: z.uuid(), categoryId: z.uuid(),
    name: z.string().trim().min(1).max(80), startMs: z.number().int(), endMs: z.number().int(),
  }),
]);

export function POST(request: NextRequest) {
  return respond(async () => {
    const input = inputSchema.parse(await readJson(request));
    const client = await adminClient();
    const sound = await getSound(client, input.id);
    assertCurrent(sound, input.action === 'save' ? input.revision : undefined);

    try {
      if (input.action === 'analyze') {
        if (sound.source_duration_ms !== null) return { sound, details: await details(client, sound) };
        const sourceUrl = await originalUrl(client, sound);
        const analyzed = await withSource(sourceUrl, sound.source_bytes, (file) => inspectAudio(file, sound.source_kind));
        const updated = await updateSound(client, sound, {
          source_duration_ms: analyzed.durationMs,
          waveform: analyzed.peaks,
        });
        return { sound: updated, details: { ...analyzed, sourceUrl } };
      }

      if (sound.source_duration_ms === null || !audioRange(input.startMs, input.endMs, sound.source_duration_ms)) {
        throw new HttpError(400, 'เลือกช่วงเสียงตั้งแต่ 0.25 วินาทีถึง 2 นาที ภายในความยาวต้นฉบับ');
      }
      const { data: category, error: categoryError } = await client.from('sound_categories')
        .select('id').eq('id', input.categoryId).maybeSingle();
      if (categoryError) throw categoryError;
      if (!category) throw new HttpError(409, 'ไม่พบหมวดหมู่นี้ กรุณาเลือกหมวดใหม่');

      const path = `${sound.id}/${randomUUID()}.mp3`;
      const clips = client.storage.from(CLIP_BUCKET);
      const sourceUrl = await originalUrl(client, sound);
      await withSource(sourceUrl, sound.source_bytes, async (file, output) => {
        await renderClip(file, output, sound.source_kind, input.startMs, input.endMs);
        const { error } = await clips.upload(path, await readFile(output), {
          contentType: 'audio/mpeg', upsert: false, cacheControl: '60',
        });
        if (error) throw error;
      });

      let saved;
      try {
        saved = await updateSound(client, sound, {
          status: 'ready', name: input.name, category_id: input.categoryId, clip_path: path,
          trim_start_ms: input.startMs, trim_end_ms: input.endMs, duration_ms: input.endMs - input.startMs,
        });
      } catch (error) {
        const current = await getSound(client, sound.id).catch((failure: unknown) => {
          if (failure instanceof HttpError && failure.status === 404) return null;
          throw error;
        });
        if (current?.clip_path === path) return current;
        const { error: cleanupError } = await clips.remove([path]);
        if (cleanupError) console.error('Soundpad clip cleanup failed', sound.id);
        throw error;
      }

      if (sound.clip_path) {
        const { error } = await clips.remove([sound.clip_path]);
        if (error) console.error('Soundpad old clip cleanup failed', sound.id);
      }
      return saved;
    } catch (error) {
      if (error instanceof AudioError) throw new HttpError(422, error.message);
      throw error;
    }
  });
}
