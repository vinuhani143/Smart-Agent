# MusicMix security audit (STEP 8)

Date: 2026-08-18  
Scope: repository as of this change (Expo app + Express API + Prisma).  
This is a code and configuration audit. It is **not** a penetration test against a live production deployment.

Checklist values:

- **PASS** — inspected in this audit and the control is present
- **FAIL** — inspected and the control is missing or broken
- **TODO** — still required before a production release (not a silent pass)

## Checklist

| Control | Status | Evidence |
| --- | --- | --- |
| No secrets in repository | **PASS** | Searched `.ts`, `.tsx`, `.js`, `.json`, `.env*`, README, docs. Only placeholders in `.env.example` / `.env.production.example`. Test fixtures use fake values (`Atza\|access`, `ya29.access`). Gitignore covers `.env`, `.env.*`, `*.pem`, `*.key`, credential filenames. |
| OAuth protected | **PASS** | Spotify, Google/YouTube, and Amazon LWA use authorization code + PKCE. `state` is stored server-side, expires in 10 minutes, and is deleted after use. Callback rejects provider mismatch. Redirect URIs come from env, not the client. |
| Tokens protected | **PASS** | `TokenEncryptionService` wraps AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, 32-byte hex). Refresh tokens are not in public DTOs. `GET /api/providers` selects no token columns. PKCE verifiers are encrypted at rest. |
| API authorization verified | **PASS** | `requireAuth` reads the MusicMix session JWT from `Authorization: Bearer` or the `musicmix_session` cookie. `req.userId` is set from `verifySession`. Playlist, conversion, AI, search, and provider routes use `requireAuth`. |
| IDOR protection verified | **PASS** | Playlist, conversion, and AI generation lookups use `{ id, userId }` from the session. Provider accounts are keyed by `{ userId, provider }`. Create bodies use Zod `.strict()` and reject injected `userId`. **TODO:** HTTP IDOR suite against Postgres (not run here; no live multi-user DB in this environment). |
| Input validation | **PASS** | Zod on command bodies (`.strict()`), search query params (length, years 1900–2100, non-negative durations, provider enum), AI prompt max 1000, `maxTracks` max 50. JSON body limit `1mb`. |
| Rate limiting | **PASS** | `express-rate-limit`: 300/15min API, 40/15min auth, 20/15min AI generate. **TODO:** Redis (or equivalent) store before running more than one API instance. |
| Secure logging | **PASS** | Structured JSON logs. Secret **keys** (`refreshToken`, `authorization_code`, `client_secret`, `api_key`, `database_url`, …) are redacted. Request id, method, path (query stripped), status, duration are allowed. |
| Error sanitization | **PASS** | Central `errorHandler`: `{ code, message, requestId }`. No stack traces. Token fields stripped from `details`. `DEBUG_ERRORS=true` may add `debug: err.name` only when `NODE_ENV !== production`. |
| Database constraints | **PASS** | FKs with `onDelete: Cascade`. Uniques: `MusicAccount` `(userId, provider)` and `(provider, providerUserId)`; `PlaylistTrack` `(playlistId, trackId)` and `(playlistId, position)`; provider ids on `Track`. Indexes on user-owned lists. |
| Dependency audit | **TODO** | See “Dependency audit” below. Re-run `npm audit` at release time. |
| AI safety | **PASS** | LLM returns intent/ranking/copy only. Backend calls provider APIs. Unsafe prompts (download/rip, injection, SQL, `eval`) are rejected. Output is parsed as JSON criteria, not executed. |
| Duplicate request protection | **PASS** | UI loading/disabled buttons plus in-process `oncePerKey` on create playlist, conversion create, AI generate, AI create-on-provider. Conversion `CREATED` with a destination id returns the existing playlist. **TODO:** shared lock (Redis) for multi-instance. |
| Production environment separation | **PASS** (templates) / **TODO** (deploy) | `.env.example` vs `.env.production.example`. Frontend warns if a non-dev build still points at localhost. Production API URL is not hardcoded in `eas.json`. |

## What is stored (privacy)

See [privacy.md](./privacy.md). Summary: anonymous MusicMix user id, playlist/track metadata, encrypted provider tokens, OAuth state (short-lived), AI prompt + parsed intent. Spotify/Google emails are not copied onto `User` even if a provider profile contains an email.

## Findings fixed in this audit

- Duplicate `searchRouter` registration (validated routes were overwritten by unvalidated ones).
- Logger redacted **all** strings in meta, including path and request id; now only secret **field names** are redacted.
- Provider HTTP 404 was a `NetworkError` and could be retried; it is now `NotFoundError` and is not retried.
- YouTube quota, 401, 403, and 404 are excluded from transient retry.
- AI `maxTracks` aligned to 50 (schema + intent validation).
- `TokenEncryptionService` abstraction over existing AES-256-GCM (no homemade cipher).
- Request id middleware, sanitized 500s, playlist list no longer over-fetches tracks, provider list omits token columns, PKCE verifier encryption, OAuth provider-mismatch rejection, JWT `algorithms: ['HS256']`.
- In-process idempotency for create/convert/generate; conversion will not create a second destination playlist after `CREATED`.
- Frontend 20s timeouts, session 401 recovery only for MusicMix session errors, https/http artwork URLs only.

## Remaining TODOs (release blockers in **bold**)

- **Configure production secrets** (`JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, provider client secrets, `AI_API_KEY`) in a secret manager. Never commit them.
- **Set production `API_PUBLIC_URL`, CORS origins, OAuth redirect URIs, and `EXPO_PUBLIC_API_URL`** to HTTPS. Do not ship a binary that still defaults to `http://127.0.0.1:4000`.
- **Apply Prisma migrations** to production Postgres (including `Playlist_userId_updatedAt_idx`).
- **Anonymous sessions:** JWT is 30 days; expiry creates a new user and orphans playlists. Real account recovery is required for a consumer product.
- **Amazon Music** remains closed beta / disabled by default. Do not market it as available.
- Multi-instance: in-memory rate limit + `oncePerKey` are process-local.
- HTTP integration tests for IDOR (two users, swap IDs) once a test database is available.
- ESLint is not configured (`npm run lint` does not exist). Typecheck + tests are the current gates.
- OAuth `codeVerifier` column still stores ciphertext under a plaintext-looking name (acceptable; optional rename).
- Horizontal rate-limit store (Redis).
- Privacy policy URL, Play Store data-safety form, and EAS production signing (out of scope for this step; **do not** produce an AAB here).

## OAuth / token notes

| Provider | PKCE | State | Secrets on client |
| --- | --- | --- | --- |
| Spotify | yes (S256, verifier on server) | yes | no (client id only if ever needed; secret is backend-only) |
| Google / YouTube | yes | yes | no |
| Amazon LWA | yes | yes | no |

Logout/disconnect: `POST /api/auth/:provider/disconnect` (session user only) revokes when the adapter supports it, then deletes `MusicAccount`.

Revoked/expired provider tokens: `withProviderTokens` refreshes once; failures become `TokenInvalidError` (“reconnect”). The app must not mint a new **MusicMix** anonymous user for provider 401s.

## AI safety / cost

- Prompt max 1000 characters; `maxTracks` 1–50; duration 1–600 minutes.
- At most 6 provider search queries per generation; search concurrency 2.
- AI HTTP timeout 20s; generate endpoint 20 requests / 15 minutes / IP.
- Model output cannot call Spotify/YouTube/Amazon or emit SQL/credentials that the backend executes.

## Commands used for this audit

Recorded in the pull request and the STEP 8 report after typecheck, tests, `prisma validate`, and `npm audit`.
