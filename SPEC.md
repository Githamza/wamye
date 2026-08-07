# Spec: Wamye Livreur — Android (Capacitor wrapper with native GPS)

Status: **v1 code complete (2026-08-07)** — all six tasks landed; remaining
before "shipped": user-run APK upload (`scripts/publish-apk.sh`), the
on-device matrix, and a real-course demo. See `tasks/todo.md`.
Date: 2026-08-06

**v2 backlog:** FCM native push (new-order alerts with the app closed);
foreground service while merely available (stale `profiles.last_*`);
Play Store release (needs the `ACCESS_BACKGROUND_LOCATION`-free story we
kept, plus listing + review).

## Objective

Ship an Android app for drivers that is the existing `/dashboard` driver PWA
wrapped in a Capacitor WebView, plus one native capability the PWA cannot have:
**GPS keeps flowing while a course is active, even with the screen off or the
app in the background**, via an Android foreground service.

- **User:** the Wamye driver (livreur). Customers and merchants stay on the web.
- **Why now:** `use-foreground-position.ts` is honest about the PWA's limit —
  tracking stops the moment the tab is hidden. During a real course the phone
  is in a pocket or a mount with navigation open, so the customer's map goes
  stale and `profiles.last_*` expires (which the dispatch radius then treats
  as "position unknown — notify anyway").
- **Success looks like:** a driver on the Android app delivers a course with
  the screen off, and `driver_positions` rows keep landing every ~15 s the
  whole way. Meanwhile a driver on the web PWA notices zero change.

### Explicitly in scope
- Capacitor Android project in this repo, loading the **live site**
  (`https://wamye.mylabs.live`) — every web deploy updates the app instantly.
- Native background geolocation during an **active course** (foreground
  service with a persistent notification, as Android requires).
- Native geolocation (foreground) as the position source whenever the app
  runs natively, replacing `navigator.geolocation` there.
- Signed APK, distributed by direct link/QR (sideload). Project structured so
  a Play Store release stays possible later.
- A public `/telecharger` page with a direct link to the APK.
- A minimum-version check: the server can tell an outdated native shell to
  show an "update the app" banner linking to `/telecharger`.
- The shell opens on `/dashboard` (bounced to `/login` when signed out by
  `src/proxy.ts`) — drivers never see the marketing home page.

### Explicitly out of scope (v1)
- FCM / native push. New-order alerts inside the Android app arrive only via
  Supabase Realtime while the app is open. (Known limitation: web push does
  not fire inside a Capacitor WebView; drivers who also keep the Chrome PWA
  installed still get web pushes there. FCM is the designated v2 item.)
- iOS.
- Always-on tracking with no course (revisit with the Play release, since it
  triggers the `ACCESS_BACKGROUND_LOCATION` review).
- Play Store submission itself.

## Assumptions

1. The Supabase cookie session works unchanged inside the Capacitor WebView,
   because the WebView loads the real origin (`server.url`) — login flow,
   RLS-authenticated Realtime, and `/api/driver/position` all behave as in
   Chrome. *(Verify in the first task; this is the load-bearing assumption.)*
2. Capacitor's bridge injects into remotely-loaded pages when `server.url`
   is set, so `@capacitor/core` plugins are callable from the deployed site's
   JS. The web bundle ships the (small) bridge-detection code to browsers too,
   where `Capacitor.isNativePlatform()` is simply `false`.
3. `@capacitor-community/background-geolocation` (foreground-service based)
   is the background plugin. Its service keeps the WebView's JS alive, so the
   existing POST loop keeps running — positions still go through
   `/api/driver/position` with the session cookie; **no new API surface**.
4. The `android/` directory is committed to the repo (standard Capacitor
   practice), so web and Android live in the same codebase and history.
5. min SDK per Capacitor default (currently API 23+); drivers' phones are
   ordinary recent Androids.

→ Correct any of these now; otherwise the plan proceeds on them.

## Tech Stack

- Next.js 16.2 (App Router, `output: "standalone"`, next-intl) — unchanged.
- Supabase (auth cookies, Realtime, RLS) — unchanged.
- **New:** Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`),
  `@capacitor-community/background-geolocation`.
- Android toolchain: Android Studio / SDK, JDK 21, Gradle (generated project).

## Commands

```bash
# Web (unchanged)
npm run dev            # local dev server
npm run build          # production build (also what Coolify runs)
npm run lint           # eslint
npx tsc --noEmit       # type check

# Android
npx cap sync android                     # copy config + plugin registry into android/
cd android && ./gradlew assembleDebug    # debug APK → android/app/build/outputs/apk/debug/
cd android && ./gradlew assembleRelease  # signed release APK (keystore via env/gradle props)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -s Capacitor BackgroundGeolocation   # native-side debugging
```

## Project Structure

```
capacitor.config.ts        → NEW: appId (e.g. live.mylabs.wamye), server.url,
                             plugin config (notification text in French)
android/                   → NEW: generated native project, committed.
                             Hand-edits limited to AndroidManifest.xml
                             (permissions), icons, signing config.
