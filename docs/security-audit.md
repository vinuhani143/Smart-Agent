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
| Dependency audit | **TODO** | High findings exist in Prisma CLI and Expo/Metro trees. No safe non-major fix in this step. Details below. |
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
- Unsafe-prompt detector now matches `eval(`, `<script`, and SQL `;--` (trailing word-boundary was skipping those patterns).
- Restored nested provider tests (`find src -name '*.test.ts'`).

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

## Dependency audit (2026-08-18)

Did **not** run `npm audit fix --force` (it would downgrade Prisma to 6.12 or Expo/React Native to incompatible majors).

### Backend (`backend/`, including `npm audit --omit=dev`)

| Package | Severity | Advisory | Impact on MusicMix | Recommended fix |
| --- | --- | --- | --- | --- |
| `deepmerge-ts` `<8` via `@prisma/client` → `prisma` → `@prisma/config` | high | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) stack exhaustion on recursive merge | Prisma CLI/config, not request-body merging in Express. Low practical exploitability for the API. | Stay on Prisma 6.x until a 6.x patch, or plan a **separate** Prisma 7 upgrade. Do not downgrade to 6.12. |
| `effect` (flagged via same Prisma tree) | high | [GHSA-38f7-945m-qr2g](https://github.com/advisories/GHSA-38f7-945m-qr2g) AsyncLocalStorage in Effect RPC | Installed `effect@3.21.0` is outside `<3.20.0`; npm still flags the Prisma parent range. | Same as above. |

### Frontend (`frontend/`)

| Package | Severity | Advisory | Impact | Recommended fix |
| --- | --- | --- | --- | --- |
| `image-size` via Metro / Expo | high | Infinite loops in ICNS/JXL/HEIF parsers | Bundler/dev tooling. MusicMix does not parse user-uploaded images with this library. | Wait for Expo SDK / Metro patch. `audit fix --force` would install `react-native@0.72`. |
| `uuid` via `@expo/config-plugins` / xcode | moderate | Buffer bounds in uuid v3/v5/v6 | Prebuild/config plugins, not session ids. | Wait for Expo patch. Force-fix would install `expo@53`. |

No **critical** advisories. Re-run `npm audit` before each release.

## Commands executed

```bash
cd backend && npx tsc --noEmit -p tsconfig.json    # pass
cd frontend && npx tsc --noEmit                    # pass
npx prisma validate --schema prisma/schema.prisma  # pass
cd backend && npm test                             # 146 pass
cd frontend && npm test                            # 14 pass
cd backend && npm audit                            # 4 high (Prisma tree)
cd frontend && npm audit                           # 22 (8 moderate, 14 high) Expo/Metro tree
cd frontend && npx expo-doctor                     # 21/21 pass
npm run lint                                       # no lint script (frontend or backend)
```
