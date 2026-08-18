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

Amazon Music remains disabled until Amazon grants official API credentials. Do not invent keys.

## Typecheck

```bash
cd backend && npm run typecheck
cd ../frontend && npm run typecheck
```
