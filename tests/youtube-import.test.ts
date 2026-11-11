import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { importYouTube } from '../src/lib/youtube.ts';
import { inspectAudio } from '../src/lib/audio.ts';

const exec = promisify(execFile);

test('imports decoded audio, rejects invalid upstreams and cleans temporary files after failures', async (t) => {
  const diagnostics = t.mock.method(console, 'error', () => {});
  const dir = await mkdtemp(join(tmpdir(), 'youtube-fixture-'));
  const binary = join(dir, 'downloader.mjs');
  const input = join(dir, 'source.wav');
  const original = process.env.YTDLP_PATH;
  try {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=2', input]);
    await writeFile(binary, `#!${process.execPath}
import {copyFile,writeFile,truncate} from 'node:fs/promises';
const args=process.argv.slice(2), mode=process.env.SOUNDPAD_YOUTUBE_FIXTURE;
if(mode==='blocked'){console.error('Sign in to confirm you are not a bot https://example.test/?token=private-fixture-value');process.exit(1);}
if(mode==='hang'){await new Promise(r=>setTimeout(r,30000));}
if(args.includes('--dump-single-json')) console.log(JSON.stringify({title:'เดนโอ / Sword',duration:mode==='long'?1801:mode==='unknown'?null:2,is_live:mode==='live'}));
else {const output=args[args.indexOf('--output')+1];await copyFile(${JSON.stringify(input)},output);if(mode==='large')await truncate(output,50000001);await writeFile(${JSON.stringify(join(dir, 'last-path'))},output);}
`);
    await chmod(binary, 0o755);
    process.env.YTDLP_PATH = binary;
    let imported = '';
    const duration = await importYouTube('https://youtu.be/3F4_A1gulWs', async (file, title) => {
      imported = file;
      assert.equal(title, 'เดนโอ / Sword');
      assert.ok((await readFile(file)).length > 0);
      return (await inspectAudio(file, 'mp3')).durationMs;
    });
    assert.ok(duration >= 2000 && duration < 2100);
    await assert.rejects(access(imported));
    for (const duringAnalysis of [false, true]) {
      const cancellation = new AbortController();
      let reachedPersistence = false;
      await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async (file, _title, signal) => {
        if (duringAnalysis) setTimeout(() => cancellation.abort(), 0);
        else cancellation.abort();
        await inspectAudio(file, 'mp3', signal);
        reachedPersistence = true;
      }, cancellation.signal));
      assert.equal(reachedPersistence, false, 'cancelled analysis must not start persistence');
    }
    for (const mode of ['long', 'unknown', 'live', 'large', 'blocked']) {
      process.env.SOUNDPAD_YOUTUBE_FIXTURE = mode;
      await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('invalid source was imported')));
    }
    const failureLog = diagnostics.mock.calls.find((call) => call.arguments[0] === 'Soundpad YouTube downloader failed');
    assert.ok(failureLog, 'log the downloader failure to diagnose the actual production boundary');
    const diagnostic = failureLog.arguments[1] as { stage: string; stderr: string };
    assert.equal(diagnostic.stage, 'metadata');
    assert.match(diagnostic.stderr, /not a bot/);
    assert.ok(!diagnostic.stderr.includes('private-fixture-value'), 'never log access-bearing URLs');
    delete process.env.SOUNDPAD_YOUTUBE_FIXTURE;
    await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async (file) => {
      imported = file;
      throw new Error('persistence failed');
    }), /persistence failed/);
    await assert.rejects(access(imported));
    process.env.SOUNDPAD_YOUTUBE_FIXTURE = 'hang';
    await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('aborted'), AbortSignal.timeout(100)));
    await assert.rejects(importYouTube('https://evil.test/', async () => assert.fail('invalid URL')));
  } finally {
    if (original === undefined) delete process.env.YTDLP_PATH; else process.env.YTDLP_PATH = original;
    delete process.env.SOUNDPAD_YOUTUBE_FIXTURE;
    await rm(dir, { recursive: true, force: true });
  }
});
