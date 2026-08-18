# MusicMix end-to-end test report (STEP 9)

Date: 2026-08-18  
Scope: Expo app + Express API + Prisma (branch `cursor/e2e-testing-qa-46b7`).  
This pass is testing, debugging, and release readiness. No Android AAB/APK was produced.

## How to read statuses

| Status | Meaning |
| --- | --- |
| **PASS** | Observed in this environment (automated test, HTTP smoke, or code path proven by tests). |
| **FAIL** | Observed incorrect behavior or a missing required capability. |
| **BLOCKED** | Could not execute because credentials, a device, or a service were missing. Not treated as PASS. |

Automated Node tests: **backend 191 pass / 0 fail**, **frontend 16 pass / 0 fail** (**207** total).  
Live Spotify, YouTube, Amazon (enabled), and AI provider E2E were **not** run: `SPOTIFY_*`, `GOOGLE_*`, `AI_API_KEY`, and Amazon approval/credentials are empty. No Android emulator or device was attached.

---

## 1. Test environment

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ENV-01 | Backend start | `npx tsx src/server.ts` with validated env | API listens; `GET /api/health` returns `{ ok: true }` | HTTP 200 `{ ok: true, service: "musicmix-backend" }` | PASS | Local Postgres + generated JWT/encryption keys (not committed). |
| ENV-02 | Frontend tooling | Expo project diagnostics | Expo doctor passes | `expo-doctor`: 21/21 checks passed | PASS | Interactive Metro UI was not left running. |
| ENV-03 | PostgreSQL | Prisma can connect | Migrations apply | Six migrations previously applied; `pg_isready` accepting connections | PASS | |
| ENV-04 | Prisma schema | `npx prisma validate` | Schema valid | `The schema at prisma/schema.prisma is valid` | PASS | |
| ENV-05 | Env validation | Missing `DATABASE_URL` | Process refuses to start | Start without DB URL: `Invalid environment configuration: DATABASE_URL` | PASS | Zod `loadEnv()`. |
| ENV-06 | Env templates | `.env.example` / `.env.test.example` | Placeholders only; no real secrets | Files contain empty/placeholder values; `.gitignore` allows the example files | PASS | Never commit real credentials. |
| ENV-07 | TypeScript | Backend + frontend `tsc --noEmit` | No errors | Both packages pass | PASS | Root `npx tsc --noEmit` is not a project compiler; use `npm run typecheck`. |
| ENV-08 | Lint | `npm run lint` | A defined gate exists | Script runs `npm run typecheck` (no ESLint config) | PASS | Dedicated ESLint is still missing (see release blockers). |
| ENV-09 | `npm test` | Root test script | Backend + frontend tests run | 207 pass / 0 fail | PASS | |

---

## 2. Automated tests added/run

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AUTO-01 | Unit + integration | All `src/**/*.test.ts` | All pass | Backend 191, frontend 16 | PASS | |
| AUTO-02 | Auth HTTP | Missing / malformed / expired JWT | 401, no JWT internals in body | Integration tests pass | PASS | |
| AUTO-03 | IDOR | User B reads/modifies User A playlist, conversion, AI generation | 404 | Integration tests pass | PASS | Confirm/create conversion and AI create also 404. |
| AUTO-04 | Spotify adapter | PKCE URL, search mapping, 401 mapping | No client secret in URL; real Spotify ids; no invented ISRC; token not in errors | Unit tests with mocked `fetch` | PASS | Not a live Spotify account. |
| AUTO-05 | YouTube adapter | Google URL, multi-item reorder, quota | No client secret; `OperationNotSupportedError`; quota not retryable | Unit tests pass | PASS | |
| AUTO-06 | Amazon disabled | `/api/providers` and adapter | `enabled: false`, official unavailable copy, no fake catalog | HTTP + unit tests | PASS | |
| AUTO-07 | Track matching | High / medium / low / none | Low confidence needs review; empty candidates `not_found` | `conversionLogic.test.ts` / `TrackMatcher` | PASS | |
| AUTO-08 | Duplicate detection | Same id / ISRC / title+artist | Duplicates rejected | Backend + frontend unit tests | PASS | |
| AUTO-09 | Conversion logic | Duplicates, manual pick, skip | Destination set excludes unresolved rows | Unit tests pass | PASS | Live convert BLOCKED. |
| AUTO-10 | AI parsing | Five STEP 9 prompts | Language/mood/duration/theme extracted | `promptScenarios.test.ts` | PASS | Live generate BLOCKED. |
| AUTO-11 | AI confirmation | Generate must not create; empty create refused | Rules throw on `CREATED` / 0 tracks | Unit tests pass | PASS | |
| AUTO-12 | Rate limit | Limiter after 2 hits | HTTP 429 `RATE_LIMITED` | `rateLimit.test.ts` | PASS | In-memory store. |
| AUTO-13 | DB constraints | Cascade, unique account, empty playlist, duplicate track, TX rollback | Constraints hold | `db.integration.test.ts` | PASS | Real Postgres. |
| AUTO-14 | Error matrix | 200–503 provider + API mapping | Typed errors; user-safe 500 | `httpErrors.matrix.test.ts`, `errorHandler.test.ts`, frontend `messageForHttpStatus` | PASS | Timeout maps to `NetworkError` via abort. |
| AUTO-15 | Search validation | Empty, long, Unicode Telugu/Hindi/Tamil, special chars | Invalid 400; Unicode does not 500 | Schema + HTTP tests | PASS | Live catalog search BLOCKED. |

