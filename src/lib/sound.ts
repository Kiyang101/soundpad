export const MAX_SOURCE_BYTES = 50_000_000;
export const MAX_SOURCE_MS = 30 * 60 * 1_000;
export const MIN_CLIP_MS = 250;
export const MAX_CLIP_MS = 120_000;
export const SOURCE_BUCKET = 'soundpad-sources';
export const CLIP_BUCKET = 'soundpad-clips';

export const sourceMime = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
} as const;

export type SourceKind = keyof typeof sourceMime;
export type Category = { id: string; name: string };
export type Pad = { id: string; name: string; categoryId: string; durationMs: number; url: string };
export type Sound = {
  id: string;
  status: 'draft' | 'ready' | 'deleting';
  name: string;
  category_id: string | null;
  source_name: string;
  source_kind: SourceKind;
  source_bytes: number;
  source_duration_ms: number | null;
  duration_ms: number | null;
  trim_start_ms: number | null;
  trim_end_ms: number | null;
  clip_path: string | null;
  revision: string;
};
export type AudioDetails = {
  durationMs: number;
  peaks: number[];
  sourceUrl: string;
};
export type UploadTicket = { sound: Sound; endpoint: string; path: string; token: string };

export function uploadSpec(name: string, bytes: number) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!name.includes('.') || !ext || !Object.hasOwn(sourceMime, ext) ||
      !Number.isInteger(bytes) || bytes < 1 || bytes > MAX_SOURCE_BYTES) return null;
  const kind = ext as SourceKind;
  return { kind, mime: sourceMime[kind] };
}

export function audioRange(start: number, end: number, sourceDuration: number) {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 &&
    end <= sourceDuration && end - start >= MIN_CLIP_MS && end - start <= MAX_CLIP_MS;
}

export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function sourcePath(sound: Pick<Sound, 'id' | 'source_kind'>) {
  return `${sound.id}/original.${sound.source_kind}`;
}
