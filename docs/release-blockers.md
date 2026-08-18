# MusicMix release blockers (STEP 9.5)

Date: 2026-08-18  
Companions: [e2e-test-report.md](./e2e-test-report.md), [oauth-live-verification.md](./oauth-live-verification.md), [ai-live-verification.md](./ai-live-verification.md), [android-qa-checklist.md](./android-qa-checklist.md)

**Verdict: NOT READY FOR ANDROID BUILD**

Code fixes from STEP 9.5 removed the previous **HIGH code** gaps for playlist reorder (PL-04) and remote orphan compensation (DB-06), production API URL validation, anonymous recovery codes, account deletion, and health/release-readiness reporting.

Critical/high **configuration**, **credential**, **device**, and **legal/store** items remain. Those are not hidden.

No APK/AAB was produced.

---

## CODE BLOCKERS

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| PL-04 custom playlist reorder | HIGH (was) | **Fixed in code** | `PATCH /api/playlists/:id/tracks/reorder` + up/down controls |
| DB-06 remote orphan | HIGH (was) | **Fixed in code** | Compensating record + remote delete; leftover cleanup is `REMOTE_CLEANUP_REQUIRED` via internal key |
| Production localhost API fallback | CRITICAL (was) | **Fixed in code** | Production requires `https` `EXPO_PUBLIC_API_URL`; loopback throws |
| Anonymous isolation / deletion | HIGH (was partial) | **Fixed in code** | Recovery code, warnings, `DELETE /api/auth/account`, IDOR tests |

There are **no remaining CRITICAL or HIGH code defects** identified in this pass. Remaining work is configuration, credentials, devices, or legal.

---

## CONFIGURATION BLOCKERS

| ID | Severity | Item |
| --- | --- | --- |
| CFG-1 | CRITICAL | Set production `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL` (SSL), `API_PUBLIC_URL`, `CORS_ORIGINS`, OAuth redirect URIs |
| CFG-2 | CRITICAL | Set frontend `EXPO_PUBLIC_API_URL=https://YOUR_PRODUCTION_BACKEND_DOMAIN` (real origin, not the placeholder) before a store build |
| CFG-3 | HIGH | Optional `INTERNAL_CLEANUP_KEY` for remote playlist cleanup |
| CFG-4 | HIGH | EAS project link + production profile env substitution (placeholders are in `eas.json`) |

---

## EXTERNAL CREDENTIAL BLOCKERS

| ID | Severity | Item | Status |
| --- | --- | --- | --- |
| EXT-1 | CRITICAL | Spotify developer app + live OAuth | **NOT_CONFIGURED** |
| EXT-2 | CRITICAL | Google/YouTube OAuth + Data API | **NOT_CONFIGURED** |
| EXT-3 | HIGH | Amazon Music Web API approval | **BLOCKED** (closed beta) |
| EXT-4 | HIGH | LLM `AI_API_KEY` live generation | **BLOCKED** |

Do not mark OAuth or AI as PASS without real credentials and a manual run.

---

## DEVICE TESTING BLOCKERS

| ID | Severity | Item |
| --- | --- | --- |
| DEV-1 | HIGH | Android emulator/device UI, keyboard, back button, small/large screens |
| DEV-2 | HIGH | TalkBack |
| DEV-3 | MEDIUM | Offline / slow network on device |

See [android-qa-checklist.md](./android-qa-checklist.md). All rows **BLOCKED**.

---

## LEGAL / STORE BLOCKERS

| ID | Severity | Item |
| --- | --- | --- |
| LEG-1 | HIGH | Privacy policy URL after legal review (draft screen + inventory only) |
| LEG-2 | HIGH | Play Data Safety form (draft mapping only; developer must verify) |
| LEG-3 | HIGH | Terms of service legal review (placeholder screen) |
| LEG-4 | HIGH | EAS signing credentials (documented, not committed, not built) |

---

## MEDIUM / LOW (non-blocking for this classification)

- In-memory rate limit / idempotency is process-local (Redis needed for multi-instance)
- Prisma CLI / Expo Metro npm audit highs: no safe non-major fix ([dependency-audit.md](./dependency-audit.md))
- `npm run lint` aliases TypeScript; ESLint is not configured
- After the 2s settle window, a second **intentional** create of the same local name is allowed

---

READY FOR ANDROID BUILD requires: no critical/high **code** blockers (met), **and** production API configuration ready (CFG-2 not met), **and** required build configuration (EAS secrets — CFG-4), **and** required security checks for a store binary (OAuth still unproven). Therefore: **NOT READY FOR ANDROID BUILD**.

## Verification run (this branch)

| Check | Result |
| --- | --- |
| `npm test` | **PASS** — backend 209, frontend 21 (230 total, 0 fail) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** as TypeScript only (no ESLint config; not reported as ESLint) |
| `npx prisma validate` | **PASS** |
| `npm audit` | **FAIL** for high Prisma CLI / Expo Metro advisories — documented, no force upgrade |
| Live OAuth / AI / Android device | **BLOCKED** |
