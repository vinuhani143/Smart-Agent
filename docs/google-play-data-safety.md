# Google Play Data Safety (draft mapping)

**Developer must verify these declarations before Play Store submission.** This is not a claim that MusicMix is Play-compliant.

| Data type (Play categories) | Collected? | Purpose | Optional/required | Encrypted in transit | Deletion | Shared with third parties |
| --- | --- | --- | --- | --- | --- | --- |
| Personal info: User IDs | Yes (MusicMix id) | App functionality | Required | HTTPS to the API | Account delete | No |
| Personal info: Name | Optional display name | App functionality | Optional | HTTPS | Account delete | No |
| Audio files | No | — | — | — | — | — |
| Music and audio history / playlist contents | Playlist and track **metadata** only | App functionality | Optional | HTTPS | Playlist or account delete | Metadata sent to Spotify/YouTube/Amazon when the user connects and acts; AI prompt sent to the LLM vendor if configured |
| App activity | API request logs (path, status, request id) | Analytics/ops | Required for running the server | HTTPS | Host log retention | No |
| Device or other IDs | Session JWT in secure storage | App functionality | Required | HTTPS | Logout / account delete / uninstall | No |
| Other user-generated content | Recovery code (device) / hash (server) | Account recovery | Optional | HTTPS | Account delete / uninstall | No |
| Financial info | No | — | — | — | — | — |

Encryption in transit: use HTTPS in production (`EXPO_PUBLIC_API_URL` must be `https://`). Tokens at rest: AES-256-GCM on the server.

Account deletion: Settings → Delete MusicMix account. Remote provider playlists are **not** automatically deleted on Spotify/YouTube/Amazon.
