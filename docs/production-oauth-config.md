# Production OAuth configuration

Live OAuth is **not VERIFIED**. Do not mark PASS until a real app is registered and a manual login succeeds. Do not put client secrets in the mobile app.

Redirect URIs use the production API origin. Replace `YOUR_PRODUCTION_BACKEND_DOMAIN` with the real host. Localhost is not valid in production.

OAuth **callbacks hit the backend**, then redirect to `musicmix://auth/callback`. CORS does not apply to those provider redirects.

| Provider | Client ID location | Redirect URI | Scopes (implemented) | Environment variables | Manual verification |
| --- | --- | --- | --- | --- | --- |
| Spotify | Spotify Developer Dashboard | `https://YOUR_PRODUCTION_BACKEND_DOMAIN/api/auth/spotify/callback` | `user-read-email` `user-read-private` `playlist-read-private` `playlist-read-collaborative` `playlist-modify-public` `playlist-modify-private` | `SPOTIFY_CLIENT_ID` `SPOTIFY_CLIENT_SECRET` `SPOTIFY_REDIRECT_URI` | **BLOCKED** |
| Google / YouTube | Google Cloud OAuth client | `https://YOUR_PRODUCTION_BACKEND_DOMAIN/api/auth/google/callback` | `https://www.googleapis.com/auth/youtube` | `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_REDIRECT_URI` optional `YOUTUBE_API_KEY` | **BLOCKED** |
| Amazon Music (LWA) | Login With Amazon / Music Web API | `https://YOUR_PRODUCTION_BACKEND_DOMAIN/api/auth/amazon/callback` | `music::profile` `music::catalog` `music::library` | `AMAZON_MUSIC_ENABLED` `AMAZON_LWA_CLIENT_ID` `AMAZON_LWA_CLIENT_SECRET` `AMAZON_MUSIC_SECURITY_PROFILE_ID` `AMAZON_MUSIC_REDIRECT_URI` | **BLOCKED** (closed beta; keep enabled=false) |

Status values used here: **NOT_CONFIGURED** (empty env), **CONFIGURED** (env present, not live-tested), **VERIFIED** (manual live test), **BLOCKED** (cannot complete).

This environment: Spotify **NOT_CONFIGURED** / **BLOCKED**, YouTube **NOT_CONFIGURED** / **BLOCKED**, Amazon **BLOCKED**.

PKCE (S256) is used for Spotify and Google. `state` is stored server-side and expires. Register the redirect URI **exactly** as configured (scheme, host, path, no trailing-slash mismatch).
