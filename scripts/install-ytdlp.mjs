import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '2026.10.26';
const release = process.platform === 'darwin'
  ? { name: 'yt-dlp_macos', sha: '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa' }
  : process.platform === 'linux' && process.arch === 'x64'
    ? { name: 'yt-dlp_linux', sha: '767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795' } : null;
if (!release) throw new Error('YouTube import requires macOS or Linux x64.');
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../.tools/yt-dlp');
const digest = (data) => createHash('sha256').update(data).digest('hex');
const existing = await readFile(destination).catch(() => null);
if (existing && digest(existing) === release.sha) {
  await chmod(destination, 0o755);
  console.log(`yt-dlp ${version}: verified cached binary`);
} else {
  const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${release.name}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`yt-dlp download failed (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== release.sha) throw new Error('yt-dlp checksum mismatch');
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data, { mode: 0o755, flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`yt-dlp ${version}: installed verified binary`);
}
