// ============================================================
// Tunisia's governorates — and the free text a livreur types about where they
// work.
//
// Why this file exists: 141 livreurs have signed up and 6 of them have ever
// reported a GPS fix (a PWA cannot track in the background, so a phone only
// reports while the app is open). Almost all of them also still carry the
// default delivery zone from signup. The one thing nearly every livreur DID
// give us is a line of free text — "Ariana", "Ben arous", "Bardo/marsa/aaouina",
// "بومهل", "Araina", "Am ouba" — and that is what a launch-by-city decision has
// to be built on.
//
// So this module does one thing: turn that line into a governorate. It is a
// static gazetteer plus a tolerant matcher — no geocoding call, no API bill,
// and no dependency on a driver having opened the app today.
// ============================================================

export type Governorate = {
  /** Stable slug — React key, and the selected region in the URL. */
  key: string;
  name: string;
  nameAr: string;
  /** Governorate seat, used to place its bubble on the map. */
  lat: number;
  lng: number;
  /**
   * Everything a livreur might write to mean this governorate: the seat, its
   * Arabic name, the neighbourhoods and delegations people actually name
   * instead of the governorate, and the spellings they use. Spelling variants
   * that differ only by accent or case are NOT listed — normalize() folds
   * those, and typos are handled by the fuzzy pass in matchGovernorates().
   */
  aliases: string[];
};

/**
 * The 24 governorates. Grand Tunis is deliberately left as its four separate
 * governorates: "launch in Ariana" and "launch in Ben Arous" are different
 * decisions, and merging them would hide that half the waiting list is not in
 * Tunis proper.
 */
