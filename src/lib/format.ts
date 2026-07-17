// ============================================================
// Locale-aware display formatting for user-facing numbers.
//
// Every price, distance and unit the customer sees goes through here. Before
// this existed the same value was formatted four different ways (toFixed +
// ",". replace + " km" concatenation), which is why the stats page rendered
// "7.5 km" while the order screen rendered "7,5 km" for the same number.
//
// Concatenating a unit onto a number does not survive translation: Arabic
// puts the currency symbol inside RTL marks and abbreviates "km" as "كم", so
// the unit has to come from the formatter rather than the call site.
//
// `locale` is the seam for that. It defaults to French-Tunisia, which
// reproduces the pre-i18n output exactly, so call sites can adopt these
// helpers before the locale is actually threaded through.
// ============================================================

/** Reproduces the pre-i18n French output. Callers pass a real locale later. */
const DEFAULT_LOCALE = "fr-TN";

/** Intl formatters are costly to build, so keep one per locale per shape. */
function perLocale(make: (locale: string) => Intl.NumberFormat) {
  const cache = new Map<string, Intl.NumberFormat>();
  return (locale: string) => {
    let format = cache.get(locale);
    if (!format) {
      format = make(locale);
      cache.set(locale, format);
    }
    return format;
  };
}

// One fraction digit, not TND's default three: feeForKm snaps every fee to a
// half-dinar via roundToHalf, so millimes are always zero and "7,500 DT" would
// be noise.
const dinarFormat = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "TND",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
);

// Up to one decimal, but no trailing ",0": distances arrive either rounded to
// a tenth (the zone radius) or straight from the routing API, and a whole
// number reads better as "12 km" than "12,0 km".
const kilometreFormat = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "kilometer",
      unitDisplay: "short",
      maximumFractionDigits: 1,
    }),
);

const metreFormat = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "meter",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }),
);

/** A fee with its currency symbol: "7,5 DT" (fr) / "‏7,5 د.ت.‏" (ar). */
export function formatDinar(n: number, locale: string = DEFAULT_LOCALE): string {
  return dinarFormat(locale).format(n);
}

/** A distance with its unit: "7,5 km" (fr) / "7,5 كم" (ar). */
export function formatKm(km: number, locale: string = DEFAULT_LOCALE): string {
  return kilometreFormat(locale).format(km);
}

/**
 * A proximity label for a nearby place, switching unit at the kilometre:
 * "800 m" below, "1,2 km" above.
 */
export function formatMeters(m: number, locale: string = DEFAULT_LOCALE): string {
  return m < 1000 ? metreFormat(locale).format(Math.round(m)) : formatKm(m / 1000, locale);
}
