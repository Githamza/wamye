/**
 * Server-side detection of the Android shell.
 *
 * capacitor.config.ts appends "WamyeLivreur/<versionCode>" to the WebView's
 * User-Agent, so SSR can branch without a hydration flash and without
 * shipping any Capacitor code to browsers. The trailing number feeds the
 * ANDROID_MIN_VERSION gate (T5).
 */

const SHELL_UA_MARK = "WamyeLivreur/";

export function isNativeShellUA(userAgent: string | null): boolean {
  return userAgent?.includes(SHELL_UA_MARK) ?? false;
}
