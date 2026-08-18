# MusicMix setup

These steps assume a Unix-like machine (macOS or Linux). Android builds also require Android Studio / JDK as described in the Expo docs.

## 1. Install Node.js

Install **Node.js 20 or later** (Node 22 is fine).

```bash
node -v   # v20+
npm -v
```

Use [https://nodejs.org](https://nodejs.org) or `nvm`.

## 2. Install dependencies

From the repository root:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 3. Configure PostgreSQL

Install PostgreSQL 15+ and create a database:

```bash
createdb musicmix
```

Example URL:

```text
postgresql://USER:PASSWORD@localhost:5432/musicmix?schema=public
```

## 4. Configure `.env`

```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

Production hosts should copy `.env.production.example` and `frontend/.env.production.example` into a secret manager instead. Those files contain placeholders only.

Generate secrets (do not commit them):

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY
```

Set at least:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma / PostgreSQL |
| `JWT_SECRET` | MusicMix session JWT (≥ 32 chars) |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (32 bytes) for provider token encryption |
| `API_PUBLIC_URL` | Public origin of the backend |
| `SPOTIFY_REDIRECT_URI` | Must match the Spotify dashboard |
| `GOOGLE_REDIRECT_URI` | Must match the Google Cloud OAuth client |
| `AMAZON_MUSIC_ENABLED` | Must stay `false` unless Amazon has approved Music Web API access |
| `EXPO_PUBLIC_API_URL` | Backend URL the phone can reach |

On an Android emulator, `localhost` is the emulator itself. Use `http://10.0.2.2:4000` for `EXPO_PUBLIC_API_URL` when the API runs on the host. On a physical device, use your LAN IP or a tunnel (ngrok, Cloudflare Tunnel) and add that origin to `CORS_ORIGINS`.

## 5. Run Prisma migrations

```bash
cd backend
npx prisma generate --schema ../prisma/schema.prisma
npx prisma migrate dev --schema ../prisma/schema.prisma --name init
```

`prisma generate` writes the client to `backend/node_modules/.prisma/client` (see `output` in `prisma/schema.prisma`). The API imports `@prisma/client`, which re-exports that generated client.

## 6. Start backend

```bash
cd backend
npm run dev
```

Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## 7. Start Expo

```bash
cd frontend
npx expo start
```

Press `a` to open the Android emulator, or scan the QR code with Expo Go.

## 8. Configure Spotify OAuth

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add redirect URI exactly: `http://localhost:4000/api/auth/spotify/callback` (or your public API URL).
3. Copy Client ID and Client Secret into `backend/.env`:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI`
4. Restart the backend.
5. In MusicMix, tap **Connect** on Spotify (Home or Settings).

## 9. Configure Google / YouTube OAuth

YouTube uses **Google OAuth 2.0** plus the **YouTube Data API v3**. Do not scrape YouTube or put client secrets in the mobile app.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. APIs & Services → OAuth consent screen:
   - User type: External (or Internal for Workspace).
   - Add the test user Google accounts you will connect.
   - Scopes: add only `https://www.googleapis.com/auth/youtube` (manage the user’s YouTube account: list/create/update/delete playlists and playlist items). MusicMix does not request Gmail or Drive.
4. APIs & Services → Credentials → Create credentials → **OAuth client ID** → application type **Web application**.
5. Authorized redirect URIs — must match exactly:
   - `http://localhost:4000/api/auth/google/callback`
   - or `https://YOUR_PUBLIC_API/api/auth/google/callback` if the phone cannot reach localhost.
6. Copy the client ID and client secret into `backend/.env`:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Optional: create an API key as `YOUTUBE_API_KEY` for unauthenticated `search.list` / `videos.list`. Playlist writes still require a connected Google account.

7. Restart the backend.
8. In MusicMix Settings, tap **Connect YouTube**. After success, Settings shows **Connected** and the YouTube channel display name.

Tokens are encrypted in PostgreSQL. Refresh tokens never leave the backend. `POST /api/auth/google/disconnect` revokes the Google token (best-effort) and deletes the stored account.

If Google returns `access_denied`, the app reports that the connection was cancelled. If the account has no YouTube channel, reconnect after creating one at youtube.com.

## 10. Build the Android app

Development build (recommended once you add native config):

```bash
cd frontend
npx expo prebuild --platform android
npx expo run:android
```

Or a release APK after `eas build` / local Gradle assemble. Set `EXPO_PUBLIC_API_URL` to a reachable HTTPS API before shipping.

Amazon Music remains **disabled** until Amazon grants official Music Web API access. Do not invent keys. Spotify and YouTube keep working while Amazon is off.

## 11. Configure Amazon Music (closed beta)

Amazon Music Web API is a **closed beta**. MusicMix implements the official adapter (`AmazonMusicProvider`) and Login With Amazon OAuth, but it stays off unless Amazon has approved this app.

**Amazon Music Web API access is subject to Amazon approval. The application does not bypass or work around Amazon's access restrictions.**

1. Apply for [Amazon Music Web API](https://developer.amazon.com/docs/music/API_web_overview.html) access. Do not scrape Amazon Music or use unofficial clients.
2. Create a Login With Amazon Security Profile. The **Security Profile ID** is sent as `x-api-key` (it is not the LWA Client ID).
3. Add Allowed Return URL exactly: `http://localhost:4000/api/auth/amazon/callback` (or your public API URL).
4. Copy values into `backend/.env` only (never `EXPO_PUBLIC_*`, never the mobile app):

```bash
AMAZON_MUSIC_ENABLED=false
AMAZON_MUSIC_API_BASE_URL=https://api.music.amazon.dev
AMAZON_LWA_CLIENT_ID=
AMAZON_LWA_CLIENT_SECRET=
AMAZON_MUSIC_SECURITY_PROFILE_ID=
AMAZON_MUSIC_REDIRECT_URI=http://localhost:4000/api/auth/amazon/callback
```

`AMAZON_MUSIC_ENABLED` must remain `false` until credentials **and** Amazon approval exist. Setting the flag to `true` without a working Security Profile still keeps the adapter disabled (`not_configured`).

Required LWA scopes:

| Scope | Why |
| --- | --- |
| `music::profile` | `GET /v1/me` (id, name, subscription tier **only if Amazon returns it**) |
| `music::catalog` | Search tracks and get track metadata |
| `music::library` | List/create/update/delete playlists and playlist tracks (supersedes `music::library:read`) |

The client secret stays on the backend. Refresh tokens are encrypted in PostgreSQL and never returned to the app.

If Amazon is disabled, Settings shows **Unavailable** and **Learn about Amazon Music access**. There is no Connect button. Conversion and AI playlist screens show **Amazon Music — Coming Soon**.

## 12. Configure an AI provider (playlist generation)

AI playlist generation calls a real LLM **on the backend** to parse the request, rank search results, and write a title/description. It does **not** generate audio. If credentials are missing, `POST /api/ai/playlists/generate` returns a setup error instead of a fake playlist.

Set these **backend** variables only (never `EXPO_PUBLIC_*`):

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `openai`, `anthropic`, or `openai-compatible` |
| `AI_API_KEY` | Provider secret |
| `AI_MODEL` | Model id (for example `gpt-4.1-mini` or `claude-sonnet-4-5`) |
| `AI_BASE_URL` | Required for `openai-compatible`. Optional override for OpenAI/Anthropic |

Obtain a key from [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or another OpenAI-compatible chat-completions endpoint. Restart the API after changing env vars.

User prompts are sent to that provider. MusicMix stores the prompt and parsed intent in PostgreSQL (`PlaylistGeneration`) for history/debug. OAuth secrets and `AI_API_KEY` are never returned to the app.

## Convert a playlist

1. Connect **Spotify** and **YouTube** in Settings. Amazon Music appears as a source/destination only when `AMAZON_MUSIC_ENABLED=true` and official credentials are configured; otherwise it is **Coming Soon**.
2. Open **Convert Playlist** (`/convert`).
3. Pick a source service and one of that account’s playlists, then the other service as destination.
4. Tap **Find Matching Songs**. Nothing is created on the destination yet.
5. Accept, skip, pick an alternative, or search manually. Low-confidence rows are never chosen for you.
6. Review the summary, then tap **Create Playlist**.

Same-service copies are blocked unless you check **Duplicate this playlist on the same service**.

## Typecheck

```bash
cd backend && npm run typecheck
cd ../frontend && npm run typecheck
```
