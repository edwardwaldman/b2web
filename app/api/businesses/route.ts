import { NextRequest, NextResponse } from "next/server";
import {
  LeadRow, GooglePlaceLite, normalizeOverpass, mergeGoogleNearby,
  cacheGet, cacheSet,
} from "@/lib/leads";

// GET /api/businesses?lat=..&lon=..&radius=4000[&fresh=1][&all=1][&limit=40]
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
// Google mode caches longer than free OSM mode: each crawl spends billable
// requests, so a snapshot is reused for 30 minutes (override with
// BUSINESSES_CACHE_TTL_MIN). A forced re-crawl (fresh=1) is honored at most
// once per 2 minutes per location; inside that window the cache answers.
const OSM_TTL_MS = 10 * 60 * 1000;
const GOOGLE_TTL_MS = (parseInt(process.env.BUSINESSES_CACHE_TTL_MIN || "", 10) || 30) * 60 * 1000;
const FRESH_COOLDOWN_MS = 2 * 60 * 1000;
const MAX_ROWS = 400;

// Google API spend controls. Batches are fetched sequentially and stop as
// soon as enough no-website leads are collected, so a lead-dense area costs
// 1-2 requests instead of the full sweep. A per-instance daily budget hard-
// stops billable calls; when it is spent, cached or OSM data answers.
const MAX_BATCHES = Math.min(6, Math.max(1, parseInt(process.env.GOOGLE_PLACES_MAX_BATCHES || "", 10) || 4));
const TARGET_LEADS = Math.max(20, parseInt(process.env.GOOGLE_PLACES_TARGET_LEADS || "", 10) || 40);
const DAILY_BUDGET = Math.max(10, parseInt(process.env.GOOGLE_PLACES_DAILY_BUDGET || "", 10) || 250);
const budget = { day: "", used: 0 };
function budgetLeft(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) { budget.day = today; budget.used = 0; }
  return DAILY_BUDGET - budget.used;
}

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
  if (!key || budgetLeft() <= 0) return [];
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
  // Sequential sweep with early exit: stop as soon as TARGET_LEADS
  // no-website leads are on hand, and never exceed the daily budget.
  const seen = new Set<string>();
  const out: GooglePlaceLite[] = [];
  let leads = 0;
  for (const types of GOOGLE_TYPE_BATCHES.slice(0, MAX_BATCHES)) {
    if (leads >= TARGET_LEADS || budgetLeft() <= 0) break;
    budget.used += 1;
    for (const p of await one(types)) {
      const pid = p.id || p.displayName?.text || "";
      if (!pid || seen.has(pid)) continue;
      if ((p as { businessStatus?: string }).businessStatus === "CLOSED_PERMANENTLY") continue;
      seen.add(pid);
      out.push(p);
      if (!p.websiteUri) leads += 1; // no listed URL = a lead for sure
    }
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
  const limit = Math.min(MAX_ROWS, Math.max(1, parseInt(sp.get("limit") || "", 10) || 120));

  const cacheKey = `biz:${lat.toFixed(3)}:${lon.toFixed(3)}:${radius}:${city}:${includeSites ? 1 : 0}`;
  const hit = cacheGet<{ checkedAt: string; rows: LeadRow[] }>(cacheKey);
  // Serve the cache unless a re-crawl is both requested and past its cooldown.
  if (hit && (!fresh || Date.now() - Date.parse(hit.checkedAt) < FRESH_COOLDOWN_MS)) {
    return NextResponse.json({ ...hit, rows: hit.rows.slice(0, limit), count: Math.min(hit.rows.length, limit) });
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
    } else if (hit) {
      // Budget spent or Google empty: a stale snapshot of real data beats
      // burning quota; serve it past its TTL rather than re-crawling.
      return NextResponse.json({ ...hit, rows: hit.rows.slice(0, limit), count: Math.min(hit.rows.length, limit) });
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
  cacheSet(cacheKey, payload, source === "Google Places" ? GOOGLE_TTL_MS : OSM_TTL_MS);
  return NextResponse.json({ ...payload, rows: rows.slice(0, limit), count: Math.min(rows.length, limit) });
}
