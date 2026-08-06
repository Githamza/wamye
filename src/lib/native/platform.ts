import { Capacitor } from "@capacitor/core";

/**
 * True only inside the Android shell's WebView. Browsers, the installed PWA
 * and SSR all get false — and no other module under src/lib/native/ may load
 * unless this passed. The UA check (shell.ts) is the server's view; this is
 * the client's, and the one the plugin bridge actually depends on.
 */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}
