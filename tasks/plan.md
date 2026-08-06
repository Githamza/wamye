# Implementation Plan: Wamye Livreur — Android (Capacitor + native GPS)

Implements `SPEC.md` (2026-08-06), including the resolved open questions:
keep the web loop and add the service on top, a `/telecharger` page with a
direct APK link, a minimum-version check in v1, and the shell opens on
`/dashboard` (which `src/proxy.ts` already bounces to `/login` when signed
out) — never the marketing home.

## Overview

Six tasks in three phases. Phase 1 proves the load-bearing assumption (the
Supabase cookie session inside the Capacitor WebView) with a walking
skeleton APK. Phase 2 delivers the headline feature: native GPS that keeps
posting through `/api/driver/position` during a course with the screen off.
Phase 3 ships distribution — download page, version gate, signed release,
runbook.

## Architecture Decisions

- **Shell start URL is `https://wamye.mylabs.live/dashboard`** (`server.url`
  accepts a path). Signed-out users land on `/login` via the existing proxy
  redirect; nobody sees the marketing home in the app. If Capacitor rejects
  the path form, fall back to origin-only `server.url` plus a UA-based
  redirect in `proxy.ts` (see next point — the UA is there anyway).
- **The shell identifies itself via User-Agent**:
  `appendUserAgent: "WamyeLivreur/<versionCode>"`. This gives (a) server-side
  native detection — SSR can hide the "foreground-only" banner without a
  hydration flash — and (b) the version-gate input, with zero native code
  beyond the config line.
- **One geolocation plugin for both native modes.**
  `@capacitor-community/background-geolocation`'s watcher runs
  foreground-only when `backgroundMessage` is omitted and starts the
  foreground service when it is provided. So: idle → watcher without
  `backgroundMessage` (parity with today), active course → watcher with it
  (the persistent notification + screen-off tracking). No second plugin, no
  native Java to write.
- **Platform split lives in `src/lib/native/`** behind `isNativeApp()`;
  native plugin modules load via dynamic `import()` only when that guard
  passes, so browser bundles and SSR never touch plugin code. The web hook
  `use-foreground-position.ts` is not modified — a new `use-driver-position.ts`
  delegates to it or to the native source.
- **APK hosted in a public Supabase Storage bucket** (`apk/wamye-livreur.apk`),
  not in the repo (no binary bloat, and the GitHub repo is private so release
  assets wouldn't be publicly downloadable) and not in `public/` (an APK
  update should not require a redeploy). `/telecharger` links to the bucket
  URL. *Flagging per boundaries: this creates one public storage bucket —
  approve in review.*
- **`android/` is committed; the Docker build must not see it.** Add
  `android/` (and `capacitor.config.ts`) to `.dockerignore` so the Coolify
  image and its build context stay unchanged.

## Dependency Graph

```
T1 shell skeleton (deps, config, android/, session proof)
    │
    ├── T2 native position source, foreground parity  ──► T3 background service during course
    │
    ├── T4 /telecharger page + APK bucket   (independent of T2/T3)
    └── T5 version gate via User-Agent      (independent of T2/T3)
                                    T6 release signing + runbook ◄─ needs T1–T5 merged
```

T4 and T5 can proceed in parallel with T2/T3 once T1 lands.

---

## Task 1: Walking skeleton — the dashboard runs inside an APK

**Description:** Add Capacitor to the repo, generate the committed `android/`
project, point the WebView at the live `/dashboard`, and prove on a real
phone that login + session persistence + Realtime behave exactly as in
Chrome. This is the fail-fast task for spec assumptions 1 and 2.

