# Production AI configuration

Status: **BLOCKED** until `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` are set on the **backend** and a live generation is tested against official catalogs.

| Variable | Location | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | Backend only | `openai`, `anthropic`, or `openai-compatible` |
| `AI_API_KEY` | Backend only | Never `EXPO_PUBLIC_AI_API_KEY`. Never log the value. |
| `AI_MODEL` | Backend only | Vendor model id |
| `AI_BASE_URL` | Backend only | Required for `openai-compatible` |

When any of these are missing, `POST /api/ai/playlists/generate` returns **503 `AI_UNAVAILABLE`**. There is no fake playlist fallback.

The frontend `/api/ai/status` response may include `configured`, `provider`, `modelConfigured`, and `apiKeyConfigured` booleans. It must not include the key.

Privacy: prompts are sent to the LLM vendor when the feature is enabled. See `privacy-policy-data-inventory.md`.

Rate limit: 20 generate requests / 15 minutes / IP (see `aiGenerateLimiter`).
