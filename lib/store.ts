// Durable, shared cache + request queue for the location crawler.
//
// Vercel runs many stateless Lambda instances, so an in-process Map can't
// hold a cache that "stays for everyone" — a second user hits a different
// instance and sees nothing. This layer persists to Supabase (Postgres via
// its REST API) when SUPABASE_SERVICE_ROLE_KEY is set, so one admin crawl of
// an area is visible to every visitor afterward. Without that key it falls
// back to an in-process Map (fine for local dev / single instance).
//
// Two record types:
// · location_cache — a crawled area's full payload, keyed by rounded coords.
// · cache_requests — areas non-admins asked for but that aren't cached yet,
//   with a running count so the admin can see demand and crawl them.
//
// Setup (run once in the Supabase SQL editor):
//   create table if not exists location_cache (
//     key text primary key, label text,
//     lat double precision, lon double precision, radius integer,
//     source text, payload jsonb not null,
//     checked_at timestamptz not null default now()
//   );
//   create table if not exists cache_requests (
//     key text primary key, label text,
//     lat double precision, lon double precision, radius integer,
//     requests integer not null default 0, fulfilled boolean not null default false,
//     first_requested timestamptz not null default now(),
//     last_requested timestamptz not null default now()
//   );
//   create table if not exists request_subscribers (
//     key text, email text, notified boolean not null default false,
//     created_at timestamptz not null default now(), primary key (key, email)
//   );
//   create table if not exists notifications (
//     id bigint generated always as identity primary key,
//     email text not null, title text, body text, area_key text,
//     read boolean not null default false, created_at timestamptz not null default now()
//   );
//   -- The two business-data tables hold only public info, so RLS is disabled
//   -- and the app can persist them with the already-configured anon key
//   -- (no extra env var). Run this to make the shared cache "save forever":
//   alter table location_cache  disable row level security;
//   alter table cache_requests  disable row level security;
// The email tables (request_subscribers, notifications) keep RLS enabled and
// therefore need SUPABASE_SERVICE_ROLE_KEY to persist; with only the anon key
// the cache persists and notifications simply stay in-memory.

import { seedFor } from "@/lib/seed";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Prefer the service-role key (bypasses RLS, all tables). Fall back to the
// anon key that's already configured, so the cache can persist with only the
// SQL run — no new env var — as long as RLS on the cache tables permits it
// (the provided SQL disables RLS on the two public business-data tables).
const WRITE_KEY = SERVICE_KEY || ANON_KEY;
export const durableConfigured = !!(SUPABASE_URL && WRITE_KEY);
// Email/subscriber tables hold addresses, so they need the service key. With
// only the anon key the cache persists but notifications stay in-memory.
export const durableSecure = !!(SUPABASE_URL && SERVICE_KEY);

export interface CacheRow {
  key: string;
  label: string | null;
  lat: number;
  lon: number;
  radius: number;
  source: string;
  payload: unknown;
  checked_at: string;
}

export interface RequestRow {
  key: string;
  label: string | null;
  lat: number;
  lon: number;
  radius: number;
  requests: number;
  fulfilled: boolean;
  first_requested: string;
  last_requested: string;
}

// Stable cache key for an area: coarse coordinates (~1km grid) + radius +
// leads-only flag, so nearby requests share one cached crawl.
export function areaKey(lat: number, lon: number, radius: number, includeSites: boolean): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}:${includeSites ? "all" : "leads"}`;
}

// ── Supabase REST helpers ───────────────────────────────────────────────────
async function sb(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const { prefer, headers, ...rest } = init;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: WRITE_KEY,
      Authorization: `Bearer ${WRITE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...(headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
}

// ── In-memory fallback ──────────────────────────────────────────────────────
const memCache = new Map<string, CacheRow>();
const memReq = new Map<string, RequestRow>();

// ── Cache ───────────────────────────────────────────────────────────────────
// A real durable/in-memory row always wins; the built-in seed (seedFor) is only
// a floor, so a saved snapshot area (e.g. the default Lowell view) is served
// with no crawl even before any owner crawl exists, and an owner/Ultra crawl
// still overwrites it.
export async function getCache(key: string): Promise<CacheRow | null> {
  if (!durableConfigured) return memCache.get(key) || seedFor(key);
  try {
    const r = await sb(`location_cache?key=eq.${encodeURIComponent(key)}&select=*&limit=1`);
    if (!r.ok) return seedFor(key);
    const rows = (await r.json()) as CacheRow[];
    return rows[0] || seedFor(key);
  } catch { return seedFor(key); }
}

export async function setCache(row: CacheRow): Promise<void> {
  if (!durableConfigured) { memCache.set(row.key, row); return; }
  try {
    await sb("location_cache", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: JSON.stringify(row),
    });
  } catch { /* best effort: a failed persist just means the next admin crawl re-does it */ }
}