src/lib/native/            → NEW: the only place that imports @capacitor/*
  platform.ts              →   isNativeApp() guard (false in browsers)
  background-position.ts   →   start/stop the background watcher, mapping its
                               fixes to the same POST payload as the web loop
src/lib/hooks/
  use-foreground-position.ts → becomes the web branch of…
  use-driver-position.ts     → NEW: picks native watcher when isNativeApp(),
                               existing web watcher otherwise; same return type
src/app/(app)/dashboard/   → swap hook import; hide the "foreground-only"
                             banner on native; no other UI change
docs/android.md            → NEW: build/signing/distribution runbook
```

The rest of the repo is untouched. There is no separate Android codebase to
develop against — the WebView renders whatever `main` deploys.

## Code Style

Match the existing repo voice: comments state constraints, not narration;
French for driver-facing strings via next-intl. The platform split stays at
the edges — one guard module, never `Capacitor` imports scattered in
components:

```ts
// src/lib/native/platform.ts
import { Capacitor } from "@capacitor/core";

/**
 * True only inside the Android shell. Everywhere else — browsers, the
 * installed PWA, SSR — this is false, and no other native module may load.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
```

Native modules are imported dynamically behind that guard so the browser
bundle never pulls plugin code it cannot use.

## Testing Strategy

The repo has no test runner (no `test` script); v1 keeps it that way and
relies on gates that already exist plus a device matrix:

- **Static gates (every commit):** `npm run lint`, `npx tsc --noEmit`,
  `npm run build` — proves the web app still builds with Capacitor deps in.
- **Web regression (manual, once per phase):** `/dashboard` in desktop Chrome
  and the installed Android Chrome PWA — position banner, sharing loop, and
  Realtime feed behave exactly as before.
- **Device matrix (manual, on a real phone — emulators lie about GPS/Doze):**
  1. Login persists across app restarts (cookie session in WebView).
  2. App open, no course → positions refresh `profiles.last_*` (as today).
  3. Accept course → foreground-service notification appears; screen off for
     10+ min while moving → `driver_positions` rows keep arriving ~15 s apart.
  4. Course delivered → service stops, notification gone.
  5. Permission denied → app degrades exactly like the web `denied` state.
  6. Battery saver on → document behavior (Doze exemptions are OEM-specific).
- Each phase ends with its matrix rows verified before the next begins.

## Boundaries

**Always**
- Read the relevant guide in `node_modules/next/dist/docs/` before touching
  Next.js code (this Next version has breaking changes — AGENTS.md).
- Keep the brand spelled **Wamye** in anything user-visible or newly named.
- Keep the web PWA fully functional with zero behavior change for browsers;
  every native path sits behind `isNativeApp()`.
- Keep posting positions through the existing `/api/driver/position` contract.
- Run the static gates before every commit; verify markers/maps on the
  deployed site, not localhost.

**Ask first**
- Any Supabase schema or RLS change (none is expected for v1).
- Any change to the `feed_courses` / `expire_stale_orders` window, dispatch
  radius rules, or order state machine — these are production invariants.
- Dependencies beyond the four Capacitor packages listed.
- Changing the Coolify/Docker build (Capacitor should not touch it: `android/`
  is outside the Next build graph, but confirm the Docker context ignores it).
- Anything Play-Store-facing (account, listing, `ACCESS_BACKGROUND_LOCATION`
  declaration).

**Never**
- Commit the release keystore, its passwords, or any secret (extend
  `.gitignore` before the keystore exists).
- Reintroduce Fleetbase into the order path.
- Ship silent half-working tracking: if the native watcher cannot run
  (permission, service killed), the UI must say so, like the web banner does.
- Remove or weaken the web geolocation path — parallel operation is the point.

## Success Criteria

1. `npm run build` passes and the deployed web app is byte-for-byte
   behavior-identical for browser users (no new prompts, banners, bundles
   loading plugin code).
2. A signed APK installs by direct download on a stock Android phone; a
   driver logs in once and stays logged in.
3. **The headline:** during an active course with the screen off for 10+
   minutes of real movement, `driver_positions` receives fixes at ~15 s
   intervals and the customer tracking map follows along.
4. Ending the course stops the service and its notification within seconds.
5. A web deploy (push to `main`) changes what the installed APK shows on next
   launch, with no APK rebuild.
6. `docs/android.md` lets you rebuild and re-sign the APK from a clean clone.

## Resolved Questions (2026-08-06)

1. **Availability-time tracking:** keep the existing loop when there is no
   course and add the foreground service only during an active course. The
   always-on service stays a v1.1 candidate.
2. **APK delivery:** a `/telecharger` page with a direct link to the APK
   (now in scope above).
3. **Update nudge:** yes — the minimum-version check ships in v1 (now in
   scope above).
4. **Entry point:** the shell opens on `/dashboard` / `/login`, never the
   home page (now in scope above).

Plan: `tasks/plan.md` · Task list: `tasks/todo.md`
