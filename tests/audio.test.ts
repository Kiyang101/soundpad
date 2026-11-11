import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { inspectAudio, renderClip } from '../src/lib/audio.ts';
import { audioRange, uploadSpec } from '../src/lib/sound.ts';

const exec = promisify(execFile);

test('accepts exact upload boundaries and rejects unsupported files', () => {
  assert.equal(uploadSpec('recording.M4A', 50_000_000)?.mime, 'audio/mp4');
  assert.equal(uploadSpec('recording.MP3', 50_000_001), null);
  assert.equal(uploadSpec('recording.exe', 12), null);
});

test('validates a bounded range in milliseconds', () => {
  assert.equal(audioRange(500, 750, 750), true);
  assert.equal(audioRange(500, 749, 750), false);
  assert.equal(audioRange(0, 120_001, 180_000), false);
  assert.equal(audioRange(0, 750, 749), false);
  assert.equal(audioRange(0.3, 300, 750), false);
});

test('probes real audio and exports only the selected part', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'soundpad-test-'));
  try {
    const source = join(dir, 'source.wav');
    const output = join(dir, 'clip.mp3');
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-v', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0:d=1:s=44100',
      '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-filter_complex', 'concat=n=2:v=0:a=1',
      '-c:a', 'pcm_s16le', source,
    ]);
    const info = await inspectAudio(source, 'wav');
    assert.equal(info.durationMs, 2000);
    assert.equal(info.peaks[10], 0);
    assert.ok(info.peaks.at(-10)! > 0.10);
    await renderClip(source, output, 'wav', 1100, 1600);
    const clip = await inspectAudio(output, 'mp3');
    assert.ok(clip.durationMs >= 480 && clip.durationMs <= 540);
    assert.ok(Math.max(...clip.peaks.slice(80, 160)) > 0.07);
    assert.ok(Math.max(...clip.peaks.slice(-160, -80)) > 0.07);
    await assert.rejects(() => inspectAudio(source, 'm4a'));
    await writeFile(join(dir, 'invalid.mp3'), 'not audio');
    await assert.rejects(() => inspectAudio(join(dir, 'invalid.mp3'), 'mp3'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
