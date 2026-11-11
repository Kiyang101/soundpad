import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { access, chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createYouTubeWorker } from '../src/lib/youtube-worker.ts';
import { importYouTube } from '../src/lib/youtube.ts';
import { inspectAudio } from '../src/lib/audio.ts';
import { MAX_SOURCE_BYTES } from '../src/lib/sound.ts';

test('worker authenticates, validates, streams MP3 and the remote importer cleans its files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worker-test-'));
  const binary = join(dir, 'downloader.mjs');
  const audio = join(dir, 'source.wav');
  const key = 'synthetic-test-key-'.padEnd(48, 'x');
  const saved = { binary: process.env.YTDLP_PATH, url: process.env.YOUTUBE_WORKER_URL, key: process.env.YOUTUBE_WORKER_KEY };
  const server = createYouTubeWorker(key);
  try {
    await promisify(execFile)('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=2', audio]);
    await writeFile(binary, `#!${process.execPath}
import {copyFile} from 'node:fs/promises';
const args=process.argv.slice(2);
if(args.includes('--dump-single-json')) console.log(JSON.stringify({title:'เดนโอ',duration:2,is_live:false}));
else await copyFile(${JSON.stringify(audio)},args[args.indexOf('--output')+1]);
`);
    await chmod(binary, 0o755);
    process.env.YTDLP_PATH = binary;
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/audio`, { method: 'POST', body: '{}' })).status, 401);
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/audio`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://evil.test/' }) })).status, 400);
    assert.equal((await fetch(`${base}/audio`, { method: 'POST', headers, body: 'x'.repeat(4097) })).status, 413);
    process.env.YOUTUBE_WORKER_URL = base;
    process.env.YOUTUBE_WORKER_KEY = key;
    let path = '';
    await importYouTube('https://youtu.be/3F4_A1gulWs', async (file, title) => {
      path = file;
      assert.equal(title, 'เดนโอ');
      const decoded = await inspectAudio(file, 'mp3');
      assert.ok(decoded.durationMs >= 2000 && decoded.durationMs < 2100);
    });
    await assert.rejects(access(path));
    process.env.YOUTUBE_WORKER_KEY = 'wrong-key';
    await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('unauthorized worker')), /คีย์|worker/);
    process.env.YOUTUBE_WORKER_KEY = key;
    const redirect = createServer((_req, res) => { res.writeHead(302, { Location: `${base}/audio` }); res.end(); });
    let forwarded = 0;
    const countForwarded = () => { forwarded++; };
    server.on('request', countForwarded);
    redirect.listen(0, '127.0.0.1'); await once(redirect, 'listening');
    try {
      process.env.YOUTUBE_WORKER_URL = `http://127.0.0.1:${(redirect.address() as { port: number }).port}`;
      await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('redirect followed')));
      assert.equal(forwarded, 0, 'the bearer key must not be forwarded to a redirect target');
    } finally { redirect.closeAllConnections(); redirect.close(); }
    server.off('request', countForwarded);
    process.env.YOUTUBE_WORKER_URL = 'http://example.test';
    await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('insecure worker')));
    const received = once(server, 'request');
    const slow = request(`${base}/audio`, { method: 'POST', headers });
    slow.on('error', () => {});
    slow.write('{"url":');
    await received;
    try {
      assert.equal((await fetch(`${base}/audio`, { method: 'POST', headers, body: '{}' })).status, 429);
    } finally { slow.destroy(); }
  } finally {
    for (const [name, value] of [['YTDLP_PATH', saved.binary], ['YOUTUBE_WORKER_URL', saved.url], ['YOUTUBE_WORKER_KEY', saved.key]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    server.closeAllConnections(); server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('remote importer rejects oversized chunked audio and cancellation before persistence', async () => {
  const saved = { url: process.env.YOUTUBE_WORKER_URL, key: process.env.YOUTUBE_WORKER_KEY };
  let mode = 'oversize';
  const cancellation = new AbortController();
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    if (mode === 'abort') {
      res.write(Buffer.alloc(1024));
      setTimeout(() => cancellation.abort(), 20);
      return;
    }
    res.end(Buffer.alloc(MAX_SOURCE_BYTES + 1));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  process.env.YOUTUBE_WORKER_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.YOUTUBE_WORKER_KEY = 'synthetic-key';
  try {
    await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('oversized source persisted')), /50 MB/);
    mode = 'abort';
    await assert.rejects(importYouTube('https://youtu.be/3F4_A1gulWs', async () => assert.fail('cancelled source persisted'), cancellation.signal), /ยกเลิก/);
  } finally {
    for (const [name, value] of [['YOUTUBE_WORKER_URL', saved.url], ['YOUTUBE_WORKER_KEY', saved.key]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    server.closeAllConnections(); server.close();
  }
});
