# MusicMix architecture

MusicMix is split into a React Native client and a Node.js backend. Provider-specific code is isolated behind a `MusicProvider` adapter so Spotify, YouTube, and Amazon Music never share business logic.

## Frontend

- **Expo SDK 57** + **Expo Router** file-based navigation
- **React Native Paper** (MD3 dark theme)
- **Zustand** for UI/session helpers
- **TanStack Query** for server state
- **expo-secure-store** for the MusicMix session JWT only

The client never receives Spotify/Google access tokens or refresh tokens. OAuth is started by the backend; the system browser returns to `musicmix://auth/callback` after the server stores encrypted tokens.

Routes:

- `app/(tabs)` — Home, Search, Playlists, Create, Settings
- `app/playlist/[id]` — playlist detail (Play / Add / Convert / Delete)
- `app/playlist/ai` — generation preview (create only after confirm)
- `app/playlist/convert` — cross-provider match preview
- `app/auth/callback` — OAuth deep-link landing

Reusable UI lives in `frontend/src/components`. Screens live in `frontend/src/screens` and are mounted by thin route files.

## Backend

Express REST API in `backend/src`:

- `config/` — environment (Zod) and Prisma client
- `providers/` — `MusicProvider` implementations
- `services/` — playlists, search, matching, duplicates, generation, token encryption
- `controllers/` + `routes/` — HTTP surface
- `middleware/` — Helmet is applied in `server.ts`; CORS, rate limit, JWT auth, Zod validation, error mapping

Security controls:

- Helmet
- CORS allow-list
- Rate limiting (stricter on auth)
- Zod validation
- httpOnly session cookie (web) + `Authorization: Bearer` (mobile)
- AES-256-GCM encryption for provider tokens at rest
- Structured logs that redact token/secret fields

## Database

PostgreSQL via Prisma (`prisma/schema.prisma`):

- `User` — MusicMix account (anonymous session on first launch)
- `MusicAccount` — connected provider; `accessToken` / `refreshToken` are ciphertext
- `Track` — cross-platform ids (`isrc`, `spotifyId`, `youtubeVideoId`, `amazonMusicId`)
- `Playlist` / `PlaylistTrack` — server-side playlist definition (`position` preserved)
- `PlaylistGenerationRequest` — generation job; status stays `GENERATED` until the user confirms
- `OAuthState` — CSRF state + PKCE verifier, short-lived

## Provider adapters

`MusicProvider` (`backend/src/types/provider.ts`) defines:

`authenticate`, `logout`, `searchTracks`, `getTrack`, `getPlaylist`, `getUserPlaylists`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `addTracksToPlaylist`, `removeTracksFromPlaylist`, `reorderPlaylist`, `getCurrentUser`

| Adapter | Status |
| --- | --- |
| `SpotifyProvider` | Official Spotify Web API + Authorization Code with PKCE (verifier stored on the server) |
| `YouTubeProvider` | Official Google OAuth + YouTube Data API v3 (`youtube` scope only). Channel id is `providerUserId`. |
| `AmazonMusicProvider` | Placeholder. Throws `PROVIDER_UNAVAILABLE` until official API access is configured |

`ProviderRegistry` is the only place callers look up an adapter.

## OAuth

1. App creates a MusicMix session (`POST /api/auth/session`) and stores the JWT in SecureStore.
2. App calls `POST /api/auth/spotify/start` or `POST /api/auth/google/start`.
3. Backend generates `state` + PKCE verifier, persists them, returns the official authorize URL.
4. App opens the URL with `expo-web-browser`.
5. Provider redirects to the **backend** callback.
6. Backend exchanges the code (client secret stays on the server), encrypts tokens, redirects to `musicmix://auth/callback`.

If credentials are missing, the adapter reports `enabled: false` instead of faking success.

## Track matching

`TrackMatcher` scores a source track against destination candidates:

1. ISRC
2. Exact title + artist
3. Normalized title + artist
4. Album + artist
5. Fuzzy (Levenshtein) title + artist

Normalization lowercases, strips punctuation, collapses spaces, and removes `feat.` / `featuring`, `official audio`, `lyrics`, `remastered`, `live`, `remix`.

Confidence is 0–100. Below 80, `needsReview` is true and alternatives are returned. MusicMix does not auto-select a weak match.

YouTube search titles are parsed before matching (`Artist - Song`, `Song | Artist`, official-video noise). The Convert screen shows alternatives when confidence is low.

## YouTube playlist reorder

`YouTubeProvider.reorderPlaylist` implements a **single-item** move via official `playlistItems.update` (`snippet.position`). Multi-item range moves (`rangeLength !== 1`) return `NOT_SUPPORTED` (HTTP 501). MusicMix does not fake a bulk reorder: each YouTube update costs quota, and a partial update could leave the playlist inconsistent.

## Playlist generation

`PlaylistGenerationService` interprets structured filters and a free-text prompt (years, duration, mood, genre). It searches **connected** official providers, de-duplicates, ranks by filter fit, and returns a preview.

Playlists are **not** created on a provider until the user confirms (`POST /api/ai/generate-playlist/:requestId/confirm` then `POST /api/playlists/:id/create-on-provider`).

There is no fake catalog. If nothing is connected, the API tells the user to connect Spotify or YouTube.
