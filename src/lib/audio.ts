import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { MAX_SOURCE_BYTES, MAX_SOURCE_MS, MIN_CLIP_MS, type SourceKind } from './sound.ts';

const exec = promisify(execFile);
const SAMPLE_RATE = 2000;
function inputOptions(kind: SourceKind) {
  const format = kind === 'm4a' ? 'mov' : kind;
  return ['-protocol_whitelist', 'file,pipe', '-format_whitelist', format, '-f', format,
    ...(kind === 'm4a' ? ['-enable_drefs', '0'] : [])];
}
const MAX_BUFFER = 8 * 1024 * 1024;

export class AudioError extends Error {}

export async function inspectAudio(file: string, kind: SourceKind, signal?: AbortSignal) {
  try {
    const { stdout } = await exec(process.env.FFPROBE_PATH || (process.platform === 'darwin' ? 'ffprobe' : ffprobe.path), [
      '-v', 'error', ...inputOptions(kind), '-select_streams', 'a:0',
      '-show_entries', 'format=format_name,duration:stream=codec_name,duration', '-of', 'json', file,
    ], { timeout: 20_000, signal });
    const { format, streams } = JSON.parse(stdout);
    const stream = streams?.[0];
    const codec: string = stream?.codec_name ?? '';
    const container: string = format?.format_name ?? '';
    const matches = kind === 'mp3' ? container === 'mp3' && codec === 'mp3'
      : kind === 'wav' ? container === 'wav' && codec.startsWith('pcm_')
      : container.split(',').includes('m4a') && codec === 'aac';
    if (!matches) throw new AudioError('ชนิดไฟล์เสียงไม่ตรงกับนามสกุลที่รองรับ');
    const reportedMs = Number(stream.duration ?? format.duration) * 1000;
    if (reportedMs > MAX_SOURCE_MS + 1000) throw new AudioError('ต้นฉบับต้องยาวไม่เกิน 30 นาที');

    const { stdout: pcm } = await exec(process.env.FFMPEG_PATH || ffmpeg || 'ffmpeg', [
      '-v', 'error', '-nostdin', '-xerror', ...inputOptions(kind), '-i', file, '-map', '0:a:0',
      '-t', String((MAX_SOURCE_MS + 1000) / 1000), '-ac', '1', '-ar', String(SAMPLE_RATE),
      '-f', 's16le', 'pipe:1',
    ], { encoding: 'buffer', maxBuffer: MAX_BUFFER, timeout: 75_000, signal });
    const samples = pcm.length / 2;
    const durationMs = Math.floor(samples * 1_000 / SAMPLE_RATE);
    if (durationMs > MAX_SOURCE_MS) throw new AudioError('ต้นฉบับต้องยาวไม่เกิน 30 นาที');
    if (durationMs < MIN_CLIP_MS) throw new AudioError('ต้นฉบับต้องยาวอย่างน้อย 0.25 วินาที');
    const bins = Math.min(samples, 640);
    const peaks = Array.from({ length: bins }, (_, bin) => {
      let peak = 0;
      for (let i = Math.floor(bin * samples / bins); i < Math.floor((bin + 1) * samples / bins); i++) {
        peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
      }
      return Math.round(peak / 32_768 * 1_000) / 1_000;
    });
    return { durationMs, peaks };
  } catch (error) {
    if (error instanceof AudioError) throw error;
    throw new AudioError('อ่านไฟล์เสียงไม่ได้ ลองเลือกไฟล์ MP3, WAV หรือ M4A ที่เปิดเล่นได้', { cause: error });
  }
}

export async function renderClip(file: string, output: string, kind: SourceKind, startMs: number, endMs: number) {
  try {
    await exec(process.env.FFMPEG_PATH || ffmpeg || 'ffmpeg', [
      '-v', 'error', '-nostdin', '-xerror', ...inputOptions(kind), '-i', file,
      '-ss', String(startMs / 1000), '-t', String((endMs - startMs) / 1000),
      '-map', '0:a:0', '-map_metadata', '-1', '-ac', '2', '-ar', '44100',
      '-c:a', 'libmp3lame', '-b:a', '128k', output,
    ], { timeout: 75_000 });
  } catch (error) {
    throw new AudioError('สร้างคลิปไม่ได้ ลองบันทึกช่วงที่เลือกอีกครั้ง', { cause: error });
  }
}

export async function withSource<T>(
  url: string, expectedBytes: number, run: (source: string, output: string) => Promise<T>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-'));
  try {
    const source = join(dir, 'original');
    const result = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(55_000) });
    if (!result.ok || !result.body) throw new AudioError('เปิดต้นฉบับไม่ได้ ตรวจว่าอัปโหลดไฟล์ครบแล้ว');
    let size = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_SOURCE_BYTES || size > expectedBytes) {
          callback(new AudioError('ขนาดไฟล์ต้นฉบับไม่ตรงกับที่ระบุ'));
        } else {
          callback(null, chunk);
        }
      },
    });
    await pipeline(Readable.fromWeb(result.body as import('node:stream/web').ReadableStream), limit, createWriteStream(source));
    if (size !== expectedBytes) throw new AudioError('ไฟล์ต้นฉบับอัปโหลดไม่ครบ');
    return await run(source, join(dir, 'clip.mp3'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
