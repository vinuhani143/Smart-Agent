# Android QA checklist

All device/emulator rows are **BLOCKED** until a physical device or emulator is available. Do not mark PASS without running them.

| Area | Checks | Status |
| --- | --- | --- |
| Login / session | First launch session, recovery code shown, warning visible | BLOCKED |
| OAuth redirect | Spotify and YouTube return to `musicmix://auth/callback` | BLOCKED |
| Home | Cards, connect status, no clipped text | BLOCKED |
| Search | Debounce, Unicode, empty, error | BLOCKED |
| AI Playlist | 503 when unconfigured; confirm before create | BLOCKED |
| Custom playlist | Create, add, remove, rename, **reorder up/down** | BLOCKED |
| Conversion | Review low-confidence; create once | BLOCKED |
| Settings | Disconnect, delete account, legal drafts, dark mode | BLOCKED |
| Dark mode | Light/dark/system | BLOCKED |
| Keyboard | Search and create forms, IME insets | BLOCKED |
| Back button | Onboarding, playlist detail, convert | BLOCKED |
| Small / large screen | Portrait, reachability | BLOCKED |
| Accessibility / TalkBack | Labels, 44pt targets, not color-only | BLOCKED (static labels present; TalkBack not run) |
| Offline / slow network | Error copy, no crash, no duplicate create | BLOCKED |
