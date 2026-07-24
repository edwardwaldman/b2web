import { NextRequest, NextResponse } from "next/server";
import {
  LeadRow, GooglePlaceLite, normalizeOverpass, mergeGoogleNearby, isOpenGoogle,
} from "@/lib/leads";
import {
  areaKey, getCache, setCache, bumpRequest, fulfillRequest,
  isAdminRequest, adminGateEnabled, subscribeRequest, notifyFulfilled,
} from "@/lib/store";
import { notifyByEmail } from "@/lib/email";

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
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
].filter(Boolean) as string[];
// The shared cache persists until an admin re-crawls the area. A forced
// admin re-crawl (fresh=1) is honored at most once per 2 minutes per area;
// inside that window the cache answers.
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

// Per-user daily cap on live crawls for the Ultra tier. The Owner (admin key)
// is uncapped; Pro and Free never crawl at all (their requests are queued).
// Tracked in-process per identity/day — same pragmatic model as the budget
// above: it shapes honest traffic, and the global DAILY_BUDGET still hard-caps
// total spend regardless of how many identities claim Ultra. Raise the cap
// with ULTRA_DAILY_CALLS.
const ULTRA_DAILY_CALLS = Math.max(1, parseInt(process.env.ULTRA_DAILY_CALLS || "", 10) || 2);
const ultraDay = { day: "", by: new Map<string, number>() };
function ultraUsed(id: string): number {
  const today = new Date().toISOString().slice(0, 10);
  if (ultraDay.day !== today) { ultraDay.day = today; ultraDay.by = new Map(); }
  return ultraDay.by.get(id) || 0;
}
function ultraRemaining(id: string): number {
  return Math.max(0, ULTRA_DAILY_CALLS - ultraUsed(id));
}
function ultraBump(id: string): void {
  ultraDay.by.set(id, ultraUsed(id) + 1);
}

// Refreshing an area you're already viewing is a separate action from
// requesting a NEW area: Ultra may re-crawl the current cache on demand, but
// no faster than once every ULTRA_REFRESH_MIN minutes (per user), and it does
// NOT draw down the daily new-area cap above. Authoritative server throttle so
// it can't be beaten by editing the client. In-process, like the counters above.
const ULTRA_REFRESH_MIN = Math.max(1, parseInt(process.env.ULTRA_REFRESH_MINUTES || "", 10) || 10);
const ULTRA_REFRESH_MS = ULTRA_REFRESH_MIN * 60 * 1000;
const ultraRefreshAt = new Map<string, number>();
function ultraRefreshAllowed(id: string): boolean {
  return Date.now() - (ultraRefreshAt.get(id) || 0) >= ULTRA_REFRESH_MS;
}
function ultraRefreshMark(id: string): void {
  ultraRefreshAt.set(id, Date.now());
}

// ── Caller identity / entitlement ───────────────────────────────────────────
// A live crawl is billable, so authorizing it on a client-supplied `tier` param
// alone would let anyone spend the Google budget. For the Ultra tier we instead
// verify the caller's Supabase session server-side and read their REAL tier
// from the profiles table (the authoritative, webhook-set column). The Owner
// path stays gated by the separate admin secret (x-admin-key).
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function normTier(v: unknown): string {
  // Mirror utils/profile.ts: both legacy paid ids collapse to 'pro', never 'ultra'.
  if (v === "ultra" || v === "pro" || v === "free") return v;
  if (v === "starter" || v === "unlimited") return "pro";
  return "free";
}

