import { NextRequest, NextResponse } from "next/server";
import { classifyUrl, statusNoteFor, checkedLabel, nameKey, cacheGet, cacheSet, LeadReview, WebStatus } from "@/lib/leads";

// GET /api/enrich?name=..&lat=..&lon=..&city=..&state=CA&website=..
//
// Per-business enrichment, fired when a row is opened in the detail pane:
// · Google Places (New) text search  -> rating, review count, up to 5 real
//   reviews, listed URL, phone           (needs GOOGLE_PLACES_API_KEY)
// · OpenCorporates company search    -> registration year ("listed since")
//   (free tier; OPENCORPORATES_API_TOKEN raises the rate limit)
// · Live URL check                   -> we fetch the listed URL ourselves and
//   classify what actually responds (site vs Facebook/Linktree redirect)
// Everything is optional: whatever succeeds is returned and merged client-side.

export const dynamic = "force-dynamic";

const TTL_MS = 6 * 60 * 60 * 1000; // a business's registry data moves slowly

// Per-instance daily budget for billable Google text searches. Once spent,
// enrichment still runs the free parts (registry match + live URL check).
const DAILY_BUDGET = Math.max(10, parseInt(process.env.GOOGLE_ENRICH_DAILY_BUDGET || "", 10) || 300);
const budget = { day: "", used: 0 };
function budgetLeft(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) { budget.day = today; budget.used = 0; }
  return DAILY_BUDGET - budget.used;
}

interface GoogleDetail {
  rating: number | null;
  rev: number | null;
  website: string | null;
  phone: string | null;
  reviews: LeadReview[];
  mapsUri: string | null;
  closed: boolean;
}

async function googleDetails(name: string, locHint: string, lat: number | null, lon: number | null): Promise<GoogleDetail | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || budgetLeft() <= 0) return null;
  budget.used += 1;
  try {
    const body: Record<string, unknown> = {
      textQuery: `${name} ${locHint}`.trim(),
      maxResultCount: 1,
    };
    if (lat != null && lon != null) {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 2000 } };
    }
    const base = process.env.GOOGLE_PLACES_URL || "https://places.googleapis.com";
    const r = await fetch(`${base}/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.id", "places.displayName", "places.rating", "places.userRatingCount",
          "places.websiteUri", "places.nationalPhoneNumber", "places.reviews",
          "places.googleMapsUri", "places.businessStatus",
        ].join(","),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j.places?.[0];
    if (!p) return null;
    // Text search can wander; only accept a confident name match.
    const got = nameKey(p.displayName?.text || "");
    const want = nameKey(name);
    if (!got || !(got.includes(want) || want.includes(got))) return null;
    const reviews: LeadReview[] = (p.reviews || []).map((rv: {
      rating?: number; relativePublishTimeDescription?: string;
      text?: { text?: string }; authorAttribution?: { displayName?: string };
    }) => ({
      author: rv.authorAttribution?.displayName || "Google user",
      stars: Math.max(1, Math.min(5, Math.round(rv.rating || 5))),
      when: rv.relativePublishTimeDescription || "",
      body: rv.text?.text || "",
    })).filter((rv: LeadReview) => rv.body);
    return {
      rating: p.rating ?? null,
      rev: p.userRatingCount ?? null,
      website: p.websiteUri || null,
      phone: p.nationalPhoneNumber || null,
      reviews,
      mapsUri: p.googleMapsUri || null,
      closed: !!p.businessStatus && p.businessStatus !== "OPERATIONAL",
    };
  } catch { return null; }
}

async function registryYear(name: string, state: string | null): Promise<{ year: number; company: string; jurisdiction: string } | null> {
  try {
    const juris = state && /^[A-Za-z]{2}$/.test(state) ? `us_${state.toLowerCase()}` : "";
    const token = process.env.OPENCORPORATES_API_TOKEN;
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(name)}`
      + (juris ? `&jurisdiction_code=${juris}` : "")
      + `&order=score&per_page=5`
      + (token ? `&api_token=${token}` : "");
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const companies: Array<{ company?: { name?: string; incorporation_date?: string; jurisdiction_code?: string } }> =
      j?.results?.companies || [];
    const want = nameKey(name);
    for (const c of companies) {
      const co = c.company;
      if (!co?.incorporation_date) continue;
      const got = nameKey(co.name || "");
      if (!(got.includes(want) || want.includes(got))) continue;
      const year = parseInt(co.incorporation_date.slice(0, 4), 10);
      if (Number.isFinite(year)) return { year, company: co.name || name, jurisdiction: co.jurisdiction_code || juris };
    }
    return null;
  } catch { return null; }
}

