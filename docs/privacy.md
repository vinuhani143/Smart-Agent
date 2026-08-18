# MusicMix privacy data inventory

MusicMix stores the minimum needed to connect official music APIs, keep playlists, convert them, and generate previews. It does **not** store copyrighted audio or video files.

| Data | Where | Why | Notes |
| --- | --- | --- | --- |
| MusicMix user id (`User.id`) | PostgreSQL | Session subject for JWT; ownership of playlists, conversions, generations, and provider links | Created anonymously on first launch. Optional `email` / `displayName` columns exist but are not filled from Spotify/Google in the current flow. |
| Provider account id (`MusicAccount.providerUserId`) | PostgreSQL | Identify the connected Spotify / Google / Amazon account and enforce one link per provider | Display name and image URL are optional profile fields for the Settings UI. |
| Encrypted OAuth access and refresh tokens | PostgreSQL `MusicAccount.accessToken` / `refreshToken` | Call official provider APIs on the user’s behalf | AES-256-GCM via `TokenEncryptionService`. Never sent to the app. Never logged. |
| Token expiry and scopes | PostgreSQL | Know when to refresh; debug missing playlist permission | Not secrets by themselves. |
| Amazon `subscriptionTier` | PostgreSQL | Amazon Web API may require a supported tier for some writes | Only stored when Amazon returns it. |
| Playlist metadata (name, description, cover URL, language/genre/mood/years) | PostgreSQL `Playlist` | Library and conversion source | Cover URL is a remote image URL, not a downloaded file. |
| Track metadata (title, artist, album, duration, ISRC, provider ids, thumbnail URL) | PostgreSQL `Track` | Matching, dedupe, display | No audio. Thumbnails are URLs. |
| Playlist membership and order | PostgreSQL `PlaylistTrack` | Preserve order when editing or creating on a provider | Unique per playlist+track. |
| Conversion job + per-track decisions | PostgreSQL `PlaylistConversion` / `ConversionTrack` | Review matches before creating a destination playlist | Stores JSON snapshots of source/destination track metadata, not tokens. |
| AI prompt, parsed intent, title/description, candidate tracks | PostgreSQL `PlaylistGeneration` | Preview, edit, confirm create; debug failed generations | Prompts are sent to the configured LLM provider. Do not put secrets in prompts. |
| OAuth CSRF state + PKCE verifier | PostgreSQL `OAuthState` | Complete the browser OAuth redirect securely | Expires in 10 minutes. Verifier is encrypted. Deleted after use. |
| MusicMix session JWT | Device `expo-secure-store` and optional httpOnly cookie | Authenticate API calls | Not a Spotify/Google/Amazon token. |

## What is not stored

- Provider client secrets and `AI_API_KEY` (process environment only)
- Copyrighted audio or video bytes
- Payment card data
- Contacts, precise location, or advertising IDs
- Raw authorization codes after the callback completes

## Legal / Play Store follow-up (not done in STEP 8)

Publish a privacy policy URL, complete Play Data safety, and document LLM subprocessors (`AI_PROVIDER`) before a public release.
