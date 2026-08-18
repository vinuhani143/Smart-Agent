# MusicMix

Universal music playlist manager for Android. Connect official music services, search songs, build playlists, match tracks across platforms, and create the final playlist on the service you choose.

MusicMix does **not** download, rip, or scrape audio. It talks only to official APIs.

## Workspace

| Path | Role |
| --- | --- |
| `frontend/` | Expo (React Native) Android app with Expo Router |
| `backend/` | Node.js + Express + TypeScript REST API |
| `prisma/` | PostgreSQL schema |
| `docs/` | Architecture, setup, and API integration |

## Quick start

Follow **[docs/setup.md](docs/setup.md)** in order:

1. Install Node.js 20+
2. Install dependencies
3. Configure PostgreSQL
4. Copy `.env.example` → `backend/.env` (and `frontend/.env`)
5. Run Prisma migrations
6. Start the backend
7. Start Expo
8. Configure Spotify OAuth
9. Configure Google / YouTube OAuth
10. Build the Android app

Amazon Music is a **closed-beta** official adapter. It stays disabled until Amazon approves Music Web API access. Do not invent credentials.

## Credentials you must obtain

- **Spotify**: Client ID + Client Secret from [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
- **Google**: OAuth client + YouTube Data API v3 from [Google Cloud Console](https://console.cloud.google.com/)
- **Amazon Music** (closed beta, optional): Login With Amazon Client ID/Secret + Security Profile ID after Amazon approval. Leave `AMAZON_MUSIC_ENABLED=false` otherwise.
- **PostgreSQL** connection string
- `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` (generate with `openssl rand -hex 32`)
- **AI playlist generation** (backend only): `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` (optional `AI_BASE_URL` for OpenAI-compatible endpoints)

Never put client secrets or AI API keys in the mobile app.
