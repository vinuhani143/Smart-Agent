# OAuth live verification

MusicMix implements official OAuth for Spotify, Google/YouTube, and Login With Amazon. This document does **not** mark live OAuth as PASS. Status stays **NOT_CONFIGURED** or **BLOCKED** until a developer configures real apps and completes the steps below.

Do not put client secrets in the mobile app. Do not invent credentials.

| Provider | Required credentials | Redirect URI | Scopes | Manual verification steps | Expected result | Actual result | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` | Must match the Spotify dashboard exactly (example: `https://YOUR_PRODUCTION_BACKEND_DOMAIN/api/auth/spotify/callback`) | Playlist read/write as implemented in `SpotifyProvider` | Create a Spotify developer app, add the redirect URI, set env, restart API, tap Connect, complete login, search, create playlist, disconnect | Connected profile, encrypted tokens on server, no tokens in the app | Not run in this environment | **NOT_CONFIGURED** |
| Google / YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, optional `YOUTUBE_API_KEY` | Must match the Google Cloud OAuth client | `https://www.googleapis.com/auth/youtube` | Enable YouTube Data API v3, add test users, set env, Connect YouTube, list/create playlist items | Channel connected; quota errors not retried | Not run | **NOT_CONFIGURED** |
| Amazon Music (LWA) | Feature flag + LWA client + Security Profile | `AMAZON_MUSIC_REDIRECT_URI` | `music::profile` `music::catalog` `music::library` | Amazon must approve Music Web API access. Keep `AMAZON_MUSIC_ENABLED=false` until then | Unavailable / closed beta in the app | Disabled in this environment | **BLOCKED** (closed beta / approval) |

## Code checks (not live PASS)

- Authorization code + PKCE (S256) for Spotify and Google; Amazon LWA uses official authorize/token endpoints
- `state` stored server-side, 10 minute expiry, deleted after use, provider mismatch rejected
- Redirect URIs come from env, not the client
- Access/refresh tokens encrypted at rest; never returned on `/api/providers` or session
- Refresh on 401; disconnect revokes when the adapter supports it
- `GET /api/health` reports `configured` / `not_configured` without secrets

Live status: **NOT_CONFIGURED** until the developer completes the table above.