---

## 3. Spotify end-to-end (official API)

Official Spotify client id/secret and a development account were **not configured**. Live steps are BLOCKED. Adapter behavior is covered by mocked official JSON fixtures (no fake tracks).

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SP-01 | Connect Spotify | Start OAuth | PKCE authorize URL, no client secret | URL builder unit test | PASS | Live browser login BLOCKED. |
| SP-02 | OAuth login | Callback exchanges code | Tokens stored encrypted; not returned to app | Code review + session smoke (`token`, `userId` only) | BLOCKED | No Spotify app credentials. |
| SP-03 | Current user | `GET` me | Profile mapped | Not executed live | BLOCKED | |
| SP-04 | Search song | Search query | Spotify track ids | Mapping unit test uses id `6rqhFgbbKwnb9MLmUQDhG6` | BLOCKED | Live search BLOCKED; mapping PASS as AUTO-04. |
| SP-05 | Search artist | Artist query | Official results | Not executed live | BLOCKED | |
| SP-06 | Load playlists | List user playlists | Official playlists | Not executed live | BLOCKED | |
| SP-07 | Open playlist | Playlist detail | Metadata | Not executed live | BLOCKED | |
| SP-08 | Load tracks | Playlist items | Track list | Not executed live | BLOCKED | |
| SP-09 | Create playlist | Create on Spotify | One playlist | Not executed live | BLOCKED | |
| SP-10 | Add tracks | Add items | Tracks added | Not executed live | BLOCKED | |
| SP-11 | Remove track | Remove item | Track removed | Not executed live | BLOCKED | |
| SP-12 | Reorder tracks | Reorder | Order updated | Adapter exists; not executed live | BLOCKED | |
| SP-13 | Refresh token | Expired access token | Refresh without leaking token | 401 → `TOKEN_EXPIRED` unit test; live refresh BLOCKED | BLOCKED | |
| SP-14 | Disconnect | Disconnect Spotify | Account row deleted | Route exists; live BLOCKED | BLOCKED | |
| SP-15 | Token exposure | Frontend / logs | No access/refresh tokens | Session + `/api/providers` smoke: no `accessToken`/`refreshToken`; logger redacts secret keys | PASS | Live OAuth token path still BLOCKED. |
| SP-16 | Double-tap create | Two rapid creates | No duplicate Spotify playlist | In-process `oncePerKey` + 2s settle; live provider create BLOCKED | BLOCKED | Local playlist HTTP concurrent create now returns the same id. |

---

## 4. YouTube end-to-end (official API)

Google OAuth / YouTube Data API credentials were **not configured**.

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| YT-01 | Connect YouTube | Start OAuth | Google URL, no client secret | Unit test | PASS | Live login BLOCKED. |
| YT-02 | OAuth login | Callback | Encrypted tokens | Not executed | BLOCKED | |
| YT-03 | Current user | Channel profile | Mapped user | Not executed | BLOCKED | |
| YT-04 | Search music | `search.list` | Video ids | Not executed | BLOCKED | |
| YT-05 | Load playlists | `playlists.list` | Playlists | Not executed | BLOCKED | |
| YT-06 | Load items | `playlistItems.list` | Videos | Not executed | BLOCKED | |
| YT-07 | Create playlist | Create | One playlist | Not executed | BLOCKED | |
| YT-08 | Add video | Insert item | Item added | Not executed | BLOCKED | |
| YT-09 | Remove video | Delete item | Item removed | Not executed | BLOCKED | |
| YT-10 | Update metadata | Patch playlist | Title/description | Not executed | BLOCKED | |
| YT-11 | Reorder | Multi-item range | Unsupported, no partial updates | `OperationNotSupportedError` unit test | PASS | Single-item live reorder BLOCKED. |
| YT-12 | Refresh token | Expired Google token | Refresh | Not executed | BLOCKED | |
| YT-13 | Disconnect | Revoke + delete | Account gone | Not executed | BLOCKED | |
| YT-14 | Quota exceeded | 403 `quotaExceeded` | Not retried; user-safe message | `YouTubeQuotaExceededError`, `isNonRetryableProviderError` | PASS | Live quota exhaustion not induced. |