**Acceptance criteria:**
- [ ] `capacitor.config.ts`: appId `live.mylabs.wamye`, appName "Wamye
      Livreur", `server.url` → live `/dashboard`, `appendUserAgent:
      "WamyeLivreur/1"`.
- [ ] Debug APK installs; app opens on `/login` when signed out, `/dashboard`
      when signed in; session survives app kill + restart.
- [ ] Realtime feed updates while the app is open (bridge + cookies proven).
- [ ] Web untouched: static gates pass; `.dockerignore` excludes `android/`;
      keystore patterns in `.gitignore` before any keystore exists.

**Verification:**
- [ ] `npm run lint && npx tsc --noEmit && npm run build`
- [ ] `npx cap sync android && cd android && ./gradlew assembleDebug`
- [ ] Manual: device matrix row 1 (login persistence) + a Realtime event
      (create a test course, see it appear).

**Dependencies:** None
**Files likely touched:** `package.json`, `capacitor.config.ts`, `android/*`
(generated), `.gitignore`, `.dockerignore`
**Estimated scope:** M (mostly generated files; hand-written changes are small)

## Task 2: Native position source with foreground parity

**Description:** Introduce the platform guard and the hook indirection. On
native, positions come from the background-geolocation plugin running in
foreground-only mode (no `backgroundMessage`, no service yet), mapped into
the same state shape and the same 15 s POST to `/api/driver/position`. In
browsers, `use-driver-position` delegates to the untouched web hook —
zero behavior change.

**Acceptance criteria:**
- [ ] `src/lib/native/platform.ts` (`isNativeApp()`) and
      `src/lib/native/background-position.ts` (start/stop watcher, fix →
      POST payload) exist; plugin code is dynamically imported and absent
      from browser bundles.
- [ ] `driver-board.tsx` uses `useDriverPosition`; in Chrome the sharing
      banner and loop behave exactly as before.
- [ ] On the phone: Android location permission prompt appears once; with
      app open and no course, `profiles.last_*` refreshes; denying
      permission produces the same `denied` UI as the web.
- [ ] The "foreground-only" banner is suppressed when the UA says native
      (server-side, via the appended UA — no hydration flash).

**Verification:**
- [ ] Static gates; check browser bundle for plugin absence
      (`grep -r background-geolocation .next/static` after build).
- [ ] Manual: device matrix rows 2 and 5; web regression pass in Chrome.

**Dependencies:** T1
**Files likely touched:** `src/lib/native/platform.ts`,
`src/lib/native/background-position.ts`,
`src/lib/hooks/use-driver-position.ts`,
`src/components/driver/driver-board.tsx`, (+ messages file for banner copy)
**Estimated scope:** M

## Task 3: Background tracking during an active course

**Description:** The headline. When `orderId` becomes non-null, restart the
watcher with a French `backgroundMessage` — the plugin raises the Android
foreground service and its persistent notification, and fixes keep flowing
with the screen off. When the course ends, drop back to the foreground-only
watcher and the notification disappears. Native path skips the web wake-lock
(the service replaces it). Manifest gains the plugin's required permissions.

**Acceptance criteria:**
- [ ] Accepting a course → persistent notification (French copy) within
      seconds; delivering/cancelling → notification gone, service stopped.
- [ ] Screen off 10+ min in real movement → `driver_positions` rows keep
      arriving at ~15 s intervals; customer tracking map follows.
- [ ] No service and no notification when there is no active course.
- [ ] Battery-saver behavior observed and noted in `docs/android.md` draft.

**Verification:**
- [ ] Static gates; `adb logcat -s Capacitor BackgroundGeolocation` shows
      watcher upgrades/downgrades on course start/end.
- [ ] Manual: device matrix rows 3, 4, 6; SQL check on `driver_positions`
      timestamps for the screen-off window.

**Dependencies:** T2
**Files likely touched:** `src/lib/native/background-position.ts`,
`src/lib/hooks/use-driver-position.ts`,
`android/app/src/main/AndroidManifest.xml`, messages file
**Estimated scope:** M

### Checkpoint A — after T1–T3 (the product moment)
- [ ] All static gates green; web regression pass (desktop Chrome + Chrome
      PWA on Android).
- [ ] Spec success criteria 3 and 4 demonstrated on a real course.
- [ ] Human review before the distribution phase.

## Task 4: `/telecharger` page + APK hosting

**Description:** A public page with a short French explanation, a direct
download link to the APK in a public Supabase Storage bucket, and a QR code
(the `qrcode` dep is already in the repo). Linked from the dashboard so you
can send drivers one URL.

**Acceptance criteria:**
- [ ] `apk` bucket exists (public, this one object); page links straight to
      the `.apk` (correct `content-type`, downloads on tap in Android Chrome).
- [ ] Page renders QR + link at `/telecharger`, in French, mobile-first.
- [ ] Uploading a new APK to the bucket changes what drivers download with
      no redeploy.

**Verification:**
- [ ] Static gates; manual download on a phone installs the app.

**Dependencies:** T1 (an APK to host); parallel with T2/T3
**Files likely touched:** `src/app/(app)/telecharger/page.tsx`, messages
file, (Supabase bucket via MCP/dashboard — ask-first item)
**Estimated scope:** S

## Task 5: Minimum-version gate

**Description:** The web code always ships latest, but the native shell only
changes with a new APK. The shell already announces
`WamyeLivreur/<versionCode>` in its UA (T1). The dashboard layout reads the
UA server-side and, when the code is below `ANDROID_MIN_VERSION` (runtime
env var, so raising it needs no rebuild — restart only, per the Coolify
gotcha), renders a persistent banner linking to `/telecharger`.

**Acceptance criteria:**
- [ ] Version parsed from UA server-side; no banner in browsers or when the
      shell is current.
- [ ] With `ANDROID_MIN_VERSION` above the installed code, the banner
      appears in the app and links to `/telecharger`.
- [ ] Env var absent → gate inert (safe default).

**Verification:**
- [ ] Static gates; manual: spoof the UA in desktop Chrome devtools to see
      both states, then confirm on the phone.

**Dependencies:** T1; parallel with T2/T3/T4
**Files likely touched:** `src/lib/native/shell-version.ts` (UA parse),
`src/app/(app)/dashboard/layout.tsx`, messages file
**Estimated scope:** S

## Task 6: Signed release + runbook

**Description:** Generate the release keystore (kept out of git), wire
signing into Gradle via untracked properties, bump `versionCode`, build the
release APK, upload it to the bucket, and write `docs/android.md`: clean-
clone build steps, signing, upload, and the release checklist (bump
versionCode → build → upload → raise `ANDROID_MIN_VERSION` if forcing).

**Acceptance criteria:**
- [ ] Release APK installs over the debug one on a stock phone from the
      `/telecharger` link; login works.
- [ ] `git status` clean of keystore/passwords; patterns in `.gitignore`.
- [ ] `docs/android.md` is sufficient to rebuild and re-sign from a clean
      clone (spec success criterion 6).

**Verification:**
- [ ] `cd android && ./gradlew assembleRelease`; install via `/telecharger`.
- [ ] Full device matrix rerun on the release build.

**Dependencies:** T1–T5
**Files likely touched:** `android/app/build.gradle`, `.gitignore`,
`docs/android.md`
**Estimated scope:** S

### Checkpoint B — done
- [ ] All six spec success criteria verified.
- [ ] Web regression pass one last time on the deployed site.
- [ ] SPEC.md status flipped to shipped; leftovers (FCM, availability-time
      service, Play Store) recorded as v2 notes in the spec.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cookie session or Capacitor bridge doesn't work against the remote URL | High — invalidates the approach | T1 is exactly this proof, before any feature work |
| `server.url` with a path unsupported | Low | Fallback ready: origin URL + UA-based redirect in `proxy.ts` |
| OEM battery killers (Xiaomi/Oppo) stop the service anyway | Medium | Device-matrix row 6; document per-OEM "don't optimize" steps in `docs/android.md`; the notification makes dead tracking visible to the driver |
| Community plugin unmaintained / Capacitor 7 incompatibility | Medium | Check plugin's Capacitor 7 support at T2 start; fallback is `@capgo/background-geolocation` (same API family) — an ask-first dependency swap |
| `driver-board` regression breaks live drivers | High | Hook indirection leaves `use-foreground-position.ts` untouched; web regression pass at every checkpoint |
| APK in a public bucket is downloadable by anyone | Low | It's a client app talking to an authenticated API — same exposure as the public web app |

## Open Questions

- Supabase public `apk` bucket: approve creating it (ask-first boundary).
- `ANDROID_MIN_VERSION` as runtime env on Coolify: confirm you're happy the
  gate needs a container restart when raised.
