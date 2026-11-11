import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AudioError } from './audio.ts';
import { MAX_SOURCE_BYTES } from './sound.ts';
import { youtubeVideoUrl } from './youtube-url.ts';

export async function importRemoteYouTube<T>(input: string, run: (source: string, title: string, signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
  const video = youtubeVideoUrl(input);
  if (!video) throw new AudioError('วางลิงก์วิดีโอ YouTube หรือ youtu.be ที่ถูกต้อง');
  let endpoint: URL;
  const key = process.env.YOUTUBE_WORKER_KEY;
  try {
    endpoint = new URL('/audio', process.env.YOUTUBE_WORKER_URL);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password ||
        (endpoint.protocol !== 'https:' && !(loopback && endpoint.protocol === 'http:' && process.env.NODE_ENV !== 'production')) || !key) throw new Error();
  } catch { throw new AudioError('ตั้งค่า URL และคีย์ของ YouTube worker ให้ครบและใช้ HTTPS'); }
  const budget = AbortSignal.any([AbortSignal.timeout(210_000), ...(signal ? [signal] : [])]);
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-worker-'));
  const file = join(dir, 'source.mp3');
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: budget,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: video }),
      });
    } catch { throw new AudioError('เชื่อมต่อ YouTube worker ไม่ได้ ตรวจว่าเครื่องและตัวช่วยกำลังทำงานอยู่'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AudioError(response.status === 401 ? 'คีย์ YouTube worker ไม่ถูกต้อง กรุณาให้ผู้ดูแลตรวจการตั้งค่า'
        : response.status === 429 ? 'YouTube worker กำลังทำงานอื่น รอสักครู่แล้วลองใหม่'
          : 'YouTube worker ดึงเสียงไม่สำเร็จ ตรวจบันทึกของตัวช่วยแล้วลองใหม่');
    }
    const length = Number(response.headers.get('content-length'));
    if (!response.body || !response.headers.get('content-type')?.startsWith('audio/mpeg') || length > MAX_SOURCE_BYTES) {
      await response.body?.cancel();
      throw new AudioError('ไฟล์จาก YouTube worker ไม่ถูกต้องหรือมีขนาดเกิน 50 MB');
    }
    let bytes = 0;
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > MAX_SOURCE_BYTES ? new AudioError('ไฟล์เสียงจาก worker มีขนาดเกิน 50 MB') : null, chunk);
    } });
    try {
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limit, createWriteStream(file), { signal: budget });
    } catch (error) {
      if (error instanceof AudioError) throw error;
      throw new AudioError(budget.aborted ? 'การนำเข้าถูกยกเลิกหรือใช้เวลานานเกินไป ลองใหม่อีกครั้ง'
        : 'ได้รับไฟล์เสียงจาก worker ไม่ครบ ลองใหม่อีกครั้ง');
    }
    if ((await stat(file)).size < 1 || (length > 0 && bytes !== length)) throw new AudioError('ได้รับไฟล์เสียงจาก worker ไม่ครบ ลองใหม่อีกครั้ง');
    let title = 'เสียงจาก YouTube';
    try { title = decodeURIComponent(response.headers.get('x-soundpad-title') ?? '') || title; } catch { /* Keep the fallback title. */ }
    budget.throwIfAborted();
    return await run(file, title, budget);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