// ── Request queue ───────────────────────────────────────────────────────────
// A non-admin asked for an uncached area: record it / bump its counter and
// return the new total so the UI can say "you're one of N waiting".
export async function bumpRequest(meta: Omit<RequestRow, "requests" | "fulfilled" | "first_requested" | "last_requested">): Promise<number> {
  const now = new Date().toISOString();
  if (!durableConfigured) {
    const cur = memReq.get(meta.key);
    const next: RequestRow = cur
      ? { ...cur, ...meta, requests: cur.requests + 1, fulfilled: false, last_requested: now }
      : { ...meta, requests: 1, fulfilled: false, first_requested: now, last_requested: now };
    memReq.set(meta.key, next);
    return next.requests;
  }
  try {
    const r = await sb(`cache_requests?key=eq.${encodeURIComponent(meta.key)}&select=requests&limit=1`);
    const rows = r.ok ? ((await r.json()) as { requests: number }[]) : [];
    const prev = rows[0]?.requests ?? 0;
    const requests = prev + 1;
    await sb("cache_requests", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: JSON.stringify({ ...meta, requests, fulfilled: false, last_requested: now }),
    });
    return requests;
  } catch { return 1; }
}

export async function listRequests(): Promise<RequestRow[]> {
  if (!durableConfigured) {
    return [...memReq.values()].filter((r) => !r.fulfilled).sort((a, b) => b.requests - a.requests);
  }
  try {
    const r = await sb("cache_requests?fulfilled=eq.false&order=requests.desc&limit=100&select=*");
    if (!r.ok) return [];
    return (await r.json()) as RequestRow[];
  } catch { return []; }
}

export async function fulfillRequest(key: string): Promise<void> {
  if (!durableConfigured) {
    const cur = memReq.get(key);
    if (cur) memReq.set(key, { ...cur, fulfilled: true });
    return;
  }
  try {
    await sb(`cache_requests?key=eq.${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ fulfilled: true }),
    });
  } catch { /* non-fatal */ }
}

// ── Request subscribers + notifications ─────────────────────────────────────
// When a signed-in visitor requests an uncached area we remember their email
// so the owner can notify them once the area is loaded.
interface SubscriberRow { key: string; email: string; notified: boolean; created_at: string }
export interface NotificationRow {
  id: number | string; email: string; title: string; body: string;
  area_key: string | null; read: boolean; created_at: string;
}
const memSubs: SubscriberRow[] = [];
const memNotifs: NotificationRow[] = [];
let memNotifId = 1;

export async function subscribeRequest(key: string, email: string): Promise<void> {
  const clean = (email || "").trim().toLowerCase();
  if (!clean || !clean.includes("@")) return;
  if (!durableConfigured) {
    if (!memSubs.some((s) => s.key === key && s.email === clean)) {
      memSubs.push({ key, email: clean, notified: false, created_at: new Date().toISOString() });
    }
    return;
  }
  try {
    await sb("request_subscribers", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: JSON.stringify({ key, email: clean, notified: false }),
    });
  } catch { /* non-fatal */ }
}

// Called when an area is crawled: create a "your area is ready" notification
// for every subscriber that hasn't been told yet, mark them notified, and
// return the list of emails so the caller can also send email.
export async function notifyFulfilled(key: string, label: string | null): Promise<string[]> {
  const title = "Your requested area is ready";
  const body = `${label || "The area you requested"} has been loaded and is now available on b2web.site.`;
  const now = new Date().toISOString();
  if (!durableConfigured) {
    const subs = memSubs.filter((s) => s.key === key && !s.notified);
    for (const s of subs) {
      s.notified = true;
      memNotifs.push({ id: memNotifId++, email: s.email, title, body, area_key: key, read: false, created_at: now });
    }
    return subs.map((s) => s.email);
  }
  try {
    const r = await sb(`request_subscribers?key=eq.${encodeURIComponent(key)}&notified=eq.false&select=email`);
    const subs = r.ok ? ((await r.json()) as { email: string }[]) : [];
    const emails = subs.map((s) => s.email);
    if (emails.length) {
      await sb("notifications", {
        method: "POST",
        body: JSON.stringify(emails.map((email) => ({ email, title, body, area_key: key, read: false }))),
      });
      await sb(`request_subscribers?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ notified: true }),
      });
    }
    return emails;
  } catch { return []; }
}

export async function getNotifications(email: string): Promise<NotificationRow[]> {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return [];
  if (!durableConfigured) {
    return memNotifs.filter((n) => n.email === clean).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
  }
  try {
    const r = await sb(`notifications?email=eq.${encodeURIComponent(clean)}&order=created_at.desc&limit=30&select=*`);
    if (!r.ok) return [];
    return (await r.json()) as NotificationRow[];
  } catch { return []; }
}

export async function markNotificationsRead(email: string): Promise<void> {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return;
  if (!durableConfigured) {
    for (const n of memNotifs) if (n.email === clean) n.read = true;
    return;
  }
  try {
    await sb(`notifications?email=eq.${encodeURIComponent(clean)}&read=eq.false`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
  } catch { /* non-fatal */ }
}

// ── Admin gate ──────────────────────────────────────────────────────────────
// The billable crawl is admin-only. Authority is the ADMIN_SECRET env var,
// sent by the admin's browser as x-admin-key. When ADMIN_SECRET is unset the
// gate is disabled (open) so nothing breaks before the operator configures it.
export const adminGateEnabled = !!process.env.ADMIN_SECRET;

export function isAdminRequest(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET || "";
  if (!secret) return true; // gate disabled until configured
  const key = req.headers.get("x-admin-key") || "";
  // constant-time-ish compare
  if (key.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
