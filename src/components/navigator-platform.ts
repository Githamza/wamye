"use client";

import { useSyncExternalStore } from "react";

/**
 * Which store / deep-link form fits this device. Read through
 * useSyncExternalStore with a server fallback: the server render assumes
 * "other" and the client corrects it without an effect.
 */
export type Platform = "android" | "ios" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

const noopSubscribe = () => () => {};

export function usePlatform(): Platform {
  return useSyncExternalStore(noopSubscribe, detectPlatform, () => "other" as Platform);
}
