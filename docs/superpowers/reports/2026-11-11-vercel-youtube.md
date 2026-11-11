# Vercel YouTube import diagnosis

## Verified failure

On 2026-11-11, the production admin submitted the selected public video `3F4_A1gulWs` through the existing authenticated import form. The import failed before creating a source draft or modifying existing sounds.

Deployment: `dpl_EaAVNykLayvYDwNcCQYdUNL96NSX`; function region `sin1`; runtime `nodejs26.x`.

The pinned yt-dlp executable runs and exits with code 1 during **metadata extraction**. Its stderr reports: `Sign in to confirm you’re not a bot`. This is a YouTube verification response, not evidence that the Linux executable is missing or cannot start. It does not establish the exact IP/account rule YouTube applied.

The same selected recording was previously downloaded, converted, decoded and imported successfully on this Mac. The Vercel request fails before FFmpeg conversion and Supabase persistence.

## Changes and checks

- Add bounded server-side diagnostics containing stage, exit code, termination signal and stderr. Replace HTTP(S) URLs with `[URL]` before logging so access-bearing media URLs do not enter the log.
- Verify diagnostic redaction and the metadata-stage boundary through an executable fixture; retain cancellation, limits and temporary-file cleanup checks.
- Unit tests: 6 pass. Lint and typecheck pass. Production diagnostic deployment is Ready; repeated authenticated UI import yields the log above.
- Preserve admin authentication, same-origin checks, canonical URL validation, file/time limits, private originals and existing sounds. No browser cookies exported, Google credentials added, or authentication controls bypassed.

## Next decision

Keep the current website/editor, and run the downloader behind an authenticated endpoint outside Vercel. The known-working Mac is an option but must stay on; an independently hosted worker requires a suitable host and a successful download test before relying on it. Moving to another datacenter alone is not proof that YouTube will accept its requests.

The user has been asked to choose the execution location before creating infrastructure, exposing a new endpoint or adding costs. No worker endpoint or paid service has been provisioned yet.
