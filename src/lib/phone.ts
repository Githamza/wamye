// ============================================================
// Phone validation & formatting.
// Currently Tunisia-specific (8 local digits starting 2/4/5/9, +216).
// The tenant's phoneCountry will parameterize this in a later phase.
// ============================================================

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  return digits.length === 8 && /^[2459]/.test(digits);
}

export function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  // 22 483 921
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8)].filter(Boolean).join(" ");
}
