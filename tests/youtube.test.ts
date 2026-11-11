import assert from 'node:assert/strict';
import { test } from 'node:test';
import { youtubeVideoUrl } from '../src/lib/youtube-url.ts';

test('normalizes only supported single-video YouTube links', () => {
  const canonical = 'https://www.youtube.com/watch?v=3F4_A1gulWs';
  for (const input of [canonical, ' https://youtu.be/3F4_A1gulWs?t=11 ',
    'https://m.youtube.com/watch?v=3F4_A1gulWs&list=other',
    'https://www.youtube.com/shorts/3F4_A1gulWs', 'https://www.youtube.com/embed/3F4_A1gulWs']) {
    assert.equal(youtubeVideoUrl(input), canonical);
  }
});

test('rejects spoofed hosts, arbitrary URLs, credentials, ports, playlists and malformed IDs', () => {
  for (const input of ['http://youtu.be/3F4_A1gulWs', 'https://youtube.com.evil.test/watch?v=3F4_A1gulWs',
    'https://evil.test/?v=3F4_A1gulWs', 'https://user:pass@youtube.com/watch?v=3F4_A1gulWs',
    'https://youtu.be:8443/3F4_A1gulWs', 'https://youtube.com/playlist?list=123',
    'https://youtube.com/watch?v=short', 'https://youtube.com/watch?v=3F4_A1gulWs&v=other',
    'https://youtu.be/3F4_A1gulWs/extra', 'file:///etc/passwd', '', '--exec=command']) {
    assert.equal(youtubeVideoUrl(input), null, input);
  }
});
