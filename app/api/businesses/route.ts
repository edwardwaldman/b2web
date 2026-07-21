import { NextRequest, NextResponse } from "next/server";
import {
  LeadRow, GooglePlaceLite, normalizeOverpass, mergeGoogleNearby,
  cacheGet, cacheSet,
} from "@/lib/leads";

// GET /api/businesses?lat=37.7749&lon=-122.4194&radius=4000[&fresh=1][&all=1]
//
// Real businesses only, no demo rows anywhere in the pipeline.
// · With GOOGLE_PLACES_API_KEY set, the inventory comes straight from Google
//   Places (New) nearby searches across the lead categories: real names,
//   ratings, review counts, phones, addresses, and each listing's URL (or the
//   absence of one), classified into No website / social-only / has site.
// · Without a key, OpenStreetMap via Overpass supplies the inventory (still
//   real businesses, but no ratings until a row is enriched).
// · Default output is leads only: businesses with NO standalone website
//   (none or social-profile-only). Pass all=1 to include has-site rows.
// Results are cached in memory for 10 minutes per location; fresh=1 bypasses.

export const dynamic = "force-dynamic";

// OVERPASS_URL lets a deployment point at a self-hosted or commercial
// Overpass instance; the public mirrors are the default.
const OVERPASS_URLS = [
  process.env.OVERPASS_URL,
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
].filter(Boolean) as string[];
const TTL_MS = 10 * 60 * 1000;
const MAX_ROWS = 400;

function overpassQuery(lat: number, lon: number, radius: number): string {
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:30];
(
  nwr["name"]["shop"]${around};
  nwr["name"]["craft"]${around};
  nwr["name"]["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|dentist|doctors|clinic|pharmacy|veterinary|car_wash|car_repair|driving_school|childcare|kindergarten)$"]${around};
  nwr["name"]["office"~"^(accountant|tax_advisor|lawyer|insurance|estate_agent|architect|it|employment_agency)$"]${around};
  nwr["name"]["healthcare"~"^(dentist|physiotherapist|chiropractor|clinic)$"]${around};
);
out center meta ${MAX_ROWS + 200};`;
}

async function fetchOverpass(lat: number, lon: number, radius: number) {
  const body = "data=" + encodeURIComponent(overpassQuery(lat, lon, radius));
  let lastErr: unknown = null;
  for (const url of OVERPASS_URLS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(35000),
      });
      if (!r.ok) { lastErr = new Error(`Overpass ${r.status}`); continue; }
      const j = await r.json();
      if (Array.isArray(j.elements)) return j.elements;
      lastErr = new Error("Overpass: malformed response");
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Overpass unreachable");
}

// Google Places (New) searchNearby returns at most 20 places per call, so the
// lead categories are swept in batches. Each batch is one billable request.
const GOOGLE_TYPE_BATCHES: string[][] = [
  ["hair_salon", "barber_shop", "beauty_salon", "nail_salon", "spa"],
  ["plumber", "electrician", "roofing_contractor", "locksmith", "painter", "general_contractor"],
  ["car_repair", "car_wash", "auto_parts_store"],
  ["restaurant", "cafe", "bakery", "bar"],
  ["laundry", "florist", "hardware_store", "shoe_store", "jewelry_store", "pet_store"],
  ["dentist", "veterinary_care", "physiotherapist", "chiropractor"],
];

async function fetchGoogleNearby(lat: number, lon: number, radius: number): Promise<GooglePlaceLite[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  const base = process.env.GOOGLE_PLACES_URL || "https://places.googleapis.com";
  const one = async (includedTypes: string[]): Promise<GooglePlaceLite[]> => {
    try {
      const r = await fetch(`${base}/v1/places:searchNearby`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": [
            "places.id", "places.displayName", "places.location", "places.rating",
            "places.userRatingCount", "places.websiteUri", "places.nationalPhoneNumber",
            "places.types", "places.formattedAddress", "places.businessStatus",
          ].join(","),
        },
        body: JSON.stringify({
          maxResultCount: 20,
          includedTypes,
          locationRestriction: {
            circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(radius, 50000) },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j.places) ? j.places : [];
    } catch { return []; }
  };
  const batches = await Promise.all(GOOGLE_TYPE_BATCHES.map(one));
  // Dedupe across batches by place id; drop permanently closed businesses.
  const seen = new Set<string>();
  const out: GooglePlaceLite[] = [];
  for (const p of batches.flat()) {
    const pid = p.id || p.displayName?.text || "";
    if (!pid || seen.has(pid)) continue;
    if ((p as { businessStatus?: string }).businessStatus === "CLOSED_PERMANENTLY") continue;
    seen.add(pid);
    out.push(p);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") || "");
  const lon = parseFloat(sp.get("lon") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ ok: false, error: "lat and lon are required" }, { status: 400 });
  }
  const radius = Math.min(20000, Math.max(500, parseInt(sp.get("radius") || "4000", 10) || 4000));
  const city = (sp.get("city") || "").slice(0, 80);
  const fresh = sp.get("fresh") === "1";
  const includeSites = sp.get("all") === "1";

  const cacheKey = `biz:${lat.toFixed(3)}:${lon.toFixed(3)}:${radius}:${city}:${includeSites ? 1 : 0}`;
  if (!fresh) {
    const hit = cacheGet<object>(cacheKey);
    if (hit) return NextResponse.json(hit);
  }

  const checked = new Date();
  const ctx = { city: city || "Your area", checked };
  const googleFirst = !!process.env.GOOGLE_PLACES_API_KEY;

  let rows: LeadRow[] = [];
  let source = "";
  if (googleFirst) {
    const places = await fetchGoogleNearby(lat, lon, radius);
    if (places.length) {
      rows = mergeGoogleNearby([], places, ctx);
      source = "Google Places";
    }
  }
  if (!rows.length) {
    // Keyless (or Google returned nothing): OpenStreetMap inventory.
    let elements;
    try {
      elements = await fetchOverpass(lat, lon, radius);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `Business data source unreachable: ${e instanceof Error ? e.message : "unknown"}` },
        { status: 502 },
      );
    }
    rows = normalizeOverpass(elements, ctx);
    source = "OpenStreetMap";
  }

  const total = rows.length;
  // The product is businesses with no standalone website. "site" rows are
  // dropped unless explicitly requested.
  if (!includeSites) rows = rows.filter((r) => r.status !== "site");

  const ord = { none: 0, third: 1, site: 2 } as const;
  rows.sort((a, b) =>
    ord[a.status] - ord[b.status] || (b.rev ?? -1) - (a.rev ?? -1) || a.name.localeCompare(b.name));
  rows = rows.slice(0, MAX_ROWS);

  const payload = {
    ok: true,
    source,
    googleEnriched: source === "Google Places",
    checkedAt: checked.toISOString(),
    lat, lon, radiusM: radius,
    scanned: total,
    count: rows.length,
    leads: rows.filter((r) => r.status !== "site").length,
    rows,
  };
  cacheSet(cacheKey, payload, TTL_MS);
  return NextResponse.json(payload);
}
