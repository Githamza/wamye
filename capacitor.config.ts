import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "live.mylabs.wamye",
  appName: "Wamye Livreur",
  // Unused at runtime (server.url below), but the CLI insists on local web
  // assets to copy into the APK. A one-page stub keeps public/ and its
  // service worker out of the bundle.
  webDir: "capacitor-shell",
  // The shell renders the deployed site, so every web deploy updates the app
  // with no APK rebuild. Entry is /dashboard: proxy.ts bounces signed-out
  // visitors to /login — drivers never see the marketing home.
  server: {
    url: "https://wamye.mylabs.live/dashboard",
  },
  // How the server tells the shell apart from a browser: SSR reads this UA to
  // hide the foreground-only banner and to compare against ANDROID_MIN_VERSION
  // (the trailing number is the versionCode — bump it with each APK release).
  appendUserAgent: "WamyeLivreur/1",
};

export default config;
