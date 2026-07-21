// Shared lead-data model + normalization for the real-data pipeline.
//
// Sources, all wired through app/api/*:
// · OpenStreetMap Overpass  — business inventory (free, no key)
// · Nominatim               — geocoding: coords <-> city / neighborhood (free)
// · Google Places API (New) — ratings, review counts, review text, listed URL
//                             (optional, GOOGLE_PLACES_API_KEY)
// · OpenCorporates          — registration year ("listed since"), optional
//                             OPENCORPORATES_API_TOKEN raises the rate limit
// · Live URL check          — our own fetch of the listed URL to classify
//                             "No website" / "Facebook only" / real site

export type WebStatus = "none" | "third" | "site";

export interface LeadRow {
  id: string;            // "node/123", "way/456" or "gp:<placeId>"
  name: string;
  cat: string;           // human category ("Plumber", "Hair salon", ...)
  addr: string;          // street address, may be "" when the source has none
  hood: string;          // neighborhood; falls back to the city short name
  city: string;          // "San Francisco, CA"
  phone: string | null;
  website: string | null; // listed URL exactly as the source carries it
  status: WebStatus;
  thirdKind?: string;    // "Facebook" | "Instagram" | "Linktree" | ...
  statusNote: string;    // provenance line shown under the status
  lat: number | null;
  lon: number | null;
  rev: number | null;    // review count; null = not known yet (no Places data)
  rating: number | null; // stars; null = not known yet
  sinceYear: number | null; // first listed/registered year when a source has it
  listedDays: number | null; // days since the OSM element was last touched
  reviews?: LeadReview[]; // real review text once enriched
  sources: string[];     // data lineage, e.g. ["OpenStreetMap", "Google Places"]
  real: true;            // marks rows that came from live sources, not the demo
  enriched?: boolean;    // per-business enrichment has already run
  // "none" from an OSM record only means the record carries no URL - the
  // business may still have a site. Google listings and the per-row live
  // check are authoritative; until one of them confirms, verified stays
  // false and the UI says "No URL on record" instead of "No website".
  verified: boolean;
}

export interface LeadReview {
  author: string;
  stars: number;   // 1..5
  when: string;    // "3 months ago"
  body: string;
}

// ── Website classification ──────────────────────────────────────────────────
// A URL that only points at a hosted profile is not a website. These are the
// hosts we treat as "third-party only"; anything else that parses is a site.
const THIRD_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)facebook\.com|(^|\.)fb\.com|(^|\.)fb\.me/i, "Facebook"],
  [/(^|\.)instagram\.com/i, "Instagram"],
  [/(^|\.)linktr\.ee|(^|\.)linktree\.com/i, "Linktree"],
  [/(^|\.)tiktok\.com/i, "TikTok"],
  [/(^|\.)twitter\.com|^x\.com|\.x\.com/i, "X"],
  [/(^|\.)yelp\.com/i, "Yelp"],
  [/(^|\.)wa\.me|(^|\.)whatsapp\.com/i, "WhatsApp"],
  [/(^|\.)m\.me|(^|\.)messenger\.com/i, "Messenger"],
  [/(^|\.)linkin\.bio|(^|\.)beacons\.ai|(^|\.)bio\.site/i, "Linktree"],
];

export function classifyUrl(url: string | null | undefined): { status: WebStatus; thirdKind?: string } {
  const u = (url || "").trim();
  if (!u) return { status: "none" };
  const host = hostOf(u);
  for (const [re, kind] of THIRD_HOSTS) {
    if (re.test(host) || (!host && re.test(u))) return { status: "third", thirdKind: kind };
  }
  return { status: "site" };
}

export function hostOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

