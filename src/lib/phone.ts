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
 * Best-effort E.164 for systems that demand it.
 *
 * Currently unused: its only caller was the Fleetbase driver/company sync,
 * which is gone. Kept because the next thing that needs a full number — an SMS
 * provider — will need exactly this, and the parsing below is the hard part.
 *
 * Phone input is free text with a `+216…` placeholder and no validation, so
 * all of these turn up in practice and must land on the same number:
 *
 *     +216 20 123 456   20123456   00216 20123456   216 20123456
 *
 * Only the last two need explaining. `00` is the other international prefix,
 * so what follows is already a full number, dial code included. A bare `216`
 * is the same thing minus any prefix at all — recognised only when what
 * follows is a plausible national number, so a local number that happens to
 * start with those digits is never mistaken for one (TN locals start 2/4/5/9,
 * hence there is no real overlap, but the length check makes it explicit).
 *
 * A leading `0` is a national trunk prefix (`06…` in FR): dropped before the
 * dial code goes on, since no country's subscriber number keeps it.
 */
export function toInternationalPhone(raw: string, country = "TN"): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) return "+" + digits.slice(2);

  const dial = DIAL_CODES[country.toUpperCase()] ?? DIAL_CODES.TN;
  const code = dial.slice(1);
  if (digits.startsWith(code) && digits.length > code.length + 4) {
    return "+" + digits;
  }

  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return `${dial}${digits}`;
}
