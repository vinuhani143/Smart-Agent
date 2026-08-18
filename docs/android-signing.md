# Android signing (EAS) — do not build yet

Do **not** run a production APK/AAB in this step. Do **not** commit keystores or credentials.

Package identifier already in `frontend/app.config.ts`: `com.musicmix.app`. Version `1.0.0`, `android.versionCode` `1`.

## EAS login and project

```bash
cd frontend
npx eas-cli login
npx eas-cli init
```

Link the Expo project. Do not invent a second Android package name if `com.musicmix.app` is already registered.

## Credentials / keystore

```bash
npx eas-cli credentials
```

Use EAS-managed credentials or upload an existing keystore. Keep the keystore password in a secret manager, not git.

## Profiles (`frontend/eas.json`)

| Profile | Output | `EXPO_PUBLIC_API_URL` |
| --- | --- | --- |
| development | Dev client | Explicit `http://127.0.0.1:4000` |
| preview | APK (internal) | Placeholder `https://YOUR_PRODUCTION_BACKEND_DOMAIN` |
| production | AAB | Placeholder `https://YOUR_PRODUCTION_BACKEND_DOMAIN` |

Replace the HTTPS placeholder with the real API origin before a store build. Production builds **fail** if the URL is missing or loopback.

## Commands (do not run for this release-blocker step)

```bash
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

APK is for internal testing. Play Store production uses AAB (`app-bundle`).
