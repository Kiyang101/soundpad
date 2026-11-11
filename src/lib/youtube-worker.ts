import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { AudioError } from './audio.ts';
import { downloadYouTube } from './youtube.ts';
import { youtubeVideoUrl } from './youtube-url.ts';

export function createYouTubeWorker(key: string) {
  if (key.length < 32) throw new Error('YOUTUBE_WORKER_KEY must contain at least 32 characters');
  const expected = Buffer.from(`Bearer ${key}`);
  let busy = false;
  const server = createServer(async (request, response) => {
    function json(status: number, error: string) {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error }));
    }
    if (request.method === 'GET' && request.url === '/health') return json(200, '');
    if (request.method !== 'POST' || request.url !== '/audio') return json(404, 'Not found');
    const authorization = Buffer.from(request.headers.authorization ?? '');
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) return json(401, 'Unauthorized');
    if (busy) { response.setHeader('Retry-After', '5'); return json(429, 'Worker is busy'); }
    if (!request.headers['content-type']?.includes('application/json')) return json(415, 'Expected JSON');
    // Reserve before reading the body so parallel requests cannot start extra jobs.
    busy = true;
    const cancellation = new AbortController();
    request.on('aborted', () => cancellation.abort());
    response.on('close', () => { if (!response.writableFinished) cancellation.abort(); });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4096) { json(413, 'Request too large'); request.resume(); return; }
        chunks.push(Buffer.from(chunk));
      }
      let url: string | null;
      try {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        url = typeof input?.url === 'string' ? youtubeVideoUrl(input.url) : null;
      } catch { return json(400, 'Invalid JSON'); }
      if (!url) return json(400, 'Invalid YouTube URL');
      await downloadYouTube(url, async (file, title, signal) => {
        const { size: bytes } = await stat(file);
        response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': bytes,
          'X-Soundpad-Title': encodeURIComponent(Array.from(title).slice(0, 80).join('')),
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        await pipeline(createReadStream(file), response, { signal });
      }, cancellation.signal);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(error instanceof AudioError ? 422 : 500,
        error instanceof AudioError ? error.message : 'Worker failed');
    } finally { busy = false; }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
