// ============================================================
// Location-aware phone numbers.
//
// The dial code, validation, formatting and E.164 conversion all follow the
// customer's country — derived from their GPS position (reverse-geocoded) or,
// as a fallback, the device locale. Isomorphic: no browser-only APIs at module
// scope, so it is safe to import from both client components and API routes.
// ============================================================

/** The public shape the UI needs to render a phone input for a country. */
export type PhoneFormat = {
  /** ISO 3166-1 alpha-2, e.g. "FR". */
  country: string;
  /** International dial code with the plus, e.g. "+33". */
  dialCode: string;
  flag: string;
  /** National placeholder, e.g. "06 12 34 56 78". */
  example: string;
};

type Rule = {
  dialCode: string;
  flag: string;
  /** Accepted national digit counts, as the customer types them (trunk 0 included where used). */
  lengths: number[];
  /** Drop a single leading 0 when building the E.164 number. */
  trunkZero: boolean;
  /** Display grouping of the national digits, e.g. [2,2,2,2,2] → "06 12 34 56 78". */
  group: number[];
  example: string;
};

// A pragmatic table covering the countries most likely to come up in testing.
// Unknown countries fall back to DEFAULT_COUNTRY's rule so the input always works;
// extend this map to add first-class support for another country.
const RULES: Record<string, Rule> = {
  FR: { dialCode: "+33", flag: "🇫🇷", lengths: [10], trunkZero: true, group: [2, 2, 2, 2, 2], example: "06 12 34 56 78" },
  TN: { dialCode: "+216", flag: "🇹🇳", lengths: [8], trunkZero: false, group: [2, 3, 3], example: "22 483 921" },
  BE: { dialCode: "+32", flag: "🇧🇪", lengths: [9, 10], trunkZero: true, group: [4, 2, 2, 2], example: "0470 12 34 56" },
  CH: { dialCode: "+41", flag: "🇨🇭", lengths: [10], trunkZero: true, group: [3, 3, 2, 2], example: "079 123 45 67" },
  DE: { dialCode: "+49", flag: "🇩🇪", lengths: [10, 11, 12], trunkZero: true, group: [4, 4, 4], example: "0151 2345 6789" },
  ES: { dialCode: "+34", flag: "🇪🇸", lengths: [9], trunkZero: false, group: [3, 3, 3], example: "612 34 56 78" },
  IT: { dialCode: "+39", flag: "🇮🇹", lengths: [9, 10, 11], trunkZero: false, group: [3, 3, 4], example: "312 345 6789" },
  GB: { dialCode: "+44", flag: "🇬🇧", lengths: [10, 11], trunkZero: true, group: [5, 6], example: "07123 456789" },
  PT: { dialCode: "+351", flag: "🇵🇹", lengths: [9], trunkZero: false, group: [3, 3, 3], example: "912 345 678" },
  NL: { dialCode: "+31", flag: "🇳🇱", lengths: [10], trunkZero: true, group: [2, 4, 4], example: "06 1234 5678" },
  LU: { dialCode: "+352", flag: "🇱🇺", lengths: [8, 9], trunkZero: false, group: [3, 3, 3], example: "621 123 456" },
  MA: { dialCode: "+212", flag: "🇲🇦", lengths: [10], trunkZero: true, group: [4, 3, 3], example: "0612 345 678" },
  DZ: { dialCode: "+213", flag: "🇩🇿", lengths: [10], trunkZero: true, group: [4, 2, 2, 2], example: "0551 23 45 67" },
  US: { dialCode: "+1", flag: "🇺🇸", lengths: [10], trunkZero: false, group: [3, 3, 4], example: "415 555 1234" },
  CA: { dialCode: "+1", flag: "🇨🇦", lengths: [10], trunkZero: false, group: [3, 3, 4], example: "415 555 1234" },
};

export const DEFAULT_COUNTRY = "FR";

function ruleFor(country: string): Rule {
  return RULES[country?.toUpperCase()] ?? RULES[DEFAULT_COUNTRY];
}

/** Whether the app has a first-class rule for this country (vs. falling back). */
export function isKnownCountry(country: string): boolean {
  return Boolean(RULES[country?.toUpperCase()]);
}

/** The public format descriptor the UI renders from. */
export function phoneFormatFor(country: string): PhoneFormat {
  const r = ruleFor(country);
  return {
    country: RULES[country?.toUpperCase()] ? country.toUpperCase() : DEFAULT_COUNTRY,
    dialCode: r.dialCode,
    flag: r.flag,
    example: r.example,
  };
}

/** Keep only digits, capped at the longest national length this country allows. */
export function normalizePhone(raw: string, country: string): string {
  const r = ruleFor(country);
  return raw.replace(/\D/g, "").slice(0, Math.max(...r.lengths));
}

export function isValidPhone(raw: string, country: string): boolean {
  const r = ruleFor(country);
  const digits = normalizePhone(raw, country);
  if (!r.lengths.includes(digits.length)) return false;
  // Trunk-zero countries: the national number must start with 0, then a 1-9 prefix.
  if (r.trunkZero) return /^0[1-9]/.test(digits);
  return /^[1-9]/.test(digits);
}

export function formatPhone(raw: string, country: string): string {
  const r = ruleFor(country);
  const digits = normalizePhone(raw, country);
  const parts: string[] = [];
  let i = 0;
  for (const size of r.group) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  if (i < digits.length) parts.push(digits.slice(i)); // any overflow digits
  return parts.join(" ");
}

/** Build the E.164 number (e.g. "+33612345678") sent to the delivery backend. */
export function toE164(raw: string, country: string): string {
  const r = ruleFor(country);
  let digits = normalizePhone(raw, country);
  if (r.trunkZero) digits = digits.replace(/^0/, "");
  return `${r.dialCode}${digits}`;
}

/**
 * Best-effort country from the device locale (e.g. "fr-FR" → "FR"). Used before
 * a GPS fix exists, and whenever reverse geocoding is unavailable.
 */
export function detectCountryFromLocale(): string {
  if (typeof navigator === "undefined") return DEFAULT_COUNTRY;
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const l of langs) {
    try {
      const region = new Intl.Locale(l).maximize().region;
      if (region && RULES[region]) return region;
    } catch {
      /* malformed locale — try the next one */
    }
  }
  return DEFAULT_COUNTRY;
}
