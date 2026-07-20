import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/leads";

// GET /api/geocode?lat=..&lon=..   -> reverse: city / state / neighborhood
// GET /api/geocode?q=Portland      -> forward: candidate places with coords
//
// Backed by OSM Nominatim (free). Their usage policy requires a descriptive
// User-Agent and light traffic, so responses are cached for an hour.

export const dynamic = "force-dynamic";

const UA = "b2web-screener/1.0 (https://b2web.site; hello@b2web.site)";
const TTL_MS = 60 * 60 * 1000;
// NOMINATIM_URL lets a deployment point at a self-hosted Nominatim (the
// public instance's usage policy asks heavy users to self-host).
const NOMINATIM_BASE = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

interface NomAddress {
  city?: string; town?: string; village?: string; municipality?: string;
  suburb?: string; neighbourhood?: string; quarter?: string;
  state?: string; country?: string; country_code?: string;
}

function labelFrom(a: NomAddress): { city: string | null; state: string | null; label: string | null; hood: string | null } {
  const city = a.city || a.town || a.village || a.municipality || null;
  const state = a.state || null;
  const stateShort = state ? (STATE_ABBR[state] || state) : null;
  const label = city ? (stateShort ? `${city}, ${stateShort}` : city) : null;
  const hood = a.neighbourhood || a.suburb || a.quarter || null;
  return { city, state: stateShort, label, hood };
}

async function nominatim(path: string): Promise<unknown> {
  const r = await fetch(`${NOMINATIM_BASE}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  return r.json();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim().slice(0, 120);
  const lat = parseFloat(sp.get("lat") || "");
  const lon = parseFloat(sp.get("lon") || "");

  try {
    if (q) {
      const key = `geo:q:${q.toLowerCase()}`;
      const hit = cacheGet<object>(key);
      if (hit) return NextResponse.json(hit);
      const j = (await nominatim(
        `/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&addressdetails=1`,
      )) as Array<{ lat: string; lon: string; display_name: string; address?: NomAddress }>;
      const results = (j || []).map((p) => {
        const parts = labelFrom(p.address || {});
        return {
          lat: parseFloat(p.lat), lon: parseFloat(p.lon),
          label: parts.label || p.display_name.split(",").slice(0, 2).join(",").trim(),
          displayName: p.display_name,
        };
      });
      const payload = { ok: true, results };
      cacheSet(key, payload, TTL_MS);
      return NextResponse.json(payload);
    }

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const key = `geo:r:${lat.toFixed(3)}:${lon.toFixed(3)}`;
      const hit = cacheGet<object>(key);
      if (hit) return NextResponse.json(hit);
      const j = (await nominatim(
        `/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=14&addressdetails=1`,
      )) as { display_name?: string; address?: NomAddress };
      const parts = labelFrom(j.address || {});
      const payload = {
        ok: true,
        city: parts.city, state: parts.state, hood: parts.hood,
        label: parts.label, displayName: j.display_name || null,
      };
      cacheSet(key, payload, TTL_MS);
      return NextResponse.json(payload);
    }

    return NextResponse.json({ ok: false, error: "Pass q= for search or lat=/lon= for reverse" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Geocoder unreachable: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 },
    );
  }
}
