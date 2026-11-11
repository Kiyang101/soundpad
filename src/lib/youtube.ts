import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { AudioError } from './audio.ts';
import { MAX_SOURCE_BYTES, MAX_SOURCE_MS } from './sound.ts';
import { youtubeVideoUrl } from './youtube-url.ts';

const exec = promisify(execFile);

export async function importYouTube<T>(input: string, run: (source: string, title: string, signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
  const url = youtubeVideoUrl(input);
  if (!url) throw new AudioError('วางลิงก์วิดีโอ YouTube หรือ youtu.be ที่ถูกต้อง');
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-youtube-'));
  const raw = join(dir, 'download');
  const output = join(dir, 'source.mp3');
  const oversized = new AbortController();
  const budget = AbortSignal.any([AbortSignal.timeout(210_000), oversized.signal, ...(signal ? [signal] : [])]);
  const args = ['--ignore-config', '--no-playlist', '--no-cache-dir', '--no-progress',
    '--socket-timeout', '15', '--retries', '1', '--extractor-retries', '1', '--fragment-retries', '1',
    '--js-runtimes', `node:${process.execPath}`];
  const download = async (options: string[]) => {
    try {
      return await exec(process.env.YTDLP_PATH || join(process.cwd(), '.tools/yt-dlp'), [...args, ...options, '--', url], {
        signal: budget, timeout: 150_000, maxBuffer: 2 * 1024 * 1024,
      });
    } catch (error) {
      if (oversized.signal.aborted) throw new AudioError('เสียงต้นฉบับต้องมีขนาดไม่เกิน 50 MB');
      if (budget.aborted) throw new AudioError('การนำเข้าถูกยกเลิกหรือใช้เวลานานเกินไป ลองใหม่อีกครั้ง');
      const failure = error as { code?: string | number; signal?: string; stderr?: string };
      console.error('Soundpad YouTube downloader failed', {
        stage: options.includes('--dump-single-json') ? 'metadata' : 'download',
        code: failure.code, signal: failure.signal,
        stderr: (failure.stderr ?? '').replace(/https?:\/\/\S+/g, '[URL]').slice(-3000),
      });
      if (failure.code === 'ENOENT') throw new AudioError('ตัวนำเข้า YouTube ยังไม่พร้อม กรุณาให้ผู้ดูแลตั้งค่าตัวดาวน์โหลดบนเซิร์ฟเวอร์');
      if (/sign in|bot|403|po.token/i.test(failure.stderr ?? '')) {
        throw new AudioError('YouTube ปฏิเสธการดาวน์โหลดจากเซิร์ฟเวอร์นี้ ลองใหม่ภายหลังหรืออัปโหลดไฟล์เสียงแทน');
      }
      throw new AudioError('ดึงเสียง YouTube ไม่สำเร็จ ตรวจว่าเป็นวิดีโอสาธารณะที่เปิดดูได้ แล้วลองใหม่');
    }
  };
  try {
    const { stdout } = await download(['--dump-single-json', '--skip-download']);
    let info: { title?: string; duration?: number; is_live?: boolean; live_status?: string };
    try {
      info = JSON.parse(stdout);
      if (!info || typeof info !== 'object') throw new Error('Invalid metadata');
    } catch { throw new AudioError('อ่านข้อมูลวิดีโอ YouTube ไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    if (info.is_live || info.live_status === 'is_upcoming' || info.live_status === 'post_live') {
      throw new AudioError('ยังไม่นำเข้าไลฟ์หรือวิดีโอที่กำลังประมวลผล เลือกวิดีโอที่เผยแพร่แล้ว');
    }
    if (typeof info.duration !== 'number' || !Number.isFinite(info.duration) || info.duration <= 0 || info.duration > MAX_SOURCE_MS / 1000) {
      throw new AudioError('เลือกวิดีโอที่ทราบความยาวและยาวไม่เกิน 30 นาที');
    }
    const monitor = setInterval(() => {
      void stat(raw).then(({ size }) => { if (size > MAX_SOURCE_BYTES) oversized.abort(); }, () => {});
    }, 250);
    monitor.unref();
    try {
      await download(['--format', 'bestaudio[protocol=https]', '--no-part', '--output', raw,
        '--max-filesize', String(MAX_SOURCE_BYTES), '--buffer-size', '64K']);
    } finally {
      clearInterval(monitor);
    }
    const sourceBytes = (await stat(raw).catch(() => null))?.size ?? 0;
    if (sourceBytes < 1 || sourceBytes > MAX_SOURCE_BYTES || oversized.signal.aborted) {
      throw new AudioError('ดึงไฟล์เสียงไม่ได้ หรือไฟล์ต้นฉบับมีขนาดเกิน 50 MB');
    }
    try {
      await exec(process.env.FFMPEG_PATH || ffmpeg || 'ffmpeg', [
        '-v', 'error', '-nostdin', '-xerror', '-protocol_whitelist', 'file,pipe',
        '-format_whitelist', 'mov,mp3,matroska,webm,ogg,wav,aac', '-i', raw,
        '-map', '0:a:0', '-t', '1801', '-fs', String(MAX_SOURCE_BYTES + 1), '-map_metadata', '-1',
        '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', output,
      ], { signal: budget, timeout: 60_000, maxBuffer: 1024 * 1024 });
    } catch {
      throw new AudioError('แปลงเสียงจาก YouTube ไม่สำเร็จ ลองใหม่หรือเลือกวิดีโออื่น');
    }
    const bytes = (await stat(output)).size;
    if (bytes < 1 || bytes > MAX_SOURCE_BYTES) throw new AudioError('ไฟล์เสียงต้องมีขนาดไม่เกิน 50 MB');
    try {
      budget.throwIfAborted();
      return await run(output, typeof info.title === 'string' ? info.title.trim() || 'เสียงจาก YouTube' : 'เสียงจาก YouTube', budget);
    } catch (error) {
      if (budget.aborted) throw new AudioError('การนำเข้าถูกยกเลิกหรือใช้เวลานานเกินไป ลองใหม่อีกครั้ง');
      throw error;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