export const GOVERNORATES: Governorate[] = [
  {
    key: "tunis",
    name: "Tunis",
    nameAr: "تونس",
    lat: 36.8065,
    lng: 10.1815,
    aliases: [
      "tunis", "تونس", "tunis centre", "centre ville", "grand tunis",
      "banlieue nord", "medina", "bab souika", "bab bhar", "lafayette",
      "montplaisir", "mutuelleville", "belvedere", "menzah", "manar",
      "bardo", "البرطو", "الباردو", "omrane", "العمران", "ouardia", "الوردية",
      "sijoumi", "kabaria", "sidi hassine", "melassine", "jebel jelloud",
      "kram", "الكرم", "goulette", "halq el oued", "carthage", "قرطاج",
      "sidi bou said", "marsa", "المرسى", "aouina", "العوينة",
      "jardins de carthage", "lac", "les berges du lac", "بحيرة",
    ],
  },
  {
    key: "ariana",
    name: "Ariana",
    nameAr: "أريانة",
    lat: 36.8625,
    lng: 10.1956,
    aliases: [
      "ariana", "اريانة", "ariana ville", "soukra", "السكرة",
      "raoued", "رواد", "borj louzir", "ghazela", "riadh andalous",
      "ennasr", "النصر", "mnihla", "المنيهلة", "ettadhamen", "التضامن",
      "kalaat andalous", "sidi thabet", "chotrana",
    ],
  },
  {
    key: "ben-arous",
    name: "Ben Arous",
    nameAr: "بن عروس",
    lat: 36.7533,
    lng: 10.2283,
    aliases: [
      "ben arous", "بن عروس", "nouvelle medina", "المدينة الجديدة",
      "mourouj", "المروج", "rades", "رادس", "megrine", "مقرين",
      "hammam lif", "حمام الأنف", "hammam chott", "ezzahra", "الزهراء",
      "borj cedria", "برج السدرية", "boumhel", "بومهل", "mohamedia",
      "fouchana", "فوشانة", "naassen", "mornag", "مرناق",
    ],
  },
  {
    key: "manouba",
    name: "Manouba",
    nameAr: "منوبة",
    lat: 36.8079,
    lng: 10.0963,
    aliases: [
      "manouba", "منوبة", "denden", "oued ellil", "douar hicher",
      "tebourba", "طبربة", "jedaida", "mornaguia", "borj el amri",
    ],
  },
  {
    key: "nabeul",
    name: "Nabeul",
    nameAr: "نابل",
    lat: 36.4513,
    lng: 10.7357,
    aliases: [
      "nabeul", "نابل", "hammamet", "الحمامات", "kelibia", "قليبية",
      "korba", "korbous", "menzel temime", "soliman", "سليمان",
      "grombalia", "قرمبالية", "beni khiar", "dar chaabane", "haouaria",
      "بوعرقوب", "beni khalled",
    ],
  },
  {
    key: "zaghouan",
    name: "Zaghouan",
    nameAr: "زغوان",
    lat: 36.4029,
    lng: 10.1429,
    aliases: ["zaghouan", "زغوان", "zriba", "bir mcherga", "fahs", "الفحص", "nadhour"],
  },
  {
    key: "bizerte",
    name: "Bizerte",
    nameAr: "بنزرت",
    lat: 37.2744,
    lng: 9.8739,
    aliases: [
      "bizerte", "بنزرت", "benzart", "banzart", "menzel bourguiba",
      "menzel jemil", "ras jebel", "mateur", "ماطر", "sejnane", "utique",
      "el alia", "ghar el melh",
    ],
  },
  {
    key: "beja",
    name: "Béja",
    nameAr: "باجة",
    lat: 36.7256,
    lng: 9.1817,
    aliases: ["beja", "باجة", "nefza", "testour", "تستور", "teboursouk", "goubellat", "amdoun"],
  },
  {
    key: "jendouba",
    name: "Jendouba",
    nameAr: "جندوبة",
    lat: 36.5011,
    lng: 8.7803,
    aliases: ["jendouba", "جندوبة", "tabarka", "طبرقة", "ain draham", "bou salem", "fernana", "ghardimaou"],
  },
  {
    key: "kef",
    name: "Le Kef",
    nameAr: "الكاف",
    lat: 36.1742,
    lng: 8.7049,
    aliases: ["kef", "الكاف", "dahmani", "tajerouine", "sakiet sidi youssef", "jerissa", "nebeur"],
  },
  {
    key: "siliana",
    name: "Siliana",
    nameAr: "سليانة",
    lat: 36.0849,
    lng: 9.3708,
    aliases: ["siliana", "سليانة", "makthar", "bou arada", "gaafour", "kesra", "rouhia"],
  },
  {
    key: "kairouan",
    name: "Kairouan",
    nameAr: "القيروان",
    lat: 35.6781,
    lng: 10.0963,
    aliases: ["kairouan", "القيروان", "sbikha", "السبيخة", "haffouz", "oueslatia", "chebika", "nasrallah"],
  },
  {
    key: "kasserine",
    name: "Kasserine",
    nameAr: "القصرين",
    lat: 35.1676,
    lng: 8.8365,
    aliases: ["kasserine", "القصرين", "sbeitla", "سبيطلة", "feriana", "thala", "foussana", "hassi frid"],
  },
  {
    key: "sidi-bouzid",
    name: "Sidi Bouzid",
    nameAr: "سيدي بوزيد",
    lat: 35.0382,
    lng: 9.4849,
    aliases: ["sidi bouzid", "سيدي بوزيد", "regueb", "meknassy", "jelma", "bir el hafey", "menzel bouzaiene"],
  },
  {
    key: "sousse",
    name: "Sousse",
    nameAr: "سوسة",
    lat: 35.8256,
    lng: 10.6084,
    aliases: [
      "sousse", "sousa", "سوسة", "sahloul", "سهلول", "hammam sousse", "kantaoui",
      "akouda", "kalaa kebira", "kalaa seghira", "msaken", "مساكن",
      "enfidha", "النفيضة", "bouficha", "sidi bou ali", "khezama",
    ],
  },
  {
    key: "monastir",
    name: "Monastir",
    nameAr: "المنستير",
    lat: 35.778,
    lng: 10.8262,
    aliases: [
      "monastir", "المنستير", "skanes", "sahline", "ksar hellal",
      "jemmal", "جمال", "moknine", "المكنين", "teboulba", "bembla", "zeramdine",
    ],
  },
  {
    key: "mahdia",
    name: "Mahdia",
    nameAr: "المهدية",
    lat: 35.5047,
    lng: 11.0622,
    aliases: ["mahdia", "المهدية", "ksour essef", "chebba", "الشابة", "bou merdes", "souassi", "rejiche"],
  },
  {
    key: "sfax",
    name: "Sfax",
    nameAr: "صفاقس",
    lat: 34.7406,
    lng: 10.7603,
    aliases: [
      "sfax", "صفاقس", "sakiet ezzit", "sakiet eddaier", "chihia",
      "gremda", "قرمدة", "teniour", "طينة", "tina", "mahres", "المحرس",
      "jebeniana", "kerkennah", "قرقنة", "el ain", "agareb", "bir ali ben khelifa",
    ],
  },
  {
    key: "gafsa",
    name: "Gafsa",
    nameAr: "قفصة",
    lat: 34.425,
    lng: 8.7842,
    aliases: ["gafsa", "قفصة", "metlaoui", "المتلوي", "redeyef", "moulares", "sened", "sidi aich", "mdhilla"],
  },
  {
    key: "tozeur",
    name: "Tozeur",
    nameAr: "توزر",
    lat: 33.9197,
    lng: 8.1335,
    aliases: ["tozeur", "توزر", "nefta", "نفطة", "degache", "hazoua", "tameghza"],
  },
  {
    key: "kebili",
    name: "Kébili",
    nameAr: "قبلي",
    lat: 33.7047,
    lng: 8.969,
    aliases: ["kebili", "قبلي", "douz", "دوز", "souk lahad", "jemna", "faouar"],
  },
  {
    key: "gabes",
    name: "Gabès",
    nameAr: "قابس",
    lat: 33.8815,
    lng: 10.0982,
    aliases: ["gabes", "قابس", "mareth", "matmata", "مطماطة", "hamma", "الحامة", "ghannouch", "metouia", "mareth"],
  },
  {
    key: "medenine",
    name: "Médenine",
    nameAr: "مدنين",
    lat: 33.3549,
    lng: 10.5055,
    aliases: [
      "medenine", "مدنين", "djerba", "jerba", "جربة", "houmt souk",
      "حومة السوق", "midoun", "ميدون", "ajim", "أجيم", "zarzis", "جرجيس",
      "ben gardane", "بن قردان", "beni khedache", "sidi makhlouf",
    ],
  },
  {
    key: "tataouine",
    name: "Tataouine",
    nameAr: "تطاوين",
    lat: 32.9297,
    lng: 10.4518,
    aliases: ["tataouine", "تطاوين", "ghomrassen", "remada", "dehiba", "bir lahmar", "smar"],
  },
];

