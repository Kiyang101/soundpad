# YouTube audio import implementation plan

> **For agentic workers:** Use superpowers:executing-plans for native execution in this session.

**Goal:** Admins paste a public YouTube URL, import bounded audio into the existing editor, publish multiple clips from that source, and download saved MP3s.

**Architecture:** Run a pinned, checksum-verified standalone yt-dlp binary with Node's JS runtime and the existing FFmpeg. Store imported originals in the private source bucket through the admin session. Reuse analyze/save and waveform behavior; copies get independent source paths so deletion stays safe. No new paid service, schema, or credentials.

**Tech stack:** Existing Next.js/React/Supabase/FFmpeg, Node child_process, yt-dlp 2026.10.26.

**Spec:** The user-approved five-point scope in this chat, reproduced below.

## Constraints and acceptance

- Admin-only, same-origin JSON import of a single public video; canonical YouTube watch/shorts/youtu.be/embed URLs only.
- Original <= 50,000,000 bytes and <= 30 minutes; clips 250 ms–120 seconds. Reject live, private and unsupported content with actionable errors.
- Preview and edit before publication. Existing uploads, edits, deletion, revision protection and storage RLS remain intact.
- Save another range as a new sound without overwriting the previously saved sound; each source object belongs to its own sound ID.
- Saved clips can be downloaded as MP3 through an authorized bounded download endpoint.
- No commit, push, deployment, account login, or production catalog changes required for local implementation. Live Vercel validation is a distinct remaining check unless authorized.

## Review focus

- URL spoofing, credentials, ports and arbitrary schemes must never reach the downloader.
- Oversize, overlong, stalled and unavailable downloads must not leave publishable or orphaned objects.
- Copy/save failure must preserve the original sound and avoid silently duplicating successful saves.
- Long-running import status must be announced and duplicate submissions locked.
- Download URLs must use the existing stored clip; public pages must not gain admin access.

### Task 1: Downloader and packaging

Files: create `src/lib/youtube.ts`, `tests/youtube.test.ts`, `scripts/install-ytdlp.mjs`; update `package.json`, `.gitignore`, `next.config.ts`.
Interface: `youtubeVideoUrl(input: string): string | null`; `importYouTube(url: string, run: (source: string, title: string) => Promise<T>): Promise<T>` handles bounded MP3 temp file cleanup.
- [x] Add failing URL normalization/rejection tests and bounded downloader process tests using an executable fixture at the process boundary.
- [x] Install official pinned binary with SHA256 verification; perform a real selected-video extraction attempt and report failures accurately.
- [x] Implement validation, metadata limits, timeout and cleanup, converting local downloaded media with existing FFmpeg.
- [x] Run unit suite and installer twice (first install and verified cache).

### Task 2: Import, copy and download APIs

Files: create `src/app/api/admin/youtube/route.ts`, `src/app/api/admin/download/route.ts`; update `src/lib/library.ts`, library route and request endpoint union.
Interfaces: `POST youtube {url}` returns `{sound,details}`; library `sounds.copy {id,revision}` returns an independent draft; `GET download?id=<soundId>` returns attachment MP3 under admin session.
- [x] Add browser contract tests for unauthenticated and malformed requests and independent-source copy/save behavior.
- [x] Import through admin session, validating media before creating draft; cleanup draft/source on failed persistence.
- [x] Copy through storage/session with an independent ID and source object; retain revision guards.
- [x] Stream bounded existing saved clips as MP3 attachments; no arbitrary remote URL parameter.
- [x] Verify unit/type checks and browser contracts using isolated test data.

### Task 3: Existing admin UI and documentation

Files: update manager, sound-editor, styles as needed, README and browser tests.
- [x] Add a URL form with visible import status; pass the imported result to the same editor.
- [x] Add an explicit save-as-new action for ready sounds, preserving original edits; allow another range from a saved source.
- [x] Add saved-clip download links and clear post-save access back to the editor.
- [x] Run lint, typecheck, full unit tests, production build, and meaningful browser checks at desktop/mobile sizes.
- [x] Request one fresh read-only review, fix material findings and document live-test limitations.

## Execution ledger

- Baseline: clean `build/soundpad` branch; all 3 existing unit tests pass.
- Ruling: work on the existing feature branch and execute natively; the user already authorized proceeding and no unrelated work is present. No extra worktree or integration/publishing step.

## Verified outcome

- Task 1 complete: official pinned binary installed and cache verified; real selected YouTube recording downloaded and decoded (158,139 ms); all 6 unit tests pass, including URL rejection, oversize/live/unknown metadata, temporary cleanup, and cancellation before/during analysis.
- Task 2 complete: real isolated local Supabase integration verified admin guards, invalid URL rejection, independent-source copy, original preservation after copy/deletion, and MP3 attachment delivery. No migrations or production catalog mutations.
- Task 3 complete: existing iPhone WebKit and Android Chromium flows pass; final full browser suite: 7 passed, 3 intentionally skipped (near-limit upload on both projects and duplicate live extraction on iPhone). Live Android import of the selected Den-O clip publishes all four ranges, verifies playback/download, then removes test records.
- Lint, standalone typecheck, production build and git diff whitespace checks pass. Build tracing contains yt-dlp, FFmpeg and FFprobe for the import route. Mobile and desktop captures inspected.
- Fresh review found implicit Enter creating a copy and an incomplete import deadline; each was reproduced with a failing regression, corrected, and rechecked by the reviewer with no remaining material findings. Import now shares a 210-second budget through analysis and Supabase requests, with independent 30-second cleanup.
- Test-only local admin password rotated after it appeared in an ignored failure report; no production account or config changed. The login test clears its password field before recording a failed login, and reuses its session to avoid exceeding the application's login rate limit.
- Remaining deployment validation: actual Vercel Linux binary/runtime and YouTube server-IP access have not been exercised. No commit, push, merge or deployment performed.
