# Android signing (EAS) — do not build in this step

Do **not** run `eas build --platform android --profile production` yet. Do **not** commit keystores.

| Field | Value |
| --- | --- |
| Application label | Expo `name`: **MusicMix** (no separate `android.label` field) |
| Package | `com.musicmix.app` |
| version | `1.0.0` |
| versionCode | `1` |

## Profiles (`frontend/eas.json`)

| Profile | Output | Distribution | `EXPO_PUBLIC_API_URL` |
| --- | --- | --- | --- |
| development | APK + dev client | internal | Explicit `http://127.0.0.1:4000` |
| preview | APK | internal testers | Placeholder HTTPS until CFG-2 |
| production | AAB (`app-bundle`) | Play | Placeholder HTTPS until CFG-2 |

Backend secrets must **never** appear in `eas.json` or the mobile bundle. Set `EXPO_PUBLIC_API_URL` in EAS Environment (production/preview) when the real domain exists. Use EAS Secrets / env for that public URL only — not `DATABASE_URL`, JWT, token encryption, OAuth client secrets, AI keys, or `INTERNAL_CLEANUP_KEY`.

```bash
cd frontend
npx eas-cli login
npx eas-cli init
npx eas-cli credentials
```

Commands **not** run in STEP 10:

```bash
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```
