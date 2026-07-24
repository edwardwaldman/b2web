// Built-in "always available" snapshot of the default Lowell, MA area.
//
// This is a real, hand-saved snapshot (captured 2026-07-24) of the businesses
// an owner crawl of Lowell returns. It is served by getCache() ONLY when the
// durable/in-memory cache has nothing for the Lowell default key, so a free /
// logged-out visitor opening Lowell sees these example businesses instantly,
// with NO crawl and no dependency on the Supabase tables being set up. An
// owner or Ultra crawl still overwrites it (getCache prefers a real durable
// row), so the seed only ever acts as a floor — the "no crawl" default view.

import type { CacheRow } from "@/lib/store";
import type { LeadRow, WebStatus } from "@/lib/leads";

// When this snapshot was saved. Shown in the UI as "checked <ago>".
export const SEED_CHECKED_AT = "2026-07-24T08:28:51Z";

const CITY = "Lowell, MA";
const HOOD = "Lowell";

// The default Lowell view: areaKey(42.6334, -71.3162, 4000, includeSites=false).
export const LOWELL_SEED_KEY = "42.63:-71.32:4000:leads";

let n = 0;
function mk(
  name: string, cat: string, addr: string, phone: string,
  rev: number, rating: number, status: WebStatus, thirdKind?: string,
): LeadRow {
  n += 1;
  return {
    id: `seed:lowell:${n}`,
    name, cat, addr, hood: HOOD, city: CITY,
    phone, website: null, status,
    ...(thirdKind ? { thirdKind } : {}),
    statusNote:
      status === "none" ? "No website is listed on the business's Google profile."
      : status === "third" ? `Only a ${thirdKind} page is listed — no standalone website.`
      : "A standalone website is listed on the business's Google profile.",
    lat: null, lon: null,
    rev, rating,
    sinceYear: null, listedDays: null,
    sources: ["Google Places"],
    real: true, enriched: true, verified: true,
  };
}

// Order as captured: no-website leads first (by reviews), then the social-only
// lead, then has-site businesses used to pad out the area.
const ROWS: LeadRow[] = [
  // No website
  mk("J&C Barber shop", "Barber shop", "382 Broadway St", "(978) 328-4254", 152, 4.7, "none"),
  mk("JP HAIR STYLE", "Barber shop", "933 Gorham St", "(978) 483-1785", 141, 4.9, "none"),
  mk("Vibes Salon", "Hair salon", "1126 Middlesex St", "(978) 455-8239", 123, 4.1, "none"),
  mk("Home Team Haircuts", "Hair salon", "83 Parkhurst Rd", "(978) 677-6716", 91, 4.7, "none"),
  mk("The Threading Hub", "Beauty salon", "1717 Middlesex St STE 4", "(978) 429-5613", 84, 4.8, "none"),
  mk("Shin Shin Spa", "Massage spa", "635 Rogers St STE 11", "(978) 759-9905", 38, 3.8, "none"),
  mk("Purple Blossom Spa and Body Works", "Spa", "1527 Middlesex St #3", "(929) 300-4833", 22, 3.6, "none"),
  // Social-only
  mk("Dep Beauty Salon", "Hair salon", "302 Westford St", "(978) 454-1022", 118, 4.6, "third", "Facebook"),
  // Has site (padding)
  mk("Walmart Supercenter", "Department", "333 Main St", "(978) 851-6265", 5300, 4.1, "site"),
  mk("Atamian Honda", "Auto repair", "150 Main St", "(978) 662-8960", 4632, 4.7, "site"),
  mk("McGovern Ford of Lowell", "Auto repair", "1212 Westford St", "(978) 452-3900", 2700, 4.7, "site"),
  mk("Tavern in the Square", "Restaurant", "Cross Point", "(978) 970-3870", 2521, 4.2, "site"),
  mk("495 Chrysler Jeep Dodge Ram", "Car dealer", "732 Rogers St", "(978) 636-1900", 2316, 4.5, "site"),
  mk("Applebee's Grill + Bar", "Restaurant", "85 Main St", "(978) 858-0418", 1929, 4.0, "site"),
  mk("McDonald's", "Fast food restaurant", "66 Plain St", "(978) 970-5531", 1919, 3.7, "site"),
  mk("Outback Steakhouse", "Steak house", "28 Reiss Ave", "(978) 934-8700", 1829, 4.1, "site"),
  mk("Feng Shui Sushi Hibachi Lounge", "Asian restaurant", "285 Chelmsford St", "(978) 250-8888", 1723, 4.3, "site"),
  mk("Chili's Grill & Bar", "Restaurant", "26 Reiss Ave", "(978) 937-1565", 1504, 4.2, "site"),
  mk("China Star Dim Sum Lounge", "Dim sum restaurant", "1733 Middlesex St", "(978) 856-7780", 1454, 4.1, "site"),
  mk("Pho 88 Restaurant", "Vietnamese restaurant", "1270 Westford St", "(978) 452-7300", 1405, 4.3, "site"),
];

const leads = ROWS.filter((r) => r.status !== "site").length;
const padded = ROWS.filter((r) => r.status === "site").length;

const LOWELL_SEED: CacheRow = {
  key: LOWELL_SEED_KEY,
  label: CITY,
  lat: 42.6334, lon: -71.3162, radius: 4000,
  source: "Google Places",
  payload: {
    ok: true,
    source: "Google Places",
    googleConfigured: true,
    googleEnriched: true,
    unverified: false,
    seed: true, // this snapshot was saved directly, not crawled on demand
    checkedAt: SEED_CHECKED_AT,
    lat: 42.6334, lon: -71.3162, radiusM: 4000,
    scanned: ROWS.length,
    count: ROWS.length,
    leads,
    padded,
    rows: ROWS,
  },
  checked_at: SEED_CHECKED_AT,
};

const SEED_BY_KEY: Record<string, CacheRow> = {
  [LOWELL_SEED_KEY]: LOWELL_SEED,
};

// Returns a saved snapshot for this area key, or null if none is seeded.
export function seedFor(key: string): CacheRow | null {
  return SEED_BY_KEY[key] || null;
}
