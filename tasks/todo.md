# Todo: Wamye Livreur Android — v1

Source: `tasks/plan.md` (implements `SPEC.md`). Static gates = `npm run lint`
&& `npx tsc --noEmit` && `npm run build`.

## Phase 1 — Foundation

- [ ] **T1 — Walking skeleton: dashboard inside an APK**
  - Status: code landed + debug APK builds (3.9 MB); static gates green
    (3 pre-existing lint errors on HEAD, untouched). Remaining: install on a
    phone and verify device-matrix row 1 (login persistence) + a Realtime
    event. `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
  - Acceptance: APK opens live `/dashboard` (→ `/login` signed out); session
    survives app restart; Realtime works; `.dockerignore` excludes `android/`;
    keystore patterns in `.gitignore`; web untouched.
  - Verify: static gates; `npx cap sync android && cd android && ./gradlew
    assembleDebug`; device matrix row 1.
  - Files: `package.json`, `capacitor.config.ts`, `android/*`, `.gitignore`,
    `.dockerignore`

## Phase 2 — Native GPS

- [ ] **T2 — Native position source, foreground parity** (needs T1)
  - Status: code landed; plugin is `@capgo/background-geolocation` 8.3.2
    (community plugin stale for Capacitor 8 — swap approved). Gates green;
    plugin confined to one lazy chunk; APK rebuilds with the plugin and the
    merged manifest carries FINE/COARSE + FOREGROUND_SERVICE_LOCATION +
    POST_NOTIFICATIONS (no ACCESS_BACKGROUND_LOCATION). NB: there was no
    "foreground-only" banner to suppress — the three gps* strings are
    platform-neutral, so none changed. Remaining: device rows 2 & 5.
  - Acceptance: `isNativeApp()` guard + dynamic plugin import;
    `useDriverPosition` in `driver-board.tsx`; browsers byte-identical;
    native permission prompt + `denied` parity; banner suppressed on native
    via UA, server-side.
  - Verify: static gates; plugin absent from `.next/static`; device matrix
    rows 2 & 5; Chrome regression pass.
  - Files: `src/lib/native/platform.ts`,
    `src/lib/native/background-position.ts`,
    `src/lib/hooks/use-driver-position.ts`,
    `src/components/driver/driver-board.tsx`, messages

- [ ] **T3 — Background service during a course** (needs T2)
  - Status: code landed. Watcher restarts on course start/end; with a course
    it carries gpsNotifBody (fr + ar-TN) which raises the foreground service;
    without, it drops back to foreground-only. No manifest edits needed
    (plugin merge already granted everything) and no APK rebuild — behavior
    ships with the next web deploy. Remaining: deploy, then device rows
    3, 4, 6 (screen-off course, service teardown, battery saver notes).
  - Acceptance: course start → French persistent notification, screen-off
    fixes every ~15 s into `driver_positions`; course end → service +
    notification gone; no service when idle; battery-saver behavior noted.
  - Verify: static gates; `adb logcat -s Capacitor BackgroundGeolocation`;
    device matrix rows 3, 4, 6; SQL check on fix timestamps.
  - Files: `src/lib/native/background-position.ts`,
    `src/lib/hooks/use-driver-position.ts`,
    `android/app/src/main/AndroidManifest.xml`, messages

### Checkpoint A (after T1–T3)
- [ ] Static gates green; web regression pass (desktop Chrome + Chrome PWA)
- [ ] Spec success criteria 3 & 4 demonstrated on a real course
- [ ] Human review before Phase 3

## Phase 3 — Distribution (T4/T5 parallel with Phase 2 after T1)

- [ ] **T4 — `/telecharger` page + APK in public Supabase bucket** (needs T1;
  bucket creation is ask-first)
  - Acceptance: direct `.apk` link from public `apk` bucket downloads on
    Android; QR + French copy; new APK upload needs no redeploy.
  - Verify: static gates; install from the page on a phone.
  - Files: `src/app/(app)/telecharger/page.tsx`, messages

- [ ] **T5 — Minimum-version gate** (needs T1)
  - Acceptance: UA `WamyeLivreur/<code>` parsed server-side; banner only in
    an outdated shell, links to `/telecharger`; env absent → inert.
  - Verify: static gates; UA spoof in devtools; confirm on phone.
  - Files: `src/lib/native/shell-version.ts`,
    `src/app/(app)/dashboard/layout.tsx`, messages

- [ ] **T6 — Signed release + `docs/android.md` runbook** (needs T1–T5)
  - Acceptance: signed release APK installs via `/telecharger`; no secrets
    in git; runbook covers clean-clone build → sign → upload → version bump.
  - Verify: `./gradlew assembleRelease`; full device matrix on the release
    build.
  - Files: `android/app/build.gradle`, `.gitignore`, `docs/android.md`

### Checkpoint B — done
- [ ] All six SPEC.md success criteria verified
- [ ] Final web regression pass on the deployed site
- [ ] SPEC.md updated (status, v2 leftovers: FCM, availability-time service,
  Play Store)
