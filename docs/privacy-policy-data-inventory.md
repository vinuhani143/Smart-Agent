# Privacy policy data inventory

**REQUIRES FINAL LEGAL REVIEW.** This is an engineering inventory, not a privacy policy and not a claim of legal compliance.

| Data | Purpose | Retention | Shared with third parties | Required | Deletion |
| --- | --- | --- | --- | --- | --- |
| MusicMix user id | Session subject; ownership of playlists | Until account delete | No | Yes for the app to work | `DELETE /api/auth/account` cascades user rows |
| Recovery code hash | Restore a device-only account | Until account delete | No | Optional (issued at first launch) | Deleted with the user. The plaintext code is only on the device |
| Provider account id | Link Spotify/YouTube/Amazon | Until disconnect or account delete | Sent to that provider on API calls | Only if the user connects the service | Disconnect deletes the row and attempts token revoke |
| Encrypted OAuth access/refresh tokens | Call official APIs | Until disconnect or account delete | Tokens are sent to the matching provider only | If connected | Deleted with `MusicAccount`; revoke attempted |
| Playlist metadata (name, description, cover URL) | Library | Until playlist or account delete | Cover URL may be loaded from the provider CDN | Optional | Playlist delete or account delete |
| Track metadata (title, artist, album, duration, ISRC, provider ids, thumbnail URL) | Display, match, dedupe | Until unused / account delete | Thumbnails loaded from provider CDNs | Optional | Not audio. Rows may remain if shared across playlists |
| Conversion jobs and match decisions | Review before destination create | Until account delete | Destination create calls the destination provider | Optional | Cascade on user delete |
| AI prompt, parsed intent, candidate metadata | Preview generation | Until account delete | Prompt sent to the configured LLM if AI is enabled | Optional | Cascade on user delete |
| OAuth CSRF state + encrypted PKCE verifier | Complete login | ~10 minutes | No | During connect | Deleted after use or expiry |
| App diagnostics | Request id in API logs | Log retention of the host | No secrets in logs by design | Operational | Host log policy; not a user export |
| Spotify email (OAuth scope) | Requested from Spotify for profile; **not persisted** in MusicMix tables | Transient during connect | Spotify only during OAuth | No | Not stored |

Not stored: copyrighted audio, payment cards, contacts, advertising IDs, provider client secrets (process env only).

In-app draft: Settings → Privacy Policy. Marked **REQUIRES FINAL LEGAL REVIEW**.
