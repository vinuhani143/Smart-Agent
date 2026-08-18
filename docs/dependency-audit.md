# Dependency audit (STEP 10)

Date: 2026-08-18  
Commands: `npm audit --omit=dev` in `backend/` and `frontend/`. No `npm audit fix --force`.

## Backend

| Package | Severity | Affected component | Production impact | Safe upgrade |
| --- | --- | --- | --- | --- |
| `deepmerge-ts` &lt;8 via Prisma CLI | high | Prisma CLI config merge | CLI-time, not Express runtime | Force to Prisma 6.12 — **major / breaking vs 6.16** |
| `effect` &lt;3.20 via Prisma CLI | high | Prisma CLI fibers | CLI-time | Same Prisma force path |

## Frontend

| Package | Severity | Affected component | Production impact | Safe upgrade |
| --- | --- | --- | --- | --- |
| `image-size` via Metro/Expo | high | Bundler image parsers | Build-time DoS on untrusted images; API does not parse ICNS/JXL | Force path would install **React Native 0.72 or Expo 53** — breaking vs current Expo 57 / RN 0.86 |
| `uuid` &lt;11.1.1 via config-plugins | moderate | Expo prebuild / xcode | Native project generation | Same Expo force path |

**Decision:** unresolved highs documented. No compatible non-major fix. Status: **WARNING**.
