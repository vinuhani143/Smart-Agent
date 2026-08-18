# MusicMix release blockers (STEP 10)

Date: 2026-08-18  
Companions: [production-environment.md](./production-environment.md), [production-oauth-config.md](./production-oauth-config.md), [production-ai-config.md](./production-ai-config.md), [android-qa-checklist.md](./android-qa-checklist.md)

**Verdict: CODE is release-ready. Production configuration is not. NOT READY FOR PREVIEW APK / PRODUCTION AAB / PLAY INTERNAL TESTING until the lists below are cleared.**

No APK/AAB was produced. `eas build` was not run.

---

## A. CODE

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| PL-04 reorder | — | **Fixed** | Saved playlist reorder API + Up/Down |
| DB-06 remote orphan | — | **Fixed** | Compensating remote create / cleanup |
| Production localhost API fallback | — | **Fixed** | Fail closed for loopback / HTTP |
| Production startup | — | **Fixed** | JWT/test secrets, DB TLS, CORS `*`, DEBUG_ERRORS |

No remaining critical/high **code** defects identified. Code quality does **not** block a code-complete tag.

---

## B. CONFIGURATION

| ID | Severity | Status | Item |
| --- | --- | --- | --- |
| CFG-1 | CRITICAL | **BLOCKED** | Production `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL` (SSL), `API_PUBLIC_URL` |
| CFG-2 | CRITICAL | **BLOCKED** | Real `EXPO_PUBLIC_API_URL=https://YOUR_REAL_BACKEND_DOMAIN` (placeholder still in `eas.json`) |
| CFG-3 | HIGH | **BLOCKED** | `CORS_ALLOWED_ORIGINS` for any production web origin (empty is OK for native-only; never `*`) |
| CFG-4 | HIGH | **BLOCKED** | `INTERNAL_CLEANUP_KEY` for orphan remote cleanup |
| CFG-5 | HIGH | **BLOCKED** | EAS project link + production env substitution (no backend secrets in the app) |

---

## C. EXTERNAL CREDENTIALS

| ID | Severity | Status |
| --- | --- | --- |
| EXT-1 Spotify OAuth | CRITICAL | **BLOCKED** / NOT_CONFIGURED |
| EXT-2 Google/YouTube OAuth | CRITICAL | **BLOCKED** / NOT_CONFIGURED |
| EXT-3 Amazon Music | HIGH | **BLOCKED** (closed beta; keep disabled) |
| EXT-4 AI | HIGH | **BLOCKED** (503 `AI_UNAVAILABLE` until keys exist) |

---

## D. DEVICE QA

All 22 rows in [android-qa-checklist.md](./android-qa-checklist.md) are **BLOCKED** (no device/emulator run; no APK installed).

---

## E. LEGAL / STORE

| ID | Severity | Status |
| --- | --- | --- |
| LEG-1 Privacy policy | HIGH | **REQUIRES FINAL LEGAL REVIEW** |
| LEG-2 Play Data Safety | HIGH | **DEVELOPER REVIEW** |
| LEG-3 Terms of service | HIGH | **REQUIRES LEGAL REVIEW** |
| LEG-4 EAS signing | HIGH | Documented; credentials not in git; **not built** |

---

## Remaining actions

**Before preview APK:** CFG-2 real HTTPS API (or a temporary HTTPS tunnel), `npm run release-check` green for preview URL, EAS login/init, then `eas build --profile preview` (not run here). OAuth/AI can still be BLOCKED for a UI-only preview.

**Before production AAB:** CFG-1 through CFG-5, live OAuth if store listing claims those features, AI optional (feature degrades to 503), legal URLs, signing credentials, `versionCode` 1 / `1.0.0`.

**Before Play Internal Testing:** production AAB, Play Data Safety form verified by the developer, privacy/terms URLs, device QA at least on one Android device, package `com.musicmix.app`.

---

## Verification run (this branch)

| Check | Result |
| --- | --- |
| `npm test` | **PASS** — backend 213, frontend 21 (234 total, 0 fail) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** as TypeScript only (no ESLint config; not reported as ESLint) |
| `npx prisma validate` | **PASS** |
| `npm audit` | **WARNING** — high Prisma CLI / Expo Metro; no force upgrade |
| `npx expo-doctor` | **PASS** — 21/21 |
| `npm run release-check` | **BLOCKED** — CFG-2 placeholder HTTPS domain; secret scan **NOT FOUND** |
| Live OAuth / AI / Android device | **BLOCKED** |