const BY_KEY = new Map(GOVERNORATES.map((g) => [g.key, g]));

export function governorate(key: string): Governorate | null {
  return BY_KEY.get(key) ?? null;
}

/** Centre + span used to frame the whole country on first paint. */
export const TUNISIA_CENTER = { lat: 34.6, lng: 9.6 };
export const TUNISIA_BOUNDS = { south: 30.1, north: 37.7, west: 7.4, east: 11.8 };

/**
 * A coordinate inside the country's bounding box.
 *
 * Worth checking because some tenants really are elsewhere: one zone centre
 * sits in Montrouge and another near Tours, left over from testing the app
 * from France. Drawing those on a map of Tunisia would silently invent a city.
 */
export function inTunisia(p: { lat: number; lng: number }): boolean {
  return (
    p.lat >= TUNISIA_BOUNDS.south &&
    p.lat <= TUNISIA_BOUNDS.north &&
    p.lng >= TUNISIA_BOUNDS.west &&
    p.lng <= TUNISIA_BOUNDS.east
  );
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111.32;
  const dLng = (b.lng - a.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * The governorate whose seat is nearest a coordinate.
 *
 * Nearest-seat, not a real polygon lookup: this page answers "which city do we
 * launch next", where being one delegation off never changes the answer, and
 * carrying 24 boundary polygons into the browser would.
 */
export function nearestGovernorate(p: { lat: number; lng: number }): Governorate {
  let best = GOVERNORATES[0];
  let bestKm = Infinity;
  for (const g of GOVERNORATES) {
    const d = km(p, g);
    if (d < bestKm) {
      bestKm = d;
      best = g;
    }
  }
  return best;
}

// ---- Matching free text ----------------------------------------

/**
 * Fold a label to something comparable: lowercase, no Latin accents, no Arabic
 * vowel marks, hamza-carriers and taa marbouta unified (so "أريانة" and
 * "اريانه" are the same string), punctuation to spaces. "Bardo/marsa" has to
 * come out as two tokens, not one.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // Latin combining accents, then Arabic tashkeel / hamza marks / tatweel.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064b-\u065f\u0640\u0670]/g, "")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064a")
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop the Arabic definite article, so "المنيهلة" matches "منيهلة". */
function stripArticle(token: string): string {
  return token.length > 4 && token.startsWith("ال") ? token.slice(2) : token;
}

/**
 * Words that name the country, not a city.
 *
 * "Tunisie" as a work area means "anywhere", which is not a launch signal — and
 * left in, it would fuzzy-match Tunis and quietly pad the capital's count.
 * "Tunise" is NOT here: a livreur describing where they deliver means the city,
 * and it is one keystroke from "Tunis".
 */
const COUNTRY_WORDS = new Set(["tunisie", "tunisia", "tounisie", "tunisienne", "تونيسيا"]);

/** Optimal string alignment distance — Levenshtein plus adjacent swaps, which
 *  is what "Araina" for "Ariana" actually is. */
function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push(new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + cost);
      }
    }
  }
  return rows[a.length][b.length];
}