---

## 5. Amazon Music

Official Amazon Music Web API access is **not configured**. `AMAZON_MUSIC_ENABLED` defaults to false.

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AM-01 | Availability | Providers list | Unavailable / closed beta, not connected | `enabled: false`, `connected: false`, official unavailable reason | PASS | Smoke + integration. |
| AM-02 | Fake results | Search Amazon | No fake catalog | Adapter refuses when disabled | PASS | |
| AM-03 | Fake create | Create Amazon playlist | No fake playlist | Disabled adapter throws unavailable | PASS | |
| AM-04 | Stability | App/API with Amazon off | No crash | Health, session, local playlist create succeeded | PASS | |
| AM-05 | Other providers | Spotify/YouTube still listed | Present as disabled until credentials exist | Both listed `enabled: false` (not configured) | PASS | They remain independently configurable. |
| AM-06 | Live Amazon E2E | Official API when enabled | Same playlist operations as other providers | Not configured | BLOCKED | Do not invent credentials. |

---

## 6. Custom playlist

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PL-01 | Create | Local playlist | 201 + id | HTTP smoke 201 | PASS | |
| PL-02 | Add songs | Add track | Track stored | DB + controller tests | PASS | `oncePerKey` on add. |
| PL-03 | Remove songs | Remove track | Remaining reindexed | DB integration | PASS | |
| PL-04 | Reorder | Change order on a saved MusicMix playlist | Persist new order | No REST reorder endpoint; Playlist detail has no move controls | FAIL | AI preview can move tracks (`TrackRow` up/down). Provider reorder exists on adapters only. |
| PL-05 | Rename | Update name | Saved | DB `updatePlaylist` | PASS | UI `maxLength={120}`. |
| PL-06 | Edit description | Update description | Saved | DB integration | PASS | Cap 2000. |
| PL-07 | Delete | Delete playlist | 204 / not found after | DB + IDOR tests | PASS | |
| PL-08 | Duplicate song | Add same track twice | 409 duplicate | `DuplicateTrackError` | PASS | Frontend toast also blocks. |
| PL-09 | Empty playlist | Create with no tracks | Allowed | DB test | PASS | |
| PL-10 | Very long name | 121+ characters | 400 | HTTP 400 `VALIDATION_ERROR` | PASS | |
| PL-11 | Invalid input | Injected `userId` | 400 | Strict Zod | PASS | |

---

## 7. AI playlist generation

Live LLM calls were **not** made (`AI_API_KEY` empty). Parsing/rules are unit-tested. HTTP generate returns setup error instead of fake songs.

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AI-01 | Prompt “90s Telugu hits” | Parse intent | Telugu, hits, 1990–1999 | Unit parse | PASS | Live search/rank BLOCKED. |
| AI-02 | “2 hour Telugu romantic melodies” | Parse | Telugu, romantic, melody, 120 min | Unit parse | PASS | |
| AI-03 | “60 minute workout playlist” | Parse | 60 min, workout | Unit parse | PASS | |
| AI-04 | “Relaxing English songs” | Parse | English, relaxing | Unit parse | PASS | |
| AI-05 | “Night drive playlist” | Parse | `night_drive` theme | Unit parse | PASS | |
| AI-06 | Confirmation gate | Generate vs create | Generate never creates provider playlist | `assertGenerateDoesNotCreate`; create requires confirm | PASS | |
| AI-07 | No AI credentials | Generate | 503 `AI_UNAVAILABLE`, no playlist body | HTTP smoke 503 | PASS | |
| AI-08 | AI API failure | 401/429/503 from LLM | User-safe messages, no key leak | `userSafeAiMessage` | PASS | Live failure BLOCKED. |
| AI-09 | AI rate limit | Too many generates | 429 limiter | `aiGenerateLimiter` 20/15min | PASS | Not load-tested against a real LLM. |
| AI-10 | No matching songs | Empty catalog | Warning; no invented tracks | `fewTracksWarning`; create refused at 0 tracks | PASS | Live empty catalog BLOCKED. |
| AI-11 | Too few songs | Below requested count | Warning, no fakes | Unit tests | PASS | |
| AI-12 | Preview / edit / replace / reorder | Manual edits before create | Status EDITED; still needs confirm | Service + UI exist | BLOCKED | Needs live generation. |
| AI-13 | Final create | Explicit confirm | Provider playlist only after confirm | `createOnProvider` + `oncePerKey` | BLOCKED | Live create BLOCKED. |