export function checkedLabel(d: Date = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function statusNoteFor(status: WebStatus, opts: { url?: string | null; source: string; checked?: Date }): string {
  const when = `Checked ${checkedLabel(opts.checked)}`;
  if (status === "none") return `No website URL on its ${opts.source} record. ${when}`;
  const host = opts.url ? hostOf(opts.url) : "";
  if (status === "third") return `Listed URL points to ${host || "a hosted profile"}. No standalone site. ${when}`;
  return `Standalone site listed${host ? `: ${host}` : ""}. ${when}`;
}

// ── OSM category mapping ────────────────────────────────────────────────────
// shop=/craft=/amenity=/office=/healthcare= values -> the labels the screener
// uses. Anything unmapped is humanized ("car_parts" -> "Car parts").
const CAT_MAP: Record<string, string> = {
  hairdresser: "Hair salon", barber: "Barber shop", beauty: "Beauty salon",
  nails: "Nail salon", massage: "Massage", tattoo: "Tattoo studio",
  car_repair: "Auto repair", car_wash: "Car wash", car_parts: "Auto parts",
  tyres: "Tire shop", plumber: "Plumber", electrician: "Electrician",
  hvac: "HVAC", painter: "Painter", carpenter: "Carpenter", roofer: "Roofing",
  gardener: "Landscaping", cleaning: "Cleaning service", locksmith: "Locksmith",
  bakery: "Bakery", butcher: "Butcher", greengrocer: "Grocery",
  convenience: "Grocery", supermarket: "Grocery", deli: "Deli",
  seafood: "Seafood market", alcohol: "Liquor store", coffee: "Coffee shop",
  restaurant: "Restaurant", cafe: "Cafe", bar: "Bar", pub: "Pub",
  fast_food: "Restaurant", ice_cream: "Ice cream shop",
  shoe_repair: "Shoe repair", shoes: "Shoe store", tailor: "Tailor",
  clothes: "Clothing store", sewing: "Sewing shop", fabric: "Fabric store",
  dry_cleaning: "Dry cleaner", laundry: "Laundromat",
  doityourself: "Hardware store", hardware: "Hardware store",
  furniture: "Furniture store", upholsterer: "Upholstery",
  florist: "Florist", garden_centre: "Garden center",
  pet: "Pet store", pet_grooming: "Pet groomer", veterinary: "Veterinarian",
  optician: "Optometrist", hearing_aids: "Hearing aids",
  dentist: "Dentist", doctors: "Doctor", clinic: "Clinic",
  pharmacy: "Pharmacy", physiotherapist: "Physical therapy",
  chiropractor: "Chiropractor",
  accountant: "Tax service", tax_advisor: "Tax service", lawyer: "Lawyer",
  insurance: "Insurance", estate_agent: "Real estate", architect: "Architect",
  it: "IT services", employment_agency: "Staffing agency",
  driving_school: "Driving school", music_school: "Music school",
  tutoring: "Tutoring", childcare: "Childcare", kindergarten: "Childcare",
  photographer: "Photographer", photo: "Photo studio",
  jewelry: "Jeweler", jeweller: "Jeweler", watchmaker: "Watch repair",
  electronics: "Electronics", computer: "Computer repair",
  mobile_phone: "Phone repair", bicycle: "Bike shop", motorcycle: "Motorcycle shop",
  bookmaker: "Bookmaker", books: "Bookstore", stationery: "Stationery",
  gift: "Gift shop", toys: "Toy store", variety_store: "Variety store",
  second_hand: "Second-hand store", charity: "Thrift store",
  travel_agency: "Travel agency", copyshop: "Print shop",
  funeral_directors: "Funeral home", storage_rental: "Storage",
  fitness_centre: "Gym", gym: "Gym", yoga: "Yoga studio", dance: "Dance studio",
};

export function humanizeCat(raw: string): string {
  const v = raw.toLowerCase();
  if (CAT_MAP[v]) return CAT_MAP[v];
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Amenity values worth screening (skip parking, benches, schools, ...).
export const AMENITY_KEEP = [
  "restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "dentist",
  "doctors", "clinic", "pharmacy", "veterinary", "car_wash", "car_repair",
  "driving_school", "childcare", "kindergarten",
];

// ── Overpass normalization ──────────────────────────────────────────────────
interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  timestamp?: string;
  tags?: Record<string, string>;
}

function websiteFromTags(t: Record<string, string>): string | null {
  const direct = t.website || t["contact:website"] || t.url || null;
  if (direct) return direct;
  // Social-only tags: the business chose a profile as its web presence.
  const soc =
    (t["contact:facebook"] && absolutize(t["contact:facebook"], "facebook.com")) ||
    (t.facebook && absolutize(t.facebook, "facebook.com")) ||
    (t["contact:instagram"] && absolutize(t["contact:instagram"], "instagram.com")) ||
    (t.instagram && absolutize(t.instagram, "instagram.com")) ||
    (t["contact:tiktok"] && absolutize(t["contact:tiktok"], "tiktok.com")) ||
    null;
  return soc;
}

function absolutize(v: string, host: string): string {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://www.${host}/${s.replace(/^@/, "").replace(/^\//, "")}`;
}

function yearFrom(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/\b(1[89]\d\d|20\d\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}

export function normalizeOverpass(
  elements: OverpassElement[],
  ctx: { city: string; checked?: Date },
): LeadRow[] {
  const out: LeadRow[] = [];
  const seen = new Set<string>();
  const cityShort = ctx.city.split(",")[0].trim();
  const now = ctx.checked ? ctx.checked.getTime() : Date.now();

  for (const el of elements) {
    const t = el.tags || {};
    const name = (t.name || "").trim();
    if (!name) continue;
    const rawCat = t.shop || t.craft || t.amenity || t.office || t.healthcare || "";
    if (!rawCat) continue;
    if (t.amenity && !t.shop && !t.craft && !t.office && !AMENITY_KEEP.includes(t.amenity)) continue;

    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(key)) continue; // collapse duplicate listings
    seen.add(key);

    const website = websiteFromTags(t);
    const { status, thirdKind } = classifyUrl(website);
    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;
    const addr = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ")
      || t["addr:full"] || "";
    const hood = t["addr:suburb"] || t["addr:neighbourhood"] || t["addr:quarter"]
      || t["addr:district"] || cityShort;
    const listedDays = el.timestamp
      ? Math.max(0, Math.round((now - Date.parse(el.timestamp)) / 86400000))
      : null;

    out.push({
      id: `${el.type}/${el.id}`,
      name,
      cat: humanizeCat(rawCat),
      addr,
      hood,
      city: ctx.city,
      phone: t.phone || t["contact:phone"] || t["contact:mobile"] || null,
      website: website || null,
      status,
      ...(thirdKind ? { thirdKind } : {}),
      statusNote: statusNoteFor(status, { url: website, source: "OpenStreetMap", checked: ctx.checked }),
      lat,
      lon,
      rev: null,
      rating: null,
      sinceYear: yearFrom(t.start_date),
      listedDays,
      sources: ["OpenStreetMap"],
      real: true,
      // A tagged URL (site or social) is positive evidence; a missing tag
      // is not evidence of a missing website.
      verified: status !== "none",
    });
  }
  return out;
}

// ── Google Places (New) merge ───────────────────────────────────────────────
export interface GooglePlaceLite {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  types?: string[];
  formattedAddress?: string;
}

export const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const GP_TYPE_SKIP = new Set(["point_of_interest", "establishment", "store", "food"]);

export function googleCat(types: string[] | undefined): string {
  const t = (types || []).find((x) => !GP_TYPE_SKIP.has(x));
  return t ? humanizeCat(t.replace(/_shop$|_store$/, "")) : "Business";
}

// Fold Google nearby results into OSM rows (rating / review count / URL), and
// append Google-only businesses OSM has not mapped yet.
export function mergeGoogleNearby(rows: LeadRow[], places: GooglePlaceLite[], ctx: { city: string; checked?: Date }): LeadRow[] {
  const byKey = new Map<string, LeadRow>();
  for (const r of rows) byKey.set(nameKey(r.name), r);
  const cityShort = ctx.city.split(",")[0].trim();

  for (const p of places) {
    const nm = p.displayName?.text || "";
    if (!nm) continue;
    const k = nameKey(nm);
    const hit = byKey.get(k);
    if (hit) {
      if (p.rating != null) hit.rating = p.rating;
      if (p.userRatingCount != null) hit.rev = p.userRatingCount;
      if (!hit.phone && p.nationalPhoneNumber) hit.phone = p.nationalPhoneNumber;
      if (!hit.website && p.websiteUri) {
        hit.website = p.websiteUri;
        const c = classifyUrl(p.websiteUri);
        hit.status = c.status;
        if (c.thirdKind) hit.thirdKind = c.thirdKind; else delete hit.thirdKind;
        hit.statusNote = statusNoteFor(c.status, { url: p.websiteUri, source: "Google", checked: ctx.checked });
      } else if (hit.status === "none") {
        // Google confirms there is no listed site either.
        hit.statusNote = statusNoteFor("none", { url: null, source: "Google or OpenStreetMap", checked: ctx.checked });
      }
      if (!hit.sources.includes("Google Places")) hit.sources.push("Google Places");
      hit.verified = true; // Google listing confirms presence or absence
    } else {
      const { status, thirdKind } = classifyUrl(p.websiteUri);
      const street = (p.formattedAddress || "").split(",")[0].trim();
      byKey.set(k, {
        id: `gp:${p.id || k}`,
        name: nm,
        cat: googleCat(p.types),
        addr: street,
        hood: cityShort,
        city: ctx.city,
        phone: p.nationalPhoneNumber || null,
        website: p.websiteUri || null,
        status,
        ...(thirdKind ? { thirdKind } : {}),
        statusNote: statusNoteFor(status, { url: p.websiteUri, source: "Google listing", checked: ctx.checked }),
        lat: p.location?.latitude ?? null,
        lon: p.location?.longitude ?? null,
        rev: p.userRatingCount ?? null,
        rating: p.rating ?? null,
        sinceYear: null,
        listedDays: null,
        sources: ["Google Places"],
        real: true,
        verified: true,
      });
    }
  }
  return Array.from(byKey.values());
}

// ── Tiny in-memory TTL cache (per server instance) ──────────────────────────
const store = new Map<string, { at: number; ttl: number; val: unknown }>();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.at > e.ttl) { store.delete(key); return null; }
  return e.val as T;
}

export function cacheSet(key: string, val: unknown, ttlMs: number): void {
  if (store.size > 500) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    for (const [k] of oldest) store.delete(k);
  }
  store.set(key, { at: Date.now(), ttl: ttlMs, val });
}
