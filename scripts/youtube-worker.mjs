import { createYouTubeWorker } from '../src/lib/youtube-worker.ts';

const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createYouTubeWorker(process.env.YOUTUBE_WORKER_KEY || '');
server.listen(port, '127.0.0.1', () => console.log(`Soundpad YouTube worker listening on 127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.closeAllConnections();
  server.close();
});
