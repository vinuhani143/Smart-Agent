# Google Play Data Safety (draft mapping)

**Developer must verify these declarations before Play Store submission.** This is not a claim that MusicMix is Play-compliant. Items marked **VERIFY** need a human to confirm the Play Console form matches this inventory.

Encryption in transit assumes production HTTPS (`EXPO_PUBLIC_API_URL` must be `https://`). Tokens at rest: AES-256-GCM on the server.

| Data type (Play categories) | Collected? | Purpose | Required/optional | Shared | Encrypted in transit | Deletion | Developer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Personal info: User IDs | Yes — MusicMix cuid | App functionality | Required | No | Yes (HTTPS) | Account delete | VERIFY listing text |
| Personal info: Name | Optional display name | App functionality | Optional | No | Yes | Account delete | VERIFY |
| Personal info: Email | Not stored. Spotify OAuth requests `user-read-email` for profile; MusicMix persists display name and provider user id only | — | — | — | — | — | VERIFY Play form vs unused email scope |
| Audio files | No | — | — | — | — | — | VERIFY “not collected” |
| Photos / video | No (cover URLs only, not uploaded) | — | — | — | — | — | VERIFY |
| Music and audio: playlist contents | Playlist/track **metadata** only | App functionality | Optional | Metadata sent to Spotify/YouTube/Amazon when the user connects and acts | Yes | Playlist or account delete | VERIFY |
| App activity | API logs: path, status, request id | App functionality / ops | Required for running the server | No | Yes | Host log retention | VERIFY analytics vs ops |
| Device or other IDs | Session JWT in secure storage | App functionality | Required | No | Yes | Logout / account delete / uninstall | VERIFY |
| Other user-generated content | Recovery code on device; hash on server; AI prompts | Account recovery / AI | Optional | Prompt to LLM vendor if AI enabled | Yes | Account delete | VERIFY |
| Financial info | No | — | — | — | — | — | VERIFY |
| Location | No | — | — | — | — | — | VERIFY |
| Contacts | No | — | — | — | — | — | VERIFY |
| Advertising ID | No | — | — | — | — | — | VERIFY |

Account deletion: Settings → Delete MusicMix account, also linked from Privacy → **Delete Account / Delete My Data**. Remote provider playlists are **not** automatically deleted on Spotify/YouTube/Amazon.