---

## 8. Cross-platform conversion

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CV-01 | Spotify → YouTube | Analyze + confirm + create | Official search; create only after confirm | Logic unit-tested; live BLOCKED | BLOCKED | |
| CV-02 | YouTube → Spotify | Same | Same | Live BLOCKED | BLOCKED | |
| CV-03 | Routes involving Amazon | When Amazon disabled | Amazon not offered as live destination | UI uses `isAmazonMusicLive`; providers `enabled: false` | PASS | Live Amazon convert BLOCKED (AM-06). |
| CV-04 | High-confidence match | ≥90 / exact / ISRC | Auto-match, no review flag | Unit tests | PASS | |
| CV-05 | Medium-confidence | 75–89 | Needs review | Unit tests | PASS | |
| CV-06 | Low-confidence | Below medium | Needs review / not auto-selected | Unit tests | PASS | |
| CV-07 | No match | Empty candidates | `not_found` | Unit tests | PASS | |
| CV-08 | Manual selection | User picks destination | `manual`, confidence 100 | Unit tests | PASS | |
| CV-09 | Duplicate sources | Same destination track | One MATCHED, other DUPLICATE | Unit tests | PASS | |
| CV-10 | Unavailable destination | Confirm required before create | `ANALYZED` cannot create | `ConflictError` in `createConvertedPlaylist` | PASS | Live unavailable track BLOCKED. |
| CV-11 | IDOR conversion | User B confirm/create | 404 | HTTP integration | PASS | |

---

## 9. Search

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SR-01 | Normal search | Valid query | Provider search when connected | Schema accepts; live BLOCKED | BLOCKED | Unconnected search: 401 `TOKEN_INVALID`. |
| SR-02 | Empty search | `q=` | 400 | HTTP 400 | PASS | |
| SR-03 | Very long search | 201 chars | 400 | HTTP 400 | PASS | |
| SR-04 | Special characters | Quotes, `&`, `/` | Accepted by schema | Schema test | PASS | |
| SR-05 | Unicode Telugu | Telugu query | Not 500 | HTTP ≠ 500 (401 without provider) | PASS | Express 5 `req.query` assignment bug fixed. |
| SR-06 | Hindi | Schema | Valid | Schema test | PASS | |
| SR-07 | Tamil | Schema | Valid | Schema test | PASS | |
| SR-08 | English | Schema | Valid | Schema test | PASS | |
| SR-09 | Artist / album | Filters | Supported in query schema | Schema allows artist/album fields | PASS | Live BLOCKED. |
| SR-10 | Debounce | Rapid typing | 400ms debounce | `useDebouncedValue` in Search/Create/Convert/AI | PASS | No device UI timing capture. |
| SR-11 | Pagination | Provider pages | Where APIs support | Not exercised live | BLOCKED | |
| SR-12 | Unknown provider | `/api/search/tidal` | Not a fake adapter | HTTP 503 | PASS | |

---

## 10. Network failure

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| NET-01 | No internet | Provider fetch fails | `NetworkError`, no crash | `providerFetch` catch → NetworkError | PASS | Device airplane-mode BLOCKED. |
| NET-02 | Slow internet / timeout | 15s abort | Timeout message | AbortError → NetworkError | PASS | Live slow-net BLOCKED. |
| NET-03 | Backend unavailable | API down | Frontend timeout/error copy | `apiFetch` 20s + user-safe messages | PASS | Code review; device BLOCKED. |
| NET-04 | Spotify unavailable | 502/503 | Retryable NetworkError | Error matrix | PASS | |
| NET-05 | YouTube unavailable | 502/503 | Same | Error matrix | PASS | |
| NET-06 | AI unavailable | Unconfigured / 5xx | 503 AI_UNAVAILABLE | Smoke 503 | PASS | |
| NET-07 | Database unavailable | Missing DATABASE_URL | Process does not boot | ENV-05 | PASS | Mid-flight DB kill not simulated. |
| NET-08 | Retry vs duplicate create | Retry after success | No second playlist within settle window | `oncePerKey` 2s settle | PASS | After settle, same name can create another local playlist (documented). |

