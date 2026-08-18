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

## Amazon Music

There is **no enabled integration**.

`AmazonMusicProvider` implements `MusicProvider` but returns `PROVIDER_UNAVAILABLE` unless/until Amazon provides official API credentials and a documented playlist API. Do not add unofficial Alexa/Amazon scrape clients.

When Amazon access exists, set:

- `AMAZON_MUSIC_CLIENT_ID`
- `AMAZON_MUSIC_CLIENT_SECRET`
- `AMAZON_MUSIC_REDIRECT_URI`

…then implement the official calls inside `backend/src/providers/amazon/AmazonMusicProvider.ts` only.

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
| `POST` | `/api/playlists/convert` | Match preview (no create) |
| `POST` | `/api/ai/generate-playlist` | Candidate tracks only |
| `POST` | `/api/ai/generate-playlist/:requestId/confirm` | Save after user review |

## Errors the client can show

Human-readable messages are mapped for: OAuth failure, OAuth cancellation, expired/invalid token, refresh failure, YouTube quota exceeded, 403 permission errors, 404/private/deleted videos, rate limit, network error, no search results, duplicate track, track unavailable on destination, insufficient permissions, provider unavailable, reorder not supported.

Responses never include client secrets, refresh tokens, access tokens, or `DATABASE_URL`.
