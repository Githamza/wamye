// ============================================================
// Client-side persistence (returning customer + course counter).
// Keys are namespaced per tenant slug so two tenants opened in the same
// browser never share a returning-customer prefill or course sequence.
// ============================================================

import type { Commerce } from "@/lib/config-types";

export type LastOrder = {
  order: string;
  commerceName: string;
  phone: string;
  prenom: string;
  /**
   * The full commerce, coordinates included. Older entries stored only an id
   * and a name, which is not enough to reorder from — a pickup without
   * coordinates is undeliverable (see CreateOrderInput.commercePosition), so
   * those entries prefill everything except the commerce.
   */
  commerce?: Commerce | null;
};

/**
 * A course the customer is still following. Persisted because the tracking
 * token is a capability handed out once by POST /api/orders — there is no id to
 * look it up by, so losing it (a reload, a trip back to the form to order
 * again) would strand the customer with no way back to the timeline.
 */
export type ActiveOrder = {
  trackingToken: string | null;
  courseNumber: number;
  order: string;
  commerceName: string;
  fee: number | null;
  /**
   * Epoch ms. Doubles as the identity: an order costs a network round-trip, so
   * two of them cannot land in the same millisecond.
   */
  createdAt: number;
};

/**
 * A course left overnight is over whatever the last polled stage said — the
 * customer closed the tab before `delivered` arrived. Past this, the resume
 * bar would be lying.
 */
const ACTIVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * How many running courses to keep. A customer ordering from three shops at
 * once is real; ten is a stuck entry, and the list is pinned to the top of the
 * screen where it cannot be allowed to grow.
 */
const ACTIVE_MAX = 5;

function lastKey(slug: string): string {
  return `ld:${slug}:last-order`;
}

function activeKey(slug: string): string {
  return `ld:${slug}:active-order`;
}

function courseKey(slug: string): string {
  return `ld:${slug}:course-seq`;
}

export function loadLastOrder(slug: string): LastOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(lastKey(slug));
    return raw ? (JSON.parse(raw) as LastOrder) : null;
  } catch {
    return null;
  }
}

export function saveLastOrder(slug: string, o: LastOrder): void {
  try {
    localStorage.setItem(lastKey(slug), JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function writeActive(slug: string, list: ActiveOrder[]): ActiveOrder[] {
  try {
    localStorage.setItem(activeKey(slug), JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

/** Running courses, newest first. Expired entries are dropped on the way out. */
export function loadActiveOrders(slug: string): ActiveOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(activeKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(activeKey(slug));
      return [];
    }
    const now = Date.now();
    const fresh = (parsed as ActiveOrder[]).filter(
      (o) =>
        typeof o?.createdAt === "number" && now - o.createdAt < ACTIVE_MAX_AGE_MS,
    );
    if (fresh.length !== parsed.length) writeActive(slug, fresh);
    return fresh;
  } catch {
    return [];
  }
}

/** Adds a course to the front of the list and returns the list to render. */
export function addActiveOrder(slug: string, o: ActiveOrder): ActiveOrder[] {
  return writeActive(
    slug,
    [o, ...loadActiveOrders(slug)].slice(0, ACTIVE_MAX),
  );
}

/** Called once a course reaches a terminal stage — nothing left to follow. */
export function clearActiveOrder(slug: string, createdAt: number): void {
  const list = loadActiveOrders(slug);
  const kept = list.filter((o) => o.createdAt !== createdAt);
  if (kept.length !== list.length) writeActive(slug, kept);
}

export function nextCourseNumber(slug: string): number {
  if (typeof window === "undefined") return 47;
  try {
    const cur = Number(localStorage.getItem(courseKey(slug)) ?? "46");
    const next = (Number.isFinite(cur) ? cur : 46) + 1;
    localStorage.setItem(courseKey(slug), String(next));
    return next;
  } catch {
    return 47;
  }
}
