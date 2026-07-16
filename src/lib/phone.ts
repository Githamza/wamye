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

const DIAL_CODES: Record<string, string> = { TN: "+216", FR: "+33" };

/**
 * Best-effort E.164 for systems that demand it (Fleetbase driver records).
 * An input already in international form is trusted as typed; otherwise the
 * tenant's phoneCountry supplies the dial code.
 */
export function toInternationalPhone(raw: string, country = "TN"): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return `${DIAL_CODES[country.toUpperCase()] ?? DIAL_CODES.TN}${digits}`;
}