// Returns { id, tier } for a valid Bearer session token, else null. Uses the
// caller's OWN token to read their profile row (RLS permits reading self), so
// no service-role key is required.
async function verifyCaller(req: Request): Promise<{ id: string; tier: string } | null> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  if (!token || !SB_URL || !SB_ANON) return null;
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!ur.ok) return null;
    const user = (await ur.json()) as { id?: string };
    if (!user?.id) return null;
    const pr = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=tier&limit=1`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) },
    );
    if (!pr.ok) return { id: user.id, tier: "free" };
    const rows = (await pr.json()) as { tier?: string }[];
    return { id: user.id, tier: normTier(rows?.[0]?.tier) };
  } catch { return null; }
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
      if (!isOpenGoogle(p)) continue; // drop permanently- and temporarily-closed
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
  const email = (sp.get("email") || "").slice(0, 200);
  const tier = (sp.get("tier") || "").toLowerCase();
  const adminReq = isAdminRequest(req);
  // The Owner: uncapped crawls. Require BOTH a valid admin request AND an
  // explicit tier=owner, so that on an ungated deployment (ADMIN_SECRET unset,
  // where isAdminRequest is true for everyone) a Free/Pro visitor still can't
  // crawl — only a client acting as the Owner sends tier=owner.
  const owner = tier === "owner" && adminReq;
  // Ultra authorization needs a Supabase round-trip, so it's resolved lazily
  // (never on the hot cache-hit read path). A forced refresh has to know the
  // caller's tier BEFORE the cache-serve decision, so resolveUltra is also
  // called eagerly in that case. It's idempotent — safe to call more than once.
  //
  // Authorization comes from the VERIFIED session, never the client's tier
  // param: a request only earns a live crawl if the signed-in user's real
  // profile tier is 'ultra'. (The one exception is the owner QA'ing the Ultra
  // experience: a valid admin key on a gated deployment.)
  let ultra = false, ultraLeft = 0, meterId = "", ultraResolved = false;
  const resolveUltra = async () => {
    if (ultraResolved) return;
    ultraResolved = true;
    if (owner || tier !== "ultra") return;
    const caller = await verifyCaller(req);
    const isRealUltra = caller?.tier === "ultra";
    const isOwnerTest = adminGateEnabled && adminReq; // operator previewing Ultra
    if (isRealUltra || isOwnerTest) {
      meterId = caller?.id || (isOwnerTest ? "owner-test" : "");
      if (meterId) { ultra = true; ultraLeft = ultraRemaining(meterId); }
    }
  };

  const key = areaKey(lat, lon, radius, includeSites);
  const slim = (payload: { rows: LeadRow[]; [k: string]: unknown }) =>
    ({ ...payload, cached: true, rows: payload.rows.slice(0, limit), count: Math.min(payload.rows.length, limit) });

  // 1) Shared cache. Anyone may READ it. Serve it unless this is an authorized
  //    forced re-crawl of an already-cached area:
  //    · Owner — any time (subject to the 2-min per-area cooldown).
  //    · Ultra — the "Refresh" action: re-crawl the area they're viewing, at
  //      most once every ULTRA_REFRESH_MIN minutes per user. This is a SEPARATE
  //      limit from the daily new-area cap, so a refresh never costs a daily
  //      call. (fresh=1 is only ever sent by the Owner/Ultra refresh action.)
  //    A cached-but-EMPTY row (rows: []) is treated as a miss, not a hit.
  const cached = await getCache(key);
  const cachedPayload = cached?.payload as { checkedAt?: string; rows?: LeadRow[] } | undefined;
  const hasCachedRows = !!cachedPayload?.rows?.length;
  if (fresh) await resolveUltra();
  const isRefresh = fresh && hasCachedRows; // re-crawl of an area already cached
  if (hasCachedRows) {
    const fresherThanCooldown = cached && Date.now() - Date.parse(cached.checked_at) < FRESH_COOLDOWN_MS;
    const ownerRecrawl = fresh && owner && !fresherThanCooldown;
    const ultraRecrawl = fresh && ultra && !fresherThanCooldown && ultraRefreshAllowed(meterId);
    if (!(ownerRecrawl || ultraRecrawl)) {
      return NextResponse.json(slim(cachedPayload as { rows: LeadRow[] }));
    }
    // Committing to a re-crawl: stamp the Ultra refresh throttle now so rapid
    // re-clicks (or a spoofed client) can't beat the once-per-window limit.
    if (ultraRecrawl) ultraRefreshMark(meterId);
  }

  // 2) Cache miss (or an authorized forced refresh). Resolve Ultra (no-op if
  //    already done) and decide who may spend a billable crawl. Everyone who
  //    can't — Pro, Free, anonymous, or an Ultra user out of daily calls on a
  //    NEW area — has the area queued so the owner sees demand and requesters
  //    are notified once it's loaded.
  await resolveUltra();
  // Owner: always. Ultra: for a refresh, regardless of the daily cap (it's
  // throttled separately above); for a NEW area, only while under the daily
  // cap. Budget must remain either way.
  const canCrawl = owner || (ultra && budgetLeft() > 0 && (isRefresh || ultraLeft > 0));

  if (!canCrawl) {
    const requests = await bumpRequest({ key, label: city || null, lat, lon, radius });
    // Remember a signed-in requester so they can be notified on load.
    if (email) await subscribeRequest(key, email);
    // An Ultra user who's out of THEIR daily calls is a distinct case: tell
    // them so. (If instead the global budget is spent, fall through to the
    // generic "you'll be notified" message — they haven't used their calls.)
    const ultraCapped = ultra && ultraLeft <= 0;
    const message = ultraCapped
      ? `You've used your ${ULTRA_DAILY_CALLS} live crawls for today. This area is queued — you'll be notified when it's ready, or try again tomorrow.`
      : "This area isn't loaded yet. You'll be notified when it's ready.";
    return NextResponse.json({
      ok: true,
      cached: false,
      pending: true,
      gated: adminGateEnabled,
      tier: tier || null,
      ultraLimited: ultraCapped,
      ultraRemaining: ultra ? ultraLeft : undefined,
      requests,
      label: city || null,
      lat, lon, radiusM: radius,
      rows: [],
      count: 0,
      message,
    }, { status: 200 });
  }

  // 3) Crawl path (Owner or an authorized Ultra user with calls left). The
  //    Ultra daily counter is bumped only once we actually return fresh data
  //    (see the final response), so a transient failure or empty area doesn't
  //    silently burn one of their two crawls.
  const checked = new Date();
  const ctx = { city: city || "Your area", checked };
  const googleFirst = !!process.env.GOOGLE_PLACES_API_KEY;

  let rows: LeadRow[] = [];
  let source = "";
  if (googleFirst) {
    // Google is authoritative. When a key is configured we never fall back to
    // OpenStreetMap — OSM can't tell open from closed or confirm a missing
    // website, so it surfaces chains-with-sites as false "no website" leads.
    // If Google is momentarily unavailable (budget spent / transient) we serve
    // the cached snapshot; otherwise an honest empty result, never OSM.
    const places = await fetchGoogleNearby(lat, lon, radius);
    if (places.length) {
      rows = mergeGoogleNearby([], places, ctx);
      source = "Google Places";
    } else if (hasCachedRows) {
      return NextResponse.json(slim(cachedPayload as { rows: LeadRow[] }));
    } else {
      source = "Google Places"; // scanned, no leads (or Google briefly empty)
    }
  } else {
    // Keyless deployments only: OpenStreetMap inventory.
    let elements;
    try {
      elements = await fetchOverpass(lat, lon, radius);
    } catch (e) {
      if (hasCachedRows) return NextResponse.json(slim(cachedPayload as { rows: LeadRow[] }));
      return NextResponse.json(
        { ok: false, error: `Business data source unreachable: ${e instanceof Error ? e.message : "unknown"}` },
        { status: 502 },
      );
    }
    rows = normalizeOverpass(elements, ctx);
    source = "OpenStreetMap";
  }

  const total = rows.length;
  const ord = { none: 0, third: 1, site: 2 } as const;
  const leadRows = rows.filter((r) => r.status !== "site")
    .sort((a, b) => ord[a.status] - ord[b.status] || (b.rev ?? -1) - (a.rev ?? -1) || a.name.localeCompare(b.name));
  const siteRows = rows.filter((r) => r.status === "site")
    .sort((a, b) => (b.rev ?? -1) - (a.rev ?? -1) || a.name.localeCompare(b.name));

  // Leads first, always. In a thin area the no-website leads are few, so the
  // list is padded with the top has-site businesses (clearly labeled "Has
  // site") up to PAD_TARGET so the page doesn't look empty. all=1 returns
  // every business; the "No website only" filter hides the padding.
  const PAD_TARGET = 20;
  const padCount = Math.max(0, PAD_TARGET - leadRows.length);
  rows = (includeSites ? leadRows.concat(siteRows) : leadRows.concat(siteRows.slice(0, padCount))).slice(0, MAX_ROWS);

  const payload = {
    ok: true,
    source,
    googleConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
    googleEnriched: source === "Google Places",
    unverified: source !== "Google Places",
    checkedAt: checked.toISOString(),
    lat, lon, radiusM: radius,
    scanned: total,
    count: rows.length,
    leads: leadRows.length,
    padded: rows.filter((r) => r.status === "site").length, // has-site fillers, declared as such
    rows,
  };
  // Anti-clobber: never replace good saved data with a worse crawl. If the
  // API budget ran out (empty Google result) or this fell back to OSM while a
  // Google snapshot is already saved, keep the good one — the whole point of
  // saving is that a bad refresh can't wipe it.
  const prev = cachedPayload as { rows?: LeadRow[]; source?: string } | undefined;
  const prevGood = !!(prev?.rows?.length);
  const newEmpty = rows.length === 0;
  const downgrade = prev?.source === "Google Places" && source !== "Google Places";
  if (prevGood && (newEmpty || downgrade)) {
    return NextResponse.json(slim(prev as { rows: LeadRow[] }));
  }

  // Never persist an EMPTY crawl. An empty Google result is almost always
  // transient (daily budget spent, a momentary API hiccup, or a radius that's
  // too tight) rather than a true "this area has nothing". Caching it would
  // make the emptiness sticky — every later view would serve zero rows and no
  // future crawl would re-attempt (the area looks "cached"). Instead we return
  // the empty result without saving, so the next owner/Ultra crawl tries again.
  if (newEmpty) {
    // No fresh data, so no Ultra call is spent — report their unchanged balance.
    return NextResponse.json({ ...payload, cached: false, saved: false, ultraRemaining: ultra ? ultraLeft : undefined,
      message: "No businesses came back for this area just now (the data source may be rate-limited). It wasn't cached — try again shortly or widen the radius." });
  }

  // Persist to the shared cache for everyone, clear this area from the request
  // queue, and notify everyone who asked for it (in-app + email).
  await setCache({ key, label: city || null, lat, lon, radius, source, payload, checked_at: checked.toISOString() });
  await fulfillRequest(key);
  try {
    const emails = await notifyFulfilled(key, city || null);
    if (emails.length) await notifyByEmail(emails, city || "your requested area", req.nextUrl.origin);
  } catch { /* notification failures never block a crawl */ }
  // Fresh data is going back — count the Ultra user's live crawl, but ONLY for
  // a new area. A refresh of an already-cached area is throttled by its own
  // per-user window (step 1) and never draws down the daily new-area cap.
  if (ultra && !isRefresh) ultraBump(meterId);
  return NextResponse.json({ ...payload, cached: false, ultraRemaining: ultra ? ultraRemaining(meterId) : undefined, rows: rows.slice(0, limit), count: Math.min(rows.length, limit) });
}
