# MusicMix performance audit (STEP 8)

Date: 2026-08-18  
Scope: API, database, and Expo client as implemented. No production APM traces were collected.

## API bottlenecks

| Area | Observation | Mitigation now | Remaining |
| --- | --- | --- | --- |
| Playlist library | Listing used to include every track row | `listPlaylists` selects only `tracks.track.durationMs` and returns a summary DTO | Fine for typical libraries; add pagination if a user has hundreds of playlists |
| Playlist detail | Full tracks via `include` | Single query with ordered `PlaylistTrack` | OK |
| Conversion analyze | One destination search per source track | `mapPool` concurrency 3; early exit when a high-confidence match is found; `withTransientRetry` max 3 | Large playlists are O(n) provider searches; expected |
| AI generation | Multiple catalog searches | Max 6 queries, concurrency 2, 8 results each | Bounded; still the most expensive user action |
| Provider HTTP | Could hang | 15s `AbortController` timeout | — |
| AI HTTP | Could hang | 20s timeout | — |
| JSON body | Unbounded payloads | `express.json({ limit: '1mb' })` | — |

## Database bottlenecks

| Query | Pattern | Indexes / constraints |
| --- | --- | --- |
| User → playlists | `where: { userId }`, `orderBy: updatedAt desc` | `Playlist_userId_idx`, `Playlist_userId_updatedAt_idx` |
| Playlist → tracks | `PlaylistTrack` by `playlistId`, `orderBy position` | unique `(playlistId, position)`, unique `(playlistId, trackId)` |
| User → music accounts | `userId` / `(userId, provider)` | `MusicAccount_userId_idx`, unique `(userId, provider)` |
| Conversion → tracks | `conversionId` + position | `ConversionTrack_conversionId_position_idx` |
| Generation → history | `userId, createdAt` | `PlaylistGeneration_userId_createdAt_idx` |

N+1: conversion analyze still performs per-track destination searches (provider API, not Prisma). Prisma playlist list no longer loads full `Track` rows.

Token columns: `GET /api/providers` uses `select` without `accessToken` / `refreshToken`. `withProviderTokens` loads tokens only for authenticated provider calls.

## Frontend performance

- TanStack Query for server state; screens use loading/error/empty components.
- Search, create, convert manual search, and AI “add track” use **400ms debounce** (`useDebouncedValue`).
- `apiFetch` aborts after **20s** and maps 401/403/404/409/429/500/503 to user-safe copy.
- Session recovery on 401 runs only for MusicMix session messages, not provider “reconnect” errors.
- Buttons disable while mutations are in flight (`AppButton` `loading` / `disabled`).

## Image loading

- `Artwork` loads only `http:` / `https:` URLs. Invalid, missing, `javascript:`, and `file:` URLs show an icon fallback.
- React Native `Image` uses the platform HTTP cache. No audio/video is downloaded.
- Large artwork is displayed at component size (card 64px, detail 220px height); the client does not transcode images.

## Provider API concurrency and retries

- AI generation: concurrency **2**, max **6** searches.
- Conversion matching: concurrency **3**.
- Retries: exponential backoff, **3** attempts, only transient network/429. **No retry** for YouTube quota, 401, 403, 404.
- 429 honors `Retry-After` capped at 15s.

## AI generation cost / rate controls

- Prompt length ≤ 1000.
- `maxTracks` ≤ 50 (default duration fill uses up to 25 without a duration target, up to 80 when filling a duration window unless `maxTracks` is set).
- Rate limit 20 generate requests / 15 minutes.
- LLM ranking payload capped at 40 tracks.
- In-process `oncePerKey` collapses double taps on the same prompt.

## Known production scale gaps

- `express-rate-limit` and `oncePerKey` are in-memory (one Node process).
- No Redis/cache in front of provider search.
- Anonymous JWT users cannot merge devices; that is a product issue, not a query planner issue.
