# Versioning

Keep the first Play upload at:

| Field | Value |
| --- | --- |
| `version` (Expo / user-visible) | `1.0.0` |
| `android.versionCode` | `1` |
| Android package | `com.musicmix.app` |

Do not auto-increment `versionCode` in CI unless a human sets it for that release.

## Later releases

1. Increase `android.versionCode` by **at least 1** for every Play Store artifact (APK or AAB). Google requires a strictly higher versionCode.
2. Increase `version` (semver) when the user-visible release changes: patch for fixes, minor for features, major for incompatible changes.
3. Keep `version` and `versionCode` in `frontend/app.config.ts` in sync with the store listing.

Example: 1.0.1 user version with versionCode 2.
