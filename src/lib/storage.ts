// ============================================================
// Client-side persistence (returning customer + course counter).
// Keys are namespaced per tenant slug so two tenants opened in the same
// browser never share a returning-customer prefill or course sequence.
// ============================================================

export type LastOrder = {
  order: string;
  commerceId: string | null;
  commerceName: string;
  phone: string;
  prenom: string;
};

function lastKey(slug: string): string {
  return `ld:${slug}:last-order`;
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
