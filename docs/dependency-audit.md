# Dependency audit (STEP 9.5)

Date: 2026-08-18  
Commands: `npm audit --omit=dev` and `npm audit` in `backend/` and `frontend/`.

No `npm audit fix --force` was applied. Force upgrades would move Prisma or Expo across major lines. `npm audit fix --dry-run` in the frontend did not remove the high issues.

## Backend (`npm audit --omit=dev`)

| Package | Version / range | Severity | Affected component | Exploitability in MusicMix | Available fix | Major upgrade? |
| --- | --- | --- | --- | --- | --- | --- |
| `deepmerge-ts` | &lt;8.0.0 via `@prisma/config` / `prisma` CLI | high ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)) | Prisma CLI config merge | CLI-time stack exhaustion if a recursive object is merged during CLI use. Not on the Express request path. | `npm audit fix --force` installs Prisma **6.12.0** (breaking vs current 6.16.x) | Yes (Prisma CLI graph) |
| `effect` | &lt;3.20 via `@prisma/config` | high ([GHSA-38f7-945m-qr2g](https://github.com/advisories/GHSA-38f7-945m-qr2g)) | Prisma CLI Effect fibers | Same: CLI, not Express runtime | Same force path | Yes |

Runtime API dependencies (`express`, `jsonwebtoken`, `@prisma/client` query engine) did not report additional production highs in this omit-dev scan.

## Frontend (`npm audit --omit=dev`)

| Package | Version / range | Severity | Affected component | Exploitability in MusicMix | Available fix | Major upgrade? |
| --- | --- | --- | --- | --- | --- | --- |
| `image-size` | `*` via Metro / Expo | high ([GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)) | Metro bundler / Expo CLI image metadata | Build-time / bundler. MusicMix does not parse untrusted ICNS/JXL/HEIF uploads on the API. | `npm audit fix --force` would install **Expo 53** (project is Expo 57) | Yes (Expo major) |
| `uuid` | &lt;11.1.1 via `@expo/config-plugins` / xcode | moderate ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)) | Expo prebuild / iOS project generation | Native project generation, not the production API | Same Expo force path | Yes |

## Decision

- **No compatible non-major fix** was applied.
- Track Prisma CLI and Expo/Metro advisories on the next planned framework upgrade.
- Production API image uploads are not part of this app; Metro issues are developer-machine / CI bundling risk.

Re-run `npm audit` after any dependency change. This file is not a claim that the tree is vulnerability-free.