async function liveSiteCheck(url: string): Promise<{ ok: boolean; httpStatus: number | null; finalUrl: string | null }> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const r = await fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; b2web-sitecheck/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, httpStatus: r.status, finalUrl: r.url || target };
  } catch {
    return { ok: false, httpStatus: null, finalUrl: null };
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = (sp.get("name") || "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  const lat = parseFloat(sp.get("lat") || "");
  const lon = parseFloat(sp.get("lon") || "");
  const city = (sp.get("city") || "").slice(0, 80);
  const state = (sp.get("state") || "").slice(0, 20) || null;
  const listedWebsite = (sp.get("website") || "").slice(0, 500) || null;

  const cacheKey = `enrich:${nameKey(name)}:${city}`;
  const hit = cacheGet<object>(cacheKey);
  if (hit) return NextResponse.json(hit);

  const [google, registry] = await Promise.all([
    googleDetails(name, city, Number.isFinite(lat) ? lat : null, Number.isFinite(lon) ? lon : null),
    registryYear(name, state),
  ]);

  // Verify whatever URL we now believe in. A "site" that 404s or redirects to
  // a Facebook page flips the classification; that is the whole product.
  const checked = new Date();
  const url = google?.website || listedWebsite;
  let statusPatch: { status: WebStatus; thirdKind?: string; statusNote: string } | null = null;
  let siteCheck: Awaited<ReturnType<typeof liveSiteCheck>> | null = null;
  if (url) {
    siteCheck = await liveSiteCheck(url);
    const judged = classifyUrl(siteCheck.finalUrl || url);
    if (judged.status === "site" && siteCheck.httpStatus != null && !siteCheck.ok) {
      statusPatch = {
        status: "none",
        statusNote: `Listed URL is dead (HTTP ${siteCheck.httpStatus}). Effectively no website. Checked ${checkedLabel(checked)}`,
      };
    } else {
      statusPatch = {
        ...judged,
        statusNote: judged.status === "site" && siteCheck.ok
          ? `Standalone site responded OK. Checked ${checkedLabel(checked)}`
          : statusNoteFor(judged.status, { url: siteCheck.finalUrl || url, source: "listed URL check", checked }),
      };
    }
  } else if (google) {
    statusPatch = {
      status: "none",
      statusNote: `No URL on its Google listing or OSM record. Checked ${checkedLabel(checked)}`,
    };
  }

  const sources: string[] = [];
  if (google) sources.push("Google Places");
  if (registry) sources.push("OpenCorporates registry");
  if (siteCheck) sources.push("Live URL check");

  const payload = {
    ok: true,
    checkedAt: checked.toISOString(),
    rating: google?.rating ?? null,
    rev: google?.rev ?? null,
    reviews: google?.reviews ?? [],
    website: url,
    phone: google?.phone ?? null,
    mapsUri: google?.mapsUri ?? null,
    sinceYear: registry?.year ?? null,
    registry,
    siteCheck,
    statusPatch,
    closed: google?.closed ?? false, // Google says the business is not operational
    sources,
    googleConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
  };
  cacheSet(cacheKey, payload, TTL_MS);
  return NextResponse.json(payload);
}
