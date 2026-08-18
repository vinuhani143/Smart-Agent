# AI live verification

Status: **BLOCKED**

MusicMix must not invent songs. When `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` are missing, `POST /api/ai/playlists/generate` returns **503 `AI_UNAVAILABLE`**. Keep that behavior.

| Field | Value |
| --- | --- |
| AI provider | `openai`, `anthropic`, or `openai-compatible` via `AI_PROVIDER` |
| API key | `AI_API_KEY` on the backend only (never `EXPO_PUBLIC_*`) |
| Model | `AI_MODEL` |
| Base URL | `AI_BASE_URL` required for `openai-compatible` |
| Test prompt | `90s Telugu hits` |
| Expected behavior | Parse intent, search official catalogs, rank real tracks, preview, create only after confirm |
| Actual behavior in this environment | 503 setup error; no fake playlist |
| Privacy | Prompts are sent to the configured LLM vendor. Do not put secrets in prompts. See the data inventory. |
| Rate limits | 20 generate requests / 15 minutes / IP; provider 429 mapped to a user-safe wait message |

Do not mark this VERIFIED until a real key is configured and a generation is confirmed against official search results.
