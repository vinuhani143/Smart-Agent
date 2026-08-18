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
- `app/convert` — cross-provider conversion wizard (source → match review → summary → create)
- `app/playlist/[id]` — playlist detail (Play / Add / Convert / Delete)
- `app/ai-playlist` — AI playlist generator (preview, edit, confirm create)
- `app/playlist/ai` — same screen (compat route)
- `app/playlist/convert` — same conversion wizard (compat route)
- `app/auth/callback` — OAuth deep-link landing

Reusable UI lives in `frontend/src/components`. Screens live in `frontend/src/screens` and are mounted by thin route files.

## Backend

Express REST API in `backend/src`:

- `config/` — environment (Zod) and Prisma client
- `providers/` — `MusicProvider` implementations
- `services/` — playlists, search, matching, duplicates, conversion, token encryption
- `ai/` — LLM provider, intent, ranking, `PlaylistGeneratorService`
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
- `MusicAccount` — connected provider; `accessToken` / `refreshToken` are ciphertext; `subscriptionTier` only when Amazon returns it
- `Track` — cross-platform ids (`isrc`, `spotifyId`, `youtubeVideoId`, `amazonMusicId`)
- `Playlist` / `PlaylistTrack` — server-side playlist definition (`position` preserved)
- `PlaylistGenerationRequest` — legacy generation job
- `PlaylistGeneration` — AI playlist job (`requestText`, `parsedIntent`, preview tracks, status `GENERATED` / `EDITED` / `CREATED` / `FAILED`)
- `PlaylistConversion` / `ConversionTrack` — cross-provider conversion job and per-track decisions
- `OAuthState` — CSRF state + PKCE verifier, short-lived

## Provider adapters

`MusicProvider` (`backend/src/types/provider.ts`) defines:

`authenticate`, `logout`, `searchTracks`, `getTrack`, `getPlaylist`, `getUserPlaylists`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `addTracksToPlaylist`, `removeTracksFromPlaylist`, `reorderPlaylist`, `getCurrentUser`

| Adapter | Status |
| --- | --- |
| `SpotifyProvider` | Official Spotify Web API + Authorization Code with PKCE (verifier stored on the server) |
| `YouTubeProvider` | Official Google OAuth + YouTube Data API v3 (`youtube` scope only). Channel id is `providerUserId`. |
| `AmazonMusicProvider` | Official Amazon Music Web API + Login With Amazon. **Disabled** unless `AMAZON_MUSIC_ENABLED=true` and LWA + Security Profile credentials are configured. Closed beta; no unofficial clients. |

`ProviderRegistry` is the only place callers look up an adapter.

## OAuth

1. App creates a MusicMix session (`POST /api/auth/session`) and stores the JWT in SecureStore.
2. App calls `POST /api/auth/spotify/start`, `POST /api/auth/google/start`, or `POST /api/auth/amazon/start`.
3. Backend generates `state` + PKCE verifier, persists them, returns the official authorize URL.
4. App opens the URL with `expo-web-browser`.
5. Provider redirects to the **backend** callback.
6. Backend exchanges the code (client secret stays on the server), encrypts tokens, redirects to `musicmix://auth/callback`.

If credentials are missing, the adapter reports `enabled: false` instead of faking success.

Amazon Music Web API access is subject to Amazon approval. The application does not bypass or work around Amazon's access restrictions. Playlist remove/reorder uses Amazon **entry IDs**, not catalog track IDs.

## Track matching

`TrackMatcher` scores a source track against destination candidates:

1. ISRC
2. Exact title + artist
3. Normalized title + artist
4. Album + artist
5. Fuzzy (Levenshtein) title + artist

Normalization lowercases, strips punctuation and bracketed marketing text (`official audio`, `lyrics`, `remastered`, `live`, `acoustic`, `radio edit`, `extended mix`, `feat`/`ft`/`featuring`), and collapses spaces. Meaningful title words are kept (for example “Version of Me” is not stripped down to “of me”). Original source metadata is never mutated.

Confidence is 0–100:

- **90–100** high — may auto-include as `matched`
- **75–89** medium — `needs_review`, never silent-select
- **0–74** low — `needs_review` or `not_found`

YouTube search titles are parsed before matching (`Artist - Song`, `Song | Artist`, official-video noise). Low YouTube parse confidence forces review and shows the original video title.

## Playlist conversion

Flow (frontend `/convert`):

1. Choose source (Spotify, YouTube, or Amazon Music when enabled) and a provider playlist
2. Choose destination (another enabled service, unless the user opts into duplicating on the same service)
3. **Find Matching Songs** → `POST /api/conversions/analyze` (does **not** create a destination playlist)
4. Review: accept, choose alternative, skip, or search manually
5. Summary of matched / review / not found / duplicates
6. **Create Playlist** → `POST /api/conversions/:id/confirm` then `POST /api/conversions/:id/create`

Only accepted, high-confidence, and manual matches are added. Skipped, unresolved, duplicate, and low-confidence unapproved rows are omitted.

Matching searches run with concurrency 3 and retry only transient rate-limit/network errors. YouTube quota exceeded is never retried.

## YouTube playlist reorder

`YouTubeProvider.reorderPlaylist` implements a **single-item** move via official `playlistItems.update` (`snippet.position`). Multi-item range moves (`rangeLength !== 1`) return `NOT_SUPPORTED` (HTTP 501). MusicMix does not fake a bulk reorder: each YouTube update costs quota, and a partial update could leave the playlist inconsistent.

## Playlist generation (AI)

`backend/src/ai` owns intent parsing, ranking, duration, and the `PlaylistGeneratorService` flow:

User request → parse intent (LLM, grounded in the prompt) → validate → search provider adapters → normalize → de-duplicate → filter → score/rank → duration fill → preview → **user review/edits** → **explicit Create Playlist** → provider `createPlaylist` + local `Playlist` row.

`ConfigurableLlmProvider` implements `AIProvider` (`parsePlaylistRequest`, `rankTracks`, `generatePlaylistDescription`) using `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL`. Missing credentials throw `AI_UNAVAILABLE`. There is no regex-only silent fallback that pretends to be the LLM.

Search stays inside `SpotifyProvider` / `YouTubeProvider` / `AmazonMusicProvider` via `SearchService`. Up to **six** queries run with concurrency **2**. Empty queries are skipped; expired OAuth fails the job; YouTube quota, Amazon unavailability, and rate limits surface as user-safe errors if no tracks were found. Amazon-only failures do not fail generation when Spotify or YouTube still return songs.

Track scores are 0–100 from evidence only (`languageMatch`, `genreMatch`, `moodMatch`, `yearMatch`, `artistMatch`, `metadataConfidence`, `providerAvailability`). Language/genre/mood/energy/tempo stay `unknown` unless the catalog text actually contains those terms. MusicMix never invents BPM or a “perfect match.”

Duplicates use `DuplicateDetector` (ISRC, provider id, normalized title+artist) unless `allowDuplicates` is true.

The destination playlist is **never** created during generate. `POST /api/ai/playlists/:id/create` is the confirmation step.