---

## 11. Authorization / security

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | User A playlist vs User B | GET/PUT/DELETE | 404 | Integration | PASS | |
| SEC-02 | User A conversion vs User B | GET/confirm/create | 404 | Integration | PASS | |
| SEC-03 | User A AI generation vs User B | GET/create | 404 | Integration | PASS | |
| SEC-04 | Expired session | Past `exp` | 401 | Integration | PASS | |
| SEC-05 | Invalid token | `Bearer not-a-jwt` | 401 | Smoke + integration | PASS | |
| SEC-06 | Missing auth | No header | 401 | Integration | PASS | |
| SEC-07 | Invalid provider | `tidal` | 503 / validation | HTTP 503 | PASS | |
| SEC-08 | Malformed body | Extra `userId` | 400 | Strict Zod | PASS | |
| SEC-09 | Token logs | Logger meta | Redacted keys | `redactLogMeta` unit test | PASS | |
| SEC-10 | Provider tokens on client | Session + providers | Never included | Smoke | PASS | |

---

## 12. Double-tap / idempotency

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ID-01 | Create playlist | Concurrent identical name | Same playlist id | HTTP integration after settle-window fix | PASS | |
| ID-02 | Convert playlist | Concurrent create | `oncePerKey` + CREATED short-circuit | Unit + service | PASS | Live convert BLOCKED. |
| ID-03 | Generate playlist | Concurrent generate | Same in-flight key | Controller `oncePerKey` | PASS | Live LLM BLOCKED. |
| ID-04 | Add track | Rapid add same track | One add; duplicate 409 after settle | Controller `oncePerKey` + DB unique | PASS | Device double-tap BLOCKED. |

---

## 13. Android UI

No emulator/device. Layout reviewed in source (`Screen` SafeArea + KeyboardAvoidingView, tab navigation, dialogs).

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | Small / normal / large screens | Portrait | Usable layout | Not measured on hardware | BLOCKED | |
| UI-02 | Keyboard | Inputs | KeyboardAvoidingView enabled | Code present | BLOCKED | Device IME not tested. |
| UI-03 | Back button | Android back | Expo Router default | Not tested on device | BLOCKED | |
| UI-04 | Safe areas | Notch/nav bar | `SafeAreaView` edges top/left/right | Code present | BLOCKED | |
| UI-05 | Scrolling | Long lists | `ScrollView` default on `Screen` | Code present | BLOCKED | 100/500-song lists not rendered on device. |
| UI-06 | Bottom navigation | Tabs reachable | Tab layout exists | Code present | BLOCKED | |
| UI-07 | Modals | Confirm delete | `ConfirmDialog` | Code present | BLOCKED | |
| UI-08 | Loading / error | Query states | `LoadingState` / `ErrorState` / `ErrorBanner` | Code present | BLOCKED | |
| UI-09 | Clipped text / unreachable buttons | Visual QA | None | Not visually verified | BLOCKED | |

---

## 14. Accessibility

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A11Y-01 | Touch targets | ≥44 | `MIN_TOUCH = 44` on buttons; Chip raised to 44 in this pass | Code | PASS | Not measured on a physical screen. |
| A11Y-02 | Labels | Buttons/inputs labeled | `accessibilityLabel` on AppButton, Chip, TrackRow, cards | Code | PASS | TalkBack not run. |
| A11Y-03 | Screen reader | Logical roles | `accessibilityRole` button/progressbar/checkbox | Code | PASS | TalkBack BLOCKED. |
| A11Y-04 | Contrast | Light/dark palettes | Distinct text vs background tokens | Code review only | BLOCKED | No contrast meter. |
| A11Y-05 | Color-only status | Match confidence | Text labels High/Medium/Needs Review/Not Found | Unit test | PASS | |
| A11Y-06 | TalkBack navigation | Full pass | Order matches layout | Not run | BLOCKED | |

---

