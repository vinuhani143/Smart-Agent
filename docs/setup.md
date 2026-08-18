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

## 9. Configure Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Enable **YouTube Data API v3**.
3. Create an OAuth 2.0 **Web application** client.
4. Add authorized redirect URI: `http://localhost:4000/api/auth/google/callback`.
5. Copy Client ID and Client Secret:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
6. Optional: create an API key as `YOUTUBE_API_KEY` (search still prefers a connected account).
7. Restart the backend and tap **Connect** on YouTube.

Configure the OAuth consent screen with the scopes listed in `docs/api-integration.md`.

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