/** How wrong a spelling may be before it stops being the same place. Short
 *  names get no slack: "Sfax" and "Gafsa" are four letters apart on purpose. */
function budget(alias: string): number {
  if (alias.length <= 4) return 0;
  if (alias.length <= 6) return 1;
  return 2;
}

export type AreaMatch = {
  gov: Governorate;
  /** The alias that matched, so the UI can show WHY this livreur landed here. */
  matched: string;
  /** True when the spelling had to be forgiven — worth flagging as a guess. */
  fuzzy: boolean;
};

type Hit = { gov: Governorate; matched: string; at: number; fuzzy: boolean };

/**
 * Every governorate a label names, in the order the label names them.
 *
 * Order is the whole point: "Ariana tunis bardo" is an Ariana livreur who also
 * covers Tunis, so the first hit is the one they are counted in and the rest
 * are shown as extra coverage.
 *
 * Two passes, exact before fuzzy, and fuzzy only runs when nothing matched
 * exactly. Mixing them would let "hammam lif" (Ben Arous) also count as
 * Hammamet, which is two hours away.
 */
export function matchGovernorates(label: string | null | undefined): AreaMatch[] {
  const norm = normalize(label ?? "");
  if (!norm) return [];

  const tokens: { text: string; at: number }[] = [];
  let cursor = 0;
  for (const raw of norm.split(" ")) {
    const text = stripArticle(raw);
    if (text.length >= 3 && !COUNTRY_WORDS.has(text)) tokens.push({ text, at: cursor });
    cursor += raw.length + 1;
  }
  if (tokens.length === 0) return [];

  // "Am ouba" is one place split by a stray space; joining the words back up
  // gives the fuzzy pass a shot at "Manouba". Built from the raw label, not
  // from `tokens` — the stray fragment is usually too short to be a token.
  const joined = norm.replace(/ /g, "");
  const squished = norm.split(" ").length <= 3 && joined.length <= 14 ? joined : "";

  const exact = new Map<string, Hit>();
  const fuzzy = new Map<string, Hit>();

  const keep = (into: Map<string, Hit>, hit: Hit) => {
    const prev = into.get(hit.gov.key);
    if (!prev || hit.at < prev.at) into.set(hit.gov.key, hit);
  };

  for (const gov of GOVERNORATES) {
    for (const raw of gov.aliases) {
      const alias = normalize(raw);
      if (alias.includes(" ")) {
        // Multi-word aliases are phrases: match them against the whole label.
        const at = norm.indexOf(alias);
        if (at >= 0) keep(exact, { gov, matched: raw, at, fuzzy: false });
        continue;
      }
      for (const token of tokens) {
        if (token.text === alias) {
          keep(exact, { gov, matched: raw, at: token.at, fuzzy: false });
        } else if (editDistance(token.text, alias) <= budget(alias)) {
          keep(fuzzy, { gov, matched: raw, at: token.at, fuzzy: true });
        }
      }
      if (squished && editDistance(squished, alias) <= budget(alias)) {
        keep(fuzzy, { gov, matched: raw, at: 0, fuzzy: true });
      }
    }
  }

  const hits = exact.size > 0 ? [...exact.values()] : [...fuzzy.values()];
  return hits
    .sort((a, b) => a.at - b.at)
    .map(({ gov, matched, fuzzy: wasFuzzy }) => ({ gov, matched, fuzzy: wasFuzzy }));
}
