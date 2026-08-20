# Deploy the MusicMix API on Render

Do **not** commit secrets. Do **not** use `prisma migrate dev` on Render. This guide uses placeholders only.

Public HTTPS origin (replace after the service exists):

`https://YOUR-RENDER-SERVICE.onrender.com`

## 1. Create a Render Web Service

1. Open the Render dashboard and create a **Web Service**.
2. Connect the GitHub repository that contains this project.
3. Select the branch you want to deploy (do not deploy automatically from this STEP unless you enable it in Render).

## 2. Repository settings

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Runtime | Node |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm run prisma:deploy && npm start` |
| Health check path | `/api/health` |

`--include=dev` is required at **build** time so TypeScript can compile. The start command is `node dist/server.js` (via `npm start`).

Equivalent scripts inside `backend/package.json`:

| Step | Command |
| --- | --- |
| Install | `npm install` |
| Build | `npm run build` (`prisma generate` then `tsc`) |
| Migrate | `npx prisma migrate deploy --schema ../prisma/schema.prisma` (`npm run prisma:deploy`) |
| Start | `npm start` (`node dist/server.js`) |

The process listens on `process.env.PORT` and binds `0.0.0.0`.

A `render.yaml` Blueprint at the repo root encodes the same web service + Postgres. You can apply it from Render → New → Blueprint, then fill `sync: false` env vars in the dashboard.

## 3. PostgreSQL

Create a Render PostgreSQL instance (or use the `musicmix-db` database from the Blueprint).

Set `DATABASE_URL` to the Render **internal** connection string when the API and database are in the same region. If the URL has no TLS parameter, the API appends `sslmode=require` in production (the URL is never logged).

Run migrations with **deploy**, not **dev**:

```bash
npx prisma migrate deploy --schema ../prisma/schema.prisma
```

The start command already runs `npm run prisma:deploy` before `npm start`.

## 4. Environment variables

Set these in the Render Web Service dashboard. **Do not put real secrets in git.** Values below are placeholders only.

**Required (startup fails without them):**

```bash
NODE_ENV=production
JWT_SECRET=<random secret 1>
TOKEN_ENCRYPTION_KEY=<random secret 2>
DATABASE_URL=<your Render PostgreSQL connection string>
API_PUBLIC_URL=https://YOUR-RENDER-SERVICE.onrender.com
CORS_ALLOWED_ORIGINS=<your required origin>
```

| Variable | Placeholder | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Required |
| `JWT_SECRET` | `<random secret 1>` | At least 32 characters. Generate: `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY` | `<random secret 2>` | 64 hex characters. Generate: `openssl rand -hex 32` |
| `DATABASE_URL` | `<your Render PostgreSQL connection string>` | Internal URL when API and DB share a region. TLS required / appended. Never log this value. |
| `API_PUBLIC_URL` | `https://YOUR-RENDER-SERVICE.onrender.com` | HTTPS, no trailing slash, no localhost |
| `CORS_ALLOWED_ORIGINS` | `<your required origin>` | Comma-separated HTTPS web origins, or empty for native-only. Never `*` |

**Recommended:**

| Variable | Notes |
| --- | --- |
| `APP_DEEP_LINK` | `musicmix://auth/callback` |
| `DEBUG_ERRORS` | `false` |
| `INTERNAL_CLEANUP_KEY` | Operator cleanup header |

**Optional (features stay unavailable until set):**

| Variable | Notes |
| --- | --- |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REDIRECT_URI` | Redirect: `https://YOUR-RENDER-SERVICE.onrender.com/api/auth/spotify/callback` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Redirect: `https://YOUR-RENDER-SERVICE.onrender.com/api/auth/google/callback` |
| `YOUTUBE_API_KEY` | Optional search key |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` | Backend only. Missing → 503 `AI_UNAVAILABLE` |
| `AMAZON_MUSIC_ENABLED` | Keep `false` unless Amazon approved access |
| Amazon LWA vars | Only if Amazon is enabled |

Render sets `PORT`. Do not hardcode `4000`.

## 5. Health check

`GET /api/health`

- **200** when the process is up **and** PostgreSQL answers `SELECT 1`
- **503** when the database is unreachable
- Body includes `ok`, `database`, `application`, and provider **configured / not_configured** flags
- Does **not** include `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, OAuth secrets, AI keys, or tokens

## 6. HTTPS URL and CORS

After the first deploy, copy the Render URL:

`https://YOUR-RENDER-SERVICE.onrender.com`

Set `API_PUBLIC_URL` to that origin. Register the same origin in Spotify/Google redirect URIs.

OAuth callbacks are **server redirects** to `musicmix://auth/callback`. They do not depend on CORS.

Native Android uses `EXPO_PUBLIC_API_URL` (not CORS). Set CORS only if you also serve a web origin. Never `*`.

## 7. Frontend

The app reads **`EXPO_PUBLIC_API_URL`**. It is not hardcoded to localhost in production; production builds reject loopback and require `https://`.

After Render is live, set the EAS/preview/production public URL to:

`EXPO_PUBLIC_API_URL=https://YOUR-RENDER-SERVICE.onrender.com`

Do not put `DATABASE_URL`, JWT, encryption keys, or OAuth client secrets in `EXPO_PUBLIC_*`.

## 8. Verify (after you deploy — not done in this STEP)

```bash
curl -sS https://YOUR-RENDER-SERVICE.onrender.com/api/health
```

Expect HTTP 200 and `"ok": true` when the database is up.
