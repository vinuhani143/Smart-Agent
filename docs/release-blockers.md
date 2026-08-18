# MusicMix release blockers (STEP 9)

Date: 2026-08-18  
Companion: [e2e-test-report.md](./e2e-test-report.md)

This list is for **release readiness**. Automated tests in this environment are green. That does **not** mean the Android store binary is ready.

**Verdict: NOT READY FOR ANDROID BUILD**

Critical and high items below are unresolved. Do not produce an AAB/APK in this step.

---

## CRITICAL

| ID | Issue | Evidence |
| --- | --- | --- |
| C1 | Production secrets are not configured for a release | `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` must be unique production values in a secret manager. Provider client secrets (`SPOTIFY_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, optional Amazon LWA, `AI_API_KEY`) are empty in this environment. Empty secrets are correct for the repo; they are not acceptable for a shipped app. |
| C2 | Official Spotify OAuth and Web API were not proven with a real development app | Connect, login, search, playlists, create/add/remove/reorder, token refresh, and disconnect are **BLOCKED**. Shipping “Connect Spotify” without that proof is an OAuth release risk. |
| C3 | Official Google / YouTube OAuth and Data API v3 were not proven | Same as C2 for YouTube. Quota handling is unit-tested only. |
| C4 | Release `EXPO_PUBLIC_API_URL` still defaults to `http://127.0.0.1:4000` | A production binary that keeps this default cannot reach the API from a phone. `.env.production.example` shows HTTPS, but it is not wired into a signed build. |

---

## HIGH

| ID | Issue | Evidence |
| --- | --- | --- |
| H1 | Anonymous MusicMix sessions have no account recovery | First launch mints a user + JWT (30 days). Expiry or reinstall creates a **new** user and orphans playlists, conversions, and linked music accounts. |
| H2 | Privacy policy URL, Play Data safety form, and EAS production signing are missing | In-app Privacy copy is local only. `eas.json` has an `app-bundle` profile but no production credentials, store listing, or data-safety questionnaire. |
| H3 | Live AI playlist generation was not proven | Unconfigured AI correctly returns `503 AI_UNAVAILABLE` (no fake songs). Preview, ranking, duration fill, and confirm-create against real catalogs are **BLOCKED**. |
| H4 | Android UI / TalkBack / keyboard / back-button QA was not run on hardware | Layout and a11y attributes exist in code. Small/normal/large screen, IME, and unreachable-control checks are **BLOCKED**. |
| H5 | Dependency audit highs remain (no safe non-major fix) | Backend `npm audit --omit=dev`: 4 high (`deepmerge-ts` / `effect` via Prisma CLI). Frontend: 14 high (`image-size` via Metro/Expo). `npm audit fix --force` would downgrade Prisma or Expo and is **not** applied. |
| H6 | Custom saved-playlist reorder is not implemented | STEP 6 required reorder. Playlist detail can remove/rename; it cannot persist a new order. Provider adapters implement reorder; there is no MusicMix REST reorder for local playlists. |

---

## MEDIUM

| ID | Issue | Evidence |
| --- | --- | --- |
| M1 | Amazon Music is closed beta / disabled | Correct product state. Do not market Amazon as available. Conversion/AI hide Amazon unless `enabled`. |
| M2 | In-memory rate limit and `oncePerKey` are process-local | Multiple API instances can accept duplicate creates and skip shared rate limits. Needs Redis (or equivalent) before horizontal scale. |
| M3 | Remote provider playlist is created before the local transaction | If local persist fails after `adapter.createPlaylist`, an orphan playlist can remain on Spotify/YouTube. App then shows the local (failed) state, not the remote leftover. |
| M4 | Dedicated ESLint is not configured | `npm run lint` aliases TypeScript checks. Style/react-hooks lint is not a gate. |
| M5 | After the 2s settle window, creating another playlist with the same name is allowed | Double-tap is collapsed. Two intentional creates of “Chill” still produce two rows. |
| M6 | Multi-instance / production HTTPS, CORS, and OAuth redirect URIs are not deployed | Templates exist (`.env.production.example`). No production host was used in this QA pass. |
| M7 | YouTube playlist reorder of a range is unsupported | By design (quota / partial update). UI must keep showing a clear message when that path is used. |
| M8 | Contrast was not measured | Dark/light tokens exist; WCAG contrast was not instrumented. |

---

## LOW

| ID | Issue | Evidence |
| --- | --- | --- |
| L1 | Root `npx tsc --noEmit` is not the TypeScript compiler | Root has no `typescript` binary. Use `npm run typecheck` (or `npm run tsc`). |
| L2 | Provider HTTP 400 is mapped to `TOKEN_INVALID` | User is asked to reconnect. Some 400s may be validation, not token failure. |
| L3 | Chip touch target was 40px | Raised to `MIN_TOUCH` (44) in this pass. Still unverified on a device. |
| L4 | Metro was not left running as an interactive Expo session | `expo-doctor` 21/21 passed; interactive QR/emulator session was not the QA vehicle. |

---

## Issues fixed in this QA pass (not blockers)

- Express 5 `validateQuery` no longer assigns `req.query` (that assignment threw `TypeError` → HTTP 500 on valid Unicode/search queries).
- Local playlist create + tracks run in a Prisma transaction.
- Rapid duplicate **Create Playlist** / **Add Track** share an in-process result for 2 seconds (`oncePerKey` settle window).
- Provider HTTP 409 maps to `ConflictError`.
- Playlist name/description fields are capped in the UI to match API limits.
- Amazon availability helpers are unit-tested without pulling React Native Paper into Node tests.
- HTTP integration coverage for auth, IDOR, Amazon disabled, AI-unconfigured, Unicode search, and DB constraints.

---

## What would make this READY FOR ANDROID BUILD

All of the following:

1. Production secrets + HTTPS API URL + matching OAuth redirect URIs.  
2. Live Spotify and YouTube E2E (C2, C3) on official development apps — PASS, not BLOCKED.  
3. Account recovery or an explicit “anonymous local-only” product decision (H1).  
4. Privacy policy URL + Play Data safety + signing config (H2).  
5. Device UI/a11y pass (H4) and either a playlist reorder feature or an accepted product cut (H6).  
6. No remaining **CRITICAL** or **HIGH** items.

Until then: **NOT READY FOR ANDROID BUILD**.
