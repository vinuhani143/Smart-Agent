# Production environment checklist

**CFG-2 remains BLOCKED** until `EXPO_PUBLIC_API_URL` / `API_PUBLIC_URL` are a real HTTPS origin. Do not invent a domain. Do not commit secrets. Never put backend secrets in `EXPO_PUBLIC_*`.

Copy `.env.production.example` into a secret manager or server env. Production startup **fails closed** if required values are missing, loopback, HTTP, wildcard CORS, or look like test secrets.

| Variable | Required in production | Lives on | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes (`production`) | Backend | |
| `PORT` | Yes | Backend | Render injects this. Local default 4000 if unset. |
| `DATABASE_URL` | Yes | Backend | `<your Render PostgreSQL connection string>` with TLS (`sslmode=require` or `verify-full`). Not localhost. |
| `API_PUBLIC_URL` | Yes | Backend | `https://YOUR-RENDER-SERVICE.onrender.com` — placeholder is **not** a live origin |
| `CORS_ALLOWED_ORIGINS` | Yes (may be empty) | Backend | `<your required origin>` — comma-separated HTTPS web origins. Native Android does **not** use CORS. Never `*`. Legacy alias: `CORS_ORIGINS`. |
| `JWT_SECRET` | Yes (≥32 chars) | Backend | `<random secret 1>`. `openssl rand -hex 32`. Not a test string. |
| `TOKEN_ENCRYPTION_KEY` | Yes (64 hex chars) | Backend | `<random secret 2>`. AES-256-GCM key for provider tokens. `openssl rand -hex 32`. |
| `APP_DEEP_LINK` | Yes | Backend | `musicmix://auth/callback` |
| `DEBUG_ERRORS` | Must be `false` | Backend | Production refuses `true` |
| `EXPO_PUBLIC_API_URL` | Yes for store/preview builds | **Frontend only** | HTTPS, not localhost. Same placeholder until CFG-2. |
| `SPOTIFY_CLIENT_ID` | For Spotify | Backend | |
| `SPOTIFY_CLIENT_SECRET` | For Spotify | Backend | Never `EXPO_PUBLIC_*` |
| `SPOTIFY_REDIRECT_URI` | For Spotify | Backend | Must match the Spotify dashboard exactly |
| `GOOGLE_CLIENT_ID` | For YouTube | Backend | |
| `GOOGLE_CLIENT_SECRET` | For YouTube | Backend | Never `EXPO_PUBLIC_*` |
| `GOOGLE_REDIRECT_URI` | For YouTube | Backend | Must match Google Cloud |
| `YOUTUBE_API_KEY` | Optional | Backend | Search-only; mutations still need OAuth |
| `AI_PROVIDER` | For AI | Backend | `openai` / `anthropic` / `openai-compatible` |
| `AI_API_KEY` | For AI | Backend | Never `EXPO_PUBLIC_*`. Missing → 503 `AI_UNAVAILABLE` |
| `AI_MODEL` | For AI | Backend | |
| `AI_BASE_URL` | If openai-compatible | Backend | |
| `AMAZON_MUSIC_ENABLED` | Keep `false` unless approved | Backend | Closed beta. Do not bypass. |
| `AMAZON_MUSIC_API_BASE_URL` | Default official | Backend | `https://api.music.amazon.dev` |
| `AMAZON_LWA_CLIENT_ID` | If Amazon enabled | Backend | |
| `AMAZON_LWA_CLIENT_SECRET` | If Amazon enabled | Backend | Never `EXPO_PUBLIC_*` |
| `AMAZON_MUSIC_SECURITY_PROFILE_ID` | If Amazon enabled | Backend | |
| `AMAZON_MUSIC_REDIRECT_URI` | If Amazon enabled | Backend | |
| `INTERNAL_CLEANUP_KEY` | Recommended | Backend | Header `x-musicmix-cleanup-key`. Never ship in the app. |

OAuth and AI may be empty: the API still starts; those features stay **not_configured** / **503**. Core secrets (`DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, HTTPS `API_PUBLIC_URL`) must be present.

Run `npm run release-check` before a preview or production EAS build.
