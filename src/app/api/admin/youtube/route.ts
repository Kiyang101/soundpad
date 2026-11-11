import { readFile } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminClient, HttpError, readJson, respond } from '@/lib/admin-http';
import { AudioError, inspectAudio } from '@/lib/audio';
import { createSourceSound } from '@/lib/library';
import { SOURCE_BUCKET, sourcePath } from '@/lib/sound';
import { importYouTube } from '@/lib/youtube';
import { youtubeVideoUrl } from '@/lib/youtube-url';
import { createSessionClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({ url: z.string().max(2048).refine((url) => youtubeVideoUrl(url) !== null) });

export function POST(request: NextRequest) {
  return respond(async () => {
    await adminClient();
    const { url } = schema.parse(await readJson(request));
    try {
      return await importYouTube(url, async (file, title, signal) => {
        const analyzed = await inspectAudio(file, 'mp3', signal);
        const bytes = await readFile(file, { signal });
        signal.throwIfAborted();
        const client = await createSessionClient(signal);
        return createSourceSound(client, {
          name: Array.from(title).slice(0, 80).join('').trim() || 'เสียงจาก YouTube',
          source_name: `youtube-${new URL(youtubeVideoUrl(url)!).searchParams.get('v')}.mp3`,
          source_kind: 'mp3', source_bytes: bytes.length,
          source_duration_ms: analyzed.durationMs, waveform: analyzed.peaks,
        }, async (sound) => {
          const { error } = await client.storage.from(SOURCE_BUCKET).upload(sourcePath(sound), bytes, {
            contentType: 'audio/mpeg', cacheControl: '60', upsert: false,
          });
          if (error) throw error;
        }, () => createSessionClient(AbortSignal.timeout(30_000)));
      }, request.signal);
    } catch (error) {
      if (error instanceof AudioError) throw new HttpError(422, error.message);
      throw error;
    }
  });
}
