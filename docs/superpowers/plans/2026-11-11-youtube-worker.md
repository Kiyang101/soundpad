# Separate YouTube worker implementation plan

> **For agentic workers:** Use superpowers:executing-plans for native execution.

**Goal:** Keep the Vercel website/editor while obtaining audio through a user-selected worker on this Mac.
**Architecture:** Vercel authenticates the existing admin and submits a canonical video URL to a configured HTTPS worker with a private server-only bearer key. The worker uses the existing bounded downloader and streams back MP3; Vercel retains all analysis, private storage and publication logic. The worker has no Supabase credentials, Google cookies, arbitrary fetch endpoint or access to existing sounds.
**Tech stack:** Existing Node.js, FFmpeg and yt-dlp; built-in HTTP server and streaming APIs; temporary Cloudflare HTTPS tunnel.
**Spec:** Production logs verified YouTube bot verification during metadata extraction on Vercel. The user selected this Mac as the temporary worker.

## Global constraints

- Preserve existing limits, auth, same-origin protections, source validation, cancellation and independent cleanup.
- Worker URL/key are server-only environment configuration; HTTPS required except loopback during local development/tests. Never forward the bearer key across redirects.
- One active conversion per worker process; bounded JSON input; unauthorized requests cannot start a downloader; temporary files cleaned after completion/disconnect.
- Reuse local downloader as-is; do not try to bypass YouTube login or verification controls.
- The user authorized this Mac and the production connection. Do not provision paid hosting or permanent startup/power configuration.
- Host suitability requires an actual download test; another datacenter is not assumed to work.

## Review focus

- Missing/invalid auth or URL cannot trigger external downloads.
- Busy requests, oversize audio and interrupted streams do not exhaust resources or leave files.
- A redirect cannot receive the worker bearer key.
- Worker unavailability gives an actionable failure without creating drafts or exposing credentials.
- The direct local importer and existing editor behavior remain available.

### Task 1: Worker service
Files: `src/lib/youtube-worker.ts`, `scripts/youtube-worker.mjs`, `tests/youtube-worker.test.ts`; update `package.json`.
- [x] Test HTTP boundaries: unauthorized, invalid URL/body, busy, health and successful MP3. Remote cancellation is covered; worker cancellation during an active downloader/stream is statically reviewed only.
- [x] Export existing local downloader separately; implement protected single-job HTTP service using it, with no new dependencies.
- [x] Run HTTP tests with executable fixtures and validate standalone startup configuration.

### Task 2: Vercel adapter
Files: `src/lib/youtube.ts`, `tests/youtube-import.test.ts`, `.env.example`, `README.md`.
- [x] Test remote streamed MP3, chunked byte cap, worker failure, bearer auth, redirect refusal, cleanup and cancellation.
- [x] Route configured imports through the worker; keep callbacks and persistence unchanged and bounded by the shared deadline.
- [x] Unit tests: 8 pass; lint, typecheck and build pass. Real Mac-to-public-tunnel integration decoded the selected video to 158139 ms. Fresh static review found no Critical/Important issue.

### Task 3: Hosting and rollout
- [x] User selected this Mac; validate download through a temporary HTTPS tunnel before rollout.
- [x] Run the authenticated loopback worker and temporary tunnel without paid services; configure server-only production values securely.
- [ ] Verify authenticated import on Vercel with the selected recording; preserve existing production sounds; commit/push/deploy as already authorized.

## Execution ledger

- Existing production diagnostic commit: `542f1d0`; Vercel logs show yt-dlp code 1, metadata stage, YouTube bot-verification response.
- User first chose an independently hosted worker, then explicitly changed the choice to this Mac. Run an authenticated loopback worker and a temporary HTTPS tunnel; no paid host, Docker image or permanent startup configuration is needed. The Mac and helper processes must remain running.
- Ruling: omit Docker/hosting-provider files and provisioning; keep a portable Node worker and server-only Vercel adapter. Use a temporary Cloudflare tunnel for the user-approved connection, with no cookies, Supabase credentials, arbitrary URLs, or filesystem endpoint. Tunnel restart changes its URL and requires updating Vercel configuration.