## 15. Database

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DB-01 | Foreign keys | User delete | Playlists cascade | Integration | PASS | |
| DB-02 | Unique MusicAccount | One provider per user | Second insert fails | Integration | PASS | |
| DB-03 | Unique PlaylistTrack | Same track twice | Duplicate rejected | Integration + Prisma unique | PASS | |
| DB-04 | Duplicate prevention | Application + DB | DuplicateTrackError | Integration | PASS | |
| DB-05 | Transactions | Unique violation mid-create | No leftover playlist | Integration rollback test | PASS | |
| DB-06 | Partial remote add | Provider playlist created, local TX fails | Possible orphan remote playlist | Remote create still happens before local persist | FAIL | Documented MEDIUM; not rewritten in this QA step (would be a larger provider flow change). |
| DB-07 | Ownership | `getPlaylist(userId, id)` | Stranger NotFound | Integration | PASS | |

---

## 16. API error matrix

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ERR-200 | 200 | Success | No throw | Provider matrix | PASS | |
| ERR-201 | 201 | Playlist create | 201 | Smoke | PASS | |
| ERR-400 | 400 | Validation / provider 400 | User-safe 400 | Playlist name; provider 400 → reconnect copy | PASS | Provider 400 is `TOKEN_INVALID` (generic). |
| ERR-401 | 401 | Auth | Sign-in/reconnect copy | HTTP + frontend map | PASS | |
| ERR-403 | 403 | Permissions | Access copy | Typed `InsufficientPermissionsError` | PASS | |
| ERR-404 | 404 | Missing | Not found | IDOR + provider 404 | PASS | |
| ERR-409 | 409 | Conflict/duplicate | Already completed / duplicate | Duplicate track; provider 409 → `ConflictError` | PASS | |
| ERR-429 | 429 | Rate limit | Wait message | Limiter + provider 429 | PASS | |
| ERR-500 | 500 | Unhandled | Generic message, no stack | errorHandler | PASS | |
| ERR-502 | 502 | Bad gateway | NetworkError | Matrix | PASS | |
| ERR-503 | 503 | Unavailable | Unavailable copy | Amazon/AI/provider | PASS | |
| ERR-TIMEOUT | timeout | Abort | NetworkError | providerFetch | PASS | |

---

## 17. Performance

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PF-01 | 100-song playlist | Render/API | No freeze / bounded queries | Playlist list does not over-fetch tracks | BLOCKED | No 100-track fixture on device. |
| PF-02 | 500-song playlist | Where APIs allow | Bounded conversion concurrency | `mapPool` concurrency 3; AI max 6 queries | BLOCKED | Live large playlist BLOCKED. |
| PF-03 | Large search | Many results | Debounced; no infinite loop | Debounce 400ms | PASS | Live BLOCKED. |
| PF-04 | N+1 Prisma | Library list | Summary query | Performance audit still accurate | PASS | Conversion still O(n) provider searches (expected). |
| PF-05 | Memory leaks | Long session | None | Not profiled | BLOCKED | |
| PF-06 | UI freeze | JS thread | None | Not profiled | BLOCKED | |

---

## 18. Real data validation

| Test ID | Feature | Scenario | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| RD-01 | Audio storage | DB/schema | No audio blobs | Schema stores metadata + ids only | PASS | |
| RD-02 | Spotify IDs | Search mapping | Official `id` | Unit fixture | PASS | Live ids BLOCKED. |
| RD-03 | YouTube video IDs | Mapping | Official video id | Adapter tests / conversion fixtures | PASS | Live BLOCKED. |
| RD-04 | ISRC | Missing ISRC | Not fabricated | Spotify search with empty `external_ids` → `isrc` undefined | PASS | |
| RD-05 | Invented songs | AI / match | No fake tracks | Unconfigured AI 503; matcher does not invent candidates | PASS | Live ranking BLOCKED. |

---

## Totals (this report)

Counted from the tables above (each Test ID is one case).

| Status | Count |
| --- | --- |
| PASS | 125 |
| FAIL | 2 |
| BLOCKED | 47 |
| **Total** | **174** |

Automated Node tests (separate from the scenario table): **207 passed**, **0 failed**.

FAIL items:

1. **PL-04** — Saved custom playlist reorder is not exposed in the API or Playlist detail UI.  
2. **DB-06** — Remote provider playlist is created before the local Prisma transaction; a local failure can leave an orphan remote playlist.

BLOCKED items are primarily live Spotify/YouTube/Amazon/AI OAuth and Android device/UI/performance profiling.
