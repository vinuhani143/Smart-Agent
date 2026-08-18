# Production PostgreSQL

Do **not** run destructive migrations automatically. Use `npx prisma migrate deploy` against a backup-capable production database.

| Topic | Requirement |
| --- | --- |
| Engine | PostgreSQL (Prisma datasource) |
| URL | `DATABASE_URL` with TLS: `sslmode=require` or `sslmode=verify-full` |
| Localhost | Forbidden in production startup |
| Migrations | Deterministic SQL under `prisma/migrations/`. Apply forward-only with `migrate deploy`. |
| Pooling | Prefer a pooler (PgBouncer transaction mode) or `connection_limit` on the URL. Prisma opens a small process pool; size it to the host. Example query param: `connection_limit=5`. |
| Backups | Operator responsibility (snapshots / PITR on the host). Not implemented inside the app. |
| Errors | Unhandled DB errors map to a generic 500. Prisma `errorFormat` is `minimal` in production. Secrets are not returned. |
| Sensitive columns | OAuth tokens are application-encrypted. List/session endpoints do not return `accessToken` / `refreshToken`. |

Schema changes that drop data must be reviewed by a human before apply.
