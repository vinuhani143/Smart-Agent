# Official API integration

MusicMix uses only documented, official APIs. There are no scrapers, unofficial endpoints, or hardcoded tokens.

## Spotify Web API

- Dashboard: https://developer.spotify.com/dashboard
- Docs: https://developer.spotify.com/documentation/web-api
- Authorization: [Authorization Code](https://developer.spotify.com/documentation/web-api/tutorials/code-flow) with PKCE (code verifier stored on the MusicMix server, not in the APK)
- Token endpoint: `https://accounts.spotify.com/api/token`
- API root: `https://api.spotify.com/v1`

### Required scopes

| Scope | Why |
| --- | --- |
| `user-read-email` | Identify the Spotify user |
| `user-read-private` | Profile |
| `playlist-read-private` | List private playlists |
| `playlist-read-collaborative` | List collaborative playlists |
| `playlist-modify-public` | Create/update public playlists |
| `playlist-modify-private` | Create/update private playlists |

Redirect URI env: `SPOTIFY_REDIRECT_URI` (backend only). **Never** put `SPOTIFY_CLIENT_SECRET` in the Expo app.

Spotify search has no first-class language/mood filters. MusicMix appends those terms to `q` and uses Spotify’s `year:` / `genre:` query syntax when provided. Duration is filtered after the response.

## Google OAuth + YouTube Data API v3

- Console: https://console.cloud.google.com/
- YouTube Data API: https://developers.google.com/youtube/v3
- OAuth 2.0: https://developers.google.com/identity/protocols/oauth2

Enable **YouTube Data API v3** on the Google Cloud project.

### Required scopes

| Scope | Why |
| --- | --- |
| `https://www.googleapis.com/auth/youtube` | Identify the YouTube channel, search as the user, list/create/update/delete playlists, add/remove/reorder playlist items |

Redirect URI env: `GOOGLE_REDIRECT_URI` (backend only). Client secret stays on the server. MusicMix does **not** request Gmail, Drive, or extra profile scopes.

Optional `YOUTUBE_API_KEY` can be used for unauthenticated `search.list` / `videos.list`. Playlist mutations require a connected OAuth account.

YouTube does not expose ISRC. Search titles are parsed (`Artist - Song`, `Song \| Artist`, official-video noise stripped). Low-confidence parses keep the original title and mark `metadataConfidence`. Matching to Spotify then uses ISRC (if present) → exact/normalized title+artist → album+artist → fuzzy score 0–100. Scores below 80 are not auto-selected.

### YouTube Data API operations used

| Operation | HTTP | Purpose |
| --- | --- | --- |
| `channels.list` (`mine=true`) | GET | Authenticated YouTube channel id + display name |
| `search.list` (`type=video`, `videoCategoryId=10`) | GET | Music-oriented video search |
| `videos.list` (`snippet,contentDetails,status`) | GET | Duration, thumbnails, availability |
| `playlists.list` (`mine=true` or `id=`) | GET | User playlists / playlist details |
| `playlists.insert` | POST | Create playlist |
| `playlists.update` | PUT | Update name/description |
| `playlists.delete` | DELETE | Delete playlist |
| `playlistItems.list` | GET | Playlist videos (paginated) |
| `playlistItems.insert` | POST | Add a video |
| `playlistItems.delete` | DELETE | Remove a video |
| `playlistItems.update` | PUT | Move **one** video (`snippet.position`) |
| Google `token` / `revoke` | POST | Authorization-code exchange, refresh, revoke |

Quota units (Google defaults, subject to change): `search.list` is expensive (typically 100 units), `videos.list` / `playlists.*` / `playlistItems.*` are cheaper (typically 1–50). The default project quota is 10,000 units/day.

If YouTube returns `quotaExceeded` / `dailyLimitExceeded`, MusicMix **does not retry**. The API returns HTTP 429 with:

`YouTube search quota has been exceeded. Please try again later.`

Multi-item playlist range moves are **not supported** on YouTube (each `playlistItems.update` costs quota and a partial update could leave the playlist inconsistent). Single-item reorder is implemented via the official `playlistItems.update` position field.

Remote YouTube playlist HTTP surface:

| Method | Path |
| --- | --- |
| `GET` | `/api/providers/youtube/playlists` |
| `GET` | `/api/providers/youtube/playlists/:playlistId` |
| `PUT` | `/api/providers/youtube/playlists/:playlistId` |
| `DELETE` | `/api/providers/youtube/playlists/:playlistId` |
| `POST` | `/api/auth/google/start` |
| `GET` | `/api/auth/google/callback` |
| `POST` | `/api/auth/google/disconnect` |

## Amazon Music Web API (closed beta)

- Overview: https://developer.amazon.com/docs/music/API_web_overview.html
- Login With Amazon: https://developer.amazon.com/docs/music/API_web_LWA.html
- Search: https://developer.amazon.com/docs/music/API_web_search.html
- Tracks: https://developer.amazon.com/docs/music/API_web_track.html
- Playlists: https://developer.amazon.com/docs/music/API_web_playlist.html
- User: https://developer.amazon.com/docs/music/API_web_user.html
- Errors / throttling: https://developer.amazon.com/docs/music/API_web_errors.html

API root: `https://api.music.amazon.dev`

**Amazon Music Web API access is subject to Amazon approval. The application does not bypass or work around Amazon's access restrictions.**

The adapter is complete, but MusicMix does **not** claim Amazon Music is live. `AMAZON_MUSIC_ENABLED` defaults to `false`. Requests fail with:

`Amazon Music integration is currently unavailable because Amazon Music API access has not been configured.`

Spotify and YouTube continue to work.

### Feature flag and status

`GET /api/providers/status` returns:

```json
{
  "spotify": { "enabled": true, "configured": true },
  "youtube": { "enabled": true, "configured": true },
  "amazonMusic": {
    "enabled": false,
    "configured": false,
    "accessStatus": "closed_beta"
  }
}
```

`accessStatus` is one of: `disabled`, `not_configured`, `configured`, `authenticated`, `api_access_denied`, `closed_beta`. Secrets are never included.

### Login With Amazon

Authorization-code grant. The LWA **client secret stays on the backend**.

| Endpoint | URL |
| --- | --- |
| Authorize | `https://www.amazon.com/ap/oa` |
| Token | `https://api.amazon.com/auth/o2/token` |
| Revoke | `https://api.amazon.com/auth/o2/token/revoke` |
| MusicMix start | `POST /api/auth/amazon/start` |
| MusicMix callback | `GET /api/auth/amazon/callback` |
| MusicMix disconnect | `POST /api/auth/amazon/disconnect` |

MusicMix aliases `amazon` and `amazon_music`. Redirect URI env: `AMAZON_MUSIC_REDIRECT_URI`.

Amazon Music API requests send:

```http
Authorization: Bearer <access_token>
x-api-key: <AMAZON_MUSIC_SECURITY_PROFILE_ID>
```

`x-api-key` is the Security Profile ID, not the LWA Client ID.

### Required scopes

| Scope | Why |
| --- | --- |
| `music::profile` | Current user (`GET /v1/me`) |
| `music::catalog` | Search and get tracks |
| `music::library` | Playlist read/write (supersedes `music::library:read`) |

### Playlist operations

| Operation | HTTP |
| --- | --- |
| Current user | `GET /v1/me` |
| Search tracks | `POST /v1/search/tracks` |
| Get track(s) | `GET /v1/tracks/{id}` or `GET /v1/tracks?ids=` |
| List playlists | `GET /v1/me/playlists` |
| Get playlist | `GET /v1/playlists/{id}` |
| Create playlist | `POST /v1/playlists` (`visibility` default **PRIVATE**) |
| Playlist tracks | `GET /v1/playlists/{id}/tracks` |
| Add tracks | `PUT /v1/playlists/{id}/tracks` `{ trackIds }` |
| Remove tracks | `DELETE /v1/playlists/{id}/tracks` `{ entryIds }` |
| Reorder tracks | `PATCH /v1/playlists/{id}/tracks` `{ entryIds, entryIdAbove, entryIdBelow }` |
| Update playlist | `PUT /v1/playlists/{id}` |
| Delete playlist | `DELETE /v1/playlists/{id}` |

Playlist **entry IDs** (from track cursors) are required to remove or reorder. Catalog track IDs are not entry IDs. ISRC is stored only when Amazon returns it.

### Rate limits

Amazon Music enforces TPS limits (`THROTTLED` / HTTP 429). MusicMix retries at most **3** times with exponential backoff and honors `Retry-After`. There is no infinite retry. Invalid tokens and closed-beta API-key failures are not retried.

### Environment (backend only)

| Variable | Notes |
| --- | --- |
| `AMAZON_MUSIC_ENABLED` | Default `false` |
| `AMAZON_MUSIC_API_BASE_URL` | Default `https://api.music.amazon.dev` |
| `AMAZON_LWA_CLIENT_ID` | Login With Amazon client id |
| `AMAZON_LWA_CLIENT_SECRET` | Backend only |
| `AMAZON_MUSIC_SECURITY_PROFILE_ID` | `x-api-key` |
| `AMAZON_MUSIC_REDIRECT_URI` | Must match LWA Allowed Return URLs |

`AMAZON_MUSIC_CLIENT_ID` / `AMAZON_MUSIC_CLIENT_SECRET` are optional aliases for the LWA pair.

## Backend REST surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/session` | Create MusicMix session JWT |
| `POST` | `/api/auth/spotify/start` | Start Spotify OAuth |
| `GET` | `/api/auth/spotify/callback` | Spotify redirect |
| `POST` | `/api/auth/google/start` | Start Google OAuth |
| `GET` | `/api/auth/google/callback` | Google redirect |
| `POST` | `/api/auth/google/disconnect` | Revoke Google token and unlink YouTube |
| `GET` | `/api/providers` | Enabled + connected status (no tokens) |
| `GET` | `/api/providers/status` | Feature flags; Amazon `accessStatus` (no secrets) |
| `POST` | `/api/auth/amazon/start` | Start Login With Amazon (disabled unless configured) |
| `GET` | `/api/auth/amazon/callback` | LWA redirect |
| `POST` | `/api/auth/amazon/disconnect` | Revoke LWA token and unlink |
| `GET` | `/api/providers/:provider/playlists` | List playlists on a connected provider |
| `GET` | `/api/search?q=` | Search connected providers |
| `GET` | `/api/search/:provider?q=` | Search one provider |
| `GET` | `/api/playlists` | List MusicMix playlists |
| `POST` | `/api/playlists` | Create definition |
| `GET` | `/api/playlists/:id` | Get one |
| `PUT` | `/api/playlists/:id` | Update metadata |
| `DELETE` | `/api/playlists/:id` | Delete definition |
| `POST` | `/api/playlists/:id/tracks` | Add a track |
| `DELETE` | `/api/playlists/:id/tracks/:trackId` | Remove a track |
| `POST` | `/api/playlists/:id/create-on-provider` | Materialize on Spotify/YouTube |
| `POST` | `/api/playlists/convert` | Legacy match preview (no create) |
| `POST` | `/api/conversions/analyze` | Load source playlist, match tracks, persist job (no destination create) |
| `GET` | `/api/conversions/:id` | Conversion job + match results + summary |
| `POST` | `/api/conversions/:id/confirm` | Save accept / skip / alternative / manual decisions |
| `POST` | `/api/conversions/:id/create` | Create destination playlist from confirmed matches only |
| `POST` | `/api/ai/playlists/generate` | Parse prompt, search catalogs, return preview (never creates) |
| `GET` | `/api/ai/playlists/:id` | Load a generation job |
| `PUT` | `/api/ai/playlists/:id` | User edits (title, order, remove, add) |
| `POST` | `/api/ai/playlists/:id/replace` | Replace one preview track via provider search |
| `POST` | `/api/ai/playlists/:id/create` | Create on Spotify/YouTube after explicit confirm |
| `POST` | `/api/ai/generate-playlist` | Legacy generate (same engine) |
| `POST` | `/api/ai/generate-playlist/:requestId/confirm` | Legacy confirm/create |

## Cross-platform playlist conversion

Supported pairs: Spotify, YouTube, and Amazon Music in any combination **when that provider is enabled**. Same-service copies return HTTP 409 unless `allowSameProvider: true`.

Amazon Music is **not** selectable while `AMAZON_MUSIC_ENABLED=false` or credentials/API access are missing.

### Matching algorithm

For each source track, MusicMix searches the destination with official APIs (never audio download):

1. ISRC (when both sides have it)
2. Exact normalized title + artist
3. Normalized title + artist (high similarity)
4. Album + artist
5. Fuzzy title + artist (Levenshtein, last resort)

Spotify → YouTube search queries, in order, stopping early on a high-confidence hit:

- `artist + title`
- `title + artist`
- `artist + title + album`

YouTube → Spotify uses the parsed title + artist. If YouTube metadata confidence is below 90, the match is `needs_review` even when a candidate looks strong, and the UI shows the original video title.

### Confidence

| Score | Band | Auto-select? |
| --- | --- | --- |
| 90–100 | High | Yes (`matched`) |
| 75–89 | Medium | No (`needs_review`) |
| 0–74 | Low | No (`needs_review` or `not_found`) |

Manual search saves `matchMethod = "manual"` and `confidence = 100`.

Duplicates (same destination provider id, ISRC, or normalized title+artist) keep the highest-confidence row; others are `duplicate`.

### Rate limiting and quota

Track matching runs with **concurrency 3**. Each search retries transient `429` / network failures with exponential backoff (`400ms × 2^attempt`, honors `Retry-After`, max 3 attempts). **YouTube `quotaExceeded` is never retried.** Remaining tracks are left unmatched if quota is already exhausted on a later query; the first quota failure with no candidates fails the analyze call.

If destination playlist creation fails part-way, MusicMix stores `destinationPlaylistId` and returns *“Playlist created with X of Y tracks.”* Retrying `POST /create` adds remaining tracks to the **same** playlist and does not create a second one.

## AI playlist generation

The LLM **does not produce audio**. It extracts `PlaylistIntent`, may re-rank catalog hits, and writes a title/description. Songs always come from official Spotify Web API / YouTube Data API v3 / Amazon Music Web API search through the provider adapters. Amazon Music is a search/destination provider **only** when it is enabled and the user is authenticated. If Amazon is unavailable, generation continues on Spotify/YouTube with a clear message.

### Environment (backend only)

| Variable | Required | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | yes | `openai`, `anthropic`, or `openai-compatible` |
| `AI_API_KEY` | yes | Never shipped in the Expo app |
| `AI_MODEL` | yes | Provider model id |
| `AI_BASE_URL` | openai-compatible | Chat Completions-compatible root |

If any required value is missing, generate returns HTTP 503 `AI_UNAVAILABLE` with a setup message. MusicMix does not invent tracks or fake an LLM response.

### Flow

1. `POST /api/ai/playlists/generate` `{ "prompt": "...", "provider": "spotify"|"youtube"|"both" }`
2. LLM parse → validate → up to 6 adapter searches (concurrency 2)
3. Normalize, de-duplicate, filter (explicit/year when metadata is reliable), weighted score 0–100
4. Fill duration to about ±2 minutes of the target
5. Return `{ generationId, intent, playlist, summary }` with `confirmationRequired: true`
6. User edits via `PUT` (remove / reorder / add) or replace via `POST .../replace`
7. `POST /api/ai/playlists/:id/create` `{ "destinationProvider": "spotify"|"youtube"|"amazon_music" }` creates the remote playlist

If fewer suitable songs exist than requested, `summary.warning` is `Only X suitable songs were found.` Extra songs are never fabricated.

### Track ranking

Weighted evidence: language, genre, mood, year, artist, metadata confidence, provider availability. A track is not labeled a perfect match unless the available fields support a 100 score. Energy and tempo stay `unknown` because Spotify/YouTube search results do not reliably include BPM.

### Search strategy and rate limits

Queries are derived from language/mood/genre/year/artist (for example `Telugu romantic songs`, `Telugu melody 2000`). Cap: 6 queries. Provider calls use the existing retry helper for transient 429s. YouTube `quotaExceeded` is not retried. Generate itself is limited to 20 requests / 15 minutes per client.

### Privacy

- `AI_API_KEY`, Spotify/Google secrets, and refresh tokens never leave the server and are not in API responses.
- The user prompt is sent to the configured LLM provider and stored in `PlaylistGeneration.requestText`.
- Preview artwork URLs come from the music providers, not from generated media.

## Errors the client can show

Human-readable messages are mapped for: OAuth failure, OAuth cancellation, expired/invalid token, refresh failure, YouTube quota exceeded, 403 permission errors, 404/private/deleted videos, rate limit, network error, no search results, duplicate track, track unavailable on destination, insufficient permissions, provider unavailable, reorder not supported, source playlist unavailable, conversion not confirmed, partial playlist creation, AI provider missing/unavailable/rate-limited.

Responses never include client secrets, refresh tokens, access tokens, or `DATABASE_URL`.