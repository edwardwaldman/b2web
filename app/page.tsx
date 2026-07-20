"use client";

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";

import MobileScreener from '@/m/MobileScreener';
import { useAuth } from '@/components/authprovider';
import { useProfileSync } from '@/utils/useProfileSync';
import { flushProfileNow } from '@/utils/profile';

// ─────────────────────────────────────────────────────────────────────────────
// b2website.list — SF screener (Step 1) · v3 "robust control panel"
// The screener IS the page. No hero. Anonymous = SF cached; a free account
// unlocks your own city's cached list; paid removes the caps.
//
// v3 architecture:
// · 70/30 split. Table left, detail pane right. Pane hidden until needed.
// · NO center modals, NO accounts. The right pane is business detail only.
//   Every locked thing (power filter chips, custom stops, cache tag, export,
//   location) opens one anchored "Go unlimited" popover directly under the
//   element that was clicked. It compares Starter ($20/mo, 40 calls) against
//   Unlimited ($200/mo, unlimited calls), billed monthly or yearly (20% off),
//   each behind a 1-day card-required free trial with empty-field validation.
//   Overlays: the rewarded ad, the auth modal, and the first-visit tour.
// · Row vs cell actions: row blank space = hard select (pane). Name = Maps
//   tab. Category/neighborhood tags = filter macros. Phone = silent copy
//   with a green flash (no tel: dialog). Headers = sort.
// · Keyboard: ↑/↓ rows, Enter focuses notes, C copies phone, W opens web
//   presence, M opens map,
//   Shift+Click multi-select (export upsell), Cmd/Ctrl+K location, Esc closes.
// · Rewarded ad appends rows 21–40 in place. Demo timer is 5s, standing in
//   for the 60s ad unit.
// · The end-cap under the table is the pitch, always on: no more no-website
//   businesses in the free slice, everyone mines the same Jun 5 snapshot,
//   the real-time cache is the edge over competitors. FREE vs PAID compare
//   plus the checkout CTA.
// · Search bar (top center, "/" focuses): typeahead over the accessible pool
//   by name, category, neighborhood, or street. Picking a result opens the
//   business detail pane (status, metrics, reviews, address, distance). An
//   empty result set pitches the paid full-city cache.
// · Sort select in the count strip: Featured, low-to-high variants, newest
//   listed, nearest first (asks for location if none), name. Column-header
//   sorts still work and show as "Column sort".
// · Detect my location is signup-gated for anonymous visitors: the popover's
//   button opens the signup modal, and detection runs right after signIn.
// · Locate: the Location button geolocates, finds the nearest city from a
//   built-in table, and sorts rows nearest-first (free, pure client-side).
//   A non-SF city pitches the paid city unlock, unless admin mode is on.
// · ADMIN (fixed, bottom-right) is a QA switch: every paid gate becomes
//   functional against the mock cache: custom filter inputs, CSV export,
//   exclude-contacted, multi-category stacking, a radius filter (needs a
//   located position), simulated real-time mode, alert arming, city relabel,
//   and the row cap lifts so the full mock cache renders. The Showing count
//   is click-to-edit in admin: type a target and it generates that many rows
//   (deterministic synthetic businesses, up to a 5,000-row safety ceiling).
// · Refresh (next to the cache tag) pulls "just listed" businesses: admin
//   gets a short spin then 2-4 fresh no-website leads on top, sorted
//   newest-first; anonymous gets the real-time pitch. The Listed column is
//   a hash-stable recency metric (1d-2y); fresh rows show green minutes.
// · Armed alerts push mock notifications: a small toast drops from the top
//   center previewing a newly listed no-website business (nearest first when
//   located), with "Open the full listing" jumping to the detail pane.
// · Ads share one behavior (useAdMode): Cancel swaps in the Go-unlimited
//   pitch, which auto-reverts to the ad after 5s. Slots: the in-feed table
//   row, the bottom bar, and the business-page sidebar.
// · 60s anonymous wall: the signup modal opens and cannot be dismissed
//   (admin exempt, waits for the tour). Screenshot deterrent blurs the app
//   on PrintScreen or focus loss (best effort; browsers cannot block OS
//   captures). About lives in a right-edge tab. ArrowLeft closes the
//   business page. The sort select leads the count strip; UTC clock top
//   right in white.
// · This pass: About/Help are top-right header buttons opening full pages.
//   The wall fires at 2 minutes as a finviz-style full-page gate (Google,
//   consent, email+password, then an emailed 6-digit code; registered
//   emails route to log in; non Gmail/Outlook emails also need a phone).
//   Admin = the top paid tier: no ads anywhere, no wall, no blur, an
//   UNLIMITED chip, and the ADMIN switch stays above the blur layer. The
//   search bar is absolutely centered. Business pages gain a Share button
//   (copy link, post to X); notifications open the full page. A View
//   toggle (Grid live, Map/Split locked) and a Credits/API/Queue/Cache
//   readout fill the control rows. Signed-in users get a tier chip and an
//   email menu (Manage account with a Stripe billing link, Log out).
//   Checkout hands off to Stripe. A link footer (Affiliate through Do Not
//   Sell) with the OpenStreetMap credit and copyright sits under the list
//   and on business pages.
// · First visit: a 4-slide tour overlay (status column, filters, row actions,
//   then a signup page). No backdrop or Esc dismissal. On the signup slide
//   the primary button sits exactly where Next was, so spam-clickers land on
//   Sign up and get red required-field outlines; Continue as guest (left)
//   finishes as anonymous. Completion is stored in localStorage.
// · Accounts are a light prototype layer: Sign up / Log in buttons top-right,
//   a centered email-only modal (referral code optional, provider circles as
//   placeholders). Signing in flips a local flag; the magic link is unbuilt.
//   Free account = the located city's cached list; paid stays the popover.
//
// Design system (unchanged from v2): Finviz dark slate, semantic colors only
// (blue = interactive, red/amber/green = website-status LEDs), Trebuchet MS
// system stack ~11.5px tabular-nums, no webfonts, radius 2, no em dashes.
// Cache honesty everywhere: "of N in cache", "checked Jun 5" provenance.
// ─────────────────────────────────────────────────────────────────────────────

const BG = "var(--bg)";          // page
const PANEL = "var(--panel)";       // control deck, count strip, pane
const PANEL2 = "var(--panel-2)";      // inputs, hover, wells
const SEL = "var(--sel)";         // hard-selected row
const LINE = "var(--line)";        // hairlines
const RULE = "var(--rule)";        // stronger structural rules
const TEXT = "var(--text)";        // primary text
const MUTED = "var(--muted)";       // labels, secondary
const FAINT = "var(--faint)";       // ad placeholders, hints
const RED = "var(--red)";         // NO WEBSITE — the lead signal
const AMBER = "var(--amber)";       // third-party (Facebook/Instagram/Linktree)
const GREEN = "var(--green)";       // has a standalone site / success flash
const BLUE = "var(--blue)";        // links, focus, selection accent
const BLUE_DEEP = "var(--blue-deep)";   // primary buttons

// Pricing: two tiers, monthly or yearly (yearly = 20% off), 1-day free trial
// on both (card required). "Calls" = crawl requests against the live cache.
const PLANS = [
  { id: "starter", name: "Starter", mo: 20, calls: "40 calls / mo",
    feats: ["Real-time crawls", "No ads", "Power filters", "CSV export"] },
  { id: "unlimited", name: "Unlimited", mo: 200, calls: "Unlimited calls",
    feats: ["Everything in Starter", "Search any US location", "No result caps", "Armed alerts", "Priority crawl queue"] },
];
const planPrice = (pl, billing) => (billing === "yr" ? Math.round(pl.mo * 0.8) : pl.mo);

// ── Mock SF cache slice ──────────────────────────────────────────────────────
// Streets match their neighborhoods on purpose — the demo only convinces if an
// SF person can't catch it lying. status: "none" | "third" | "site"
const DATA = [
  { name: "Castro Classic Cuts",      cat: "Barber shop",    rev: 34,  addr: "489 Castro St",      hood: "Castro",            status: "none",                         phone: "(415) 555-0184" },
  { name: "Mission Cut House",        cat: "Barber shop",    rev: 47,  addr: "2486 Mission St",    hood: "Mission",           status: "third", thirdKind: "Facebook",  phone: "(415) 555-0117" },
  { name: "Geary Barber Co.",         cat: "Barber shop",    rev: 12,  addr: "718 Geary St",       hood: "Lower Nob Hill",    status: "none",                         phone: "(415) 555-0149" },
  { name: "Outer Sunset Fades",       cat: "Barber shop",    rev: 8,   addr: "3214 Noriega St",    hood: "Outer Sunset",      status: "none",                         phone: "(415) 555-0102" },
  { name: "Hayes Valley Hair Studio", cat: "Hair salon",     rev: 64,  addr: "552 Hayes St",       hood: "Hayes Valley",      status: "none",                         phone: "(415) 555-0125" },
  { name: "Sunset Nails & Spa",       cat: "Nail salon",     rev: 41,  addr: "1916 Irving St",     hood: "Inner Sunset",      status: "third", thirdKind: "Instagram", phone: "(415) 555-0163" },
  { name: "Richmond Auto Care",       cat: "Auto repair",    rev: 188, addr: "5812 Geary Blvd",    hood: "Outer Richmond",    status: "none",                         phone: "(415) 555-0140" },
  { name: "Bernal Heights Plumbing",  cat: "Plumber",        rev: 312, addr: "431 Cortland Ave",   hood: "Bernal Heights",    status: "none",                         phone: "(415) 555-0191" },
  { name: "Great Highway Market",     cat: "Grocery",        rev: 29,  addr: "4498 Judah St",      hood: "Outer Sunset",      status: "none",                         phone: "(415) 555-0158" },
  { name: "Excelsior Shoe Repair",    cat: "Shoe repair",    rev: 19,  addr: "4623 Mission St",    hood: "Excelsior",         status: "none",                         phone: "(415) 555-0171" },
  { name: "Clement Street Tailor",    cat: "Tailor",         rev: 16,  addr: "615 Clement St",     hood: "Inner Richmond",    status: "none",                         phone: "(415) 555-0133" },
  { name: "Polk Street Cleaners",     cat: "Dry cleaner",    rev: 22,  addr: "1744 Polk St",       hood: "Nob Hill",          status: "third", thirdKind: "Facebook",  phone: "(415) 555-0107" },
  { name: "Portola Hardware",         cat: "Hardware store", rev: 51,  addr: "2630 San Bruno Ave", hood: "Portola",           status: "none",                         phone: "(415) 555-0122" },
  { name: "Valencia Upholstery",      cat: "Upholstery",     rev: 9,   addr: "1438 Valencia St",   hood: "Mission",           status: "none",                         phone: "(415) 555-0168" },
  { name: "North Beach Locksmith",    cat: "Locksmith",      rev: 87,  addr: "566 Columbus Ave",   hood: "North Beach",       status: "third", thirdKind: "Linktree",  phone: "(415) 555-0151" },
  { name: "Balboa Hot Pot",           cat: "Restaurant",     rev: 214, addr: "3608 Balboa St",     hood: "Outer Richmond",    status: "none",                         phone: "(415) 555-0195" },
];

// Rows 21–40, appended after the rewarded ad. Same street/hood discipline.
const EXTRA = [
  { name: "Taraval Wash & Fold",        cat: "Laundromat",      rev: 26,  addr: "2614 Taraval St",     hood: "Parkside",          status: "none",                         phone: "(415) 555-0203" },
  { name: "Chenery Street Florist",     cat: "Florist",         rev: 14,  addr: "670 Chenery St",      hood: "Glen Park",         status: "none",                         phone: "(415) 555-0211" },
  { name: "Ocean Avenue Tax Service",   cat: "Tax service",     rev: 31,  addr: "1530 Ocean Ave",      hood: "Ingleside",         status: "third", thirdKind: "Facebook",  phone: "(415) 555-0218" },
  { name: "Noe Valley Pet Grooming",    cat: "Pet groomer",     rev: 73,  addr: "3961 24th St",        hood: "Noe Valley",        status: "none",                         phone: "(415) 555-0224" },
  { name: "Divisadero Tire & Wheel",    cat: "Auto repair",     rev: 119, addr: "670 Divisadero St",   hood: "NoPa",              status: "none",                         phone: "(415) 555-0229" },
  { name: "Leland Avenue Bakery",       cat: "Bakery",          rev: 21,  addr: "36 Leland Ave",       hood: "Visitacion Valley", status: "none",                         phone: "(415) 555-0233" },
  { name: "Cole Valley Shoe Service",   cat: "Shoe repair",     rev: 11,  addr: "930 Cole St",         hood: "Cole Valley",       status: "none",                         phone: "(415) 555-0246" },
  { name: "Judah Street Sushi",         cat: "Restaurant",      rev: 167, addr: "3906 Judah St",       hood: "Outer Sunset",      status: "third", thirdKind: "Instagram", phone: "(415) 555-0252" },
  { name: "Bayview Auto Glass",         cat: "Auto repair",     rev: 44,  addr: "4810 3rd St",         hood: "Bayview",           status: "none",                         phone: "(415) 555-0257" },
  { name: "Cortland Hardware",          cat: "Hardware store",  rev: 38,  addr: "600 Cortland Ave",    hood: "Bernal Heights",    status: "third", thirdKind: "Facebook",  phone: "(415) 555-0263" },
  { name: "Lombard Mattress Outlet",    cat: "Furniture store", rev: 17,  addr: "2298 Lombard St",     hood: "Cow Hollow",        status: "none",                         phone: "(415) 555-0268" },
  { name: "Ingleside Barber Lounge",    cat: "Barber shop",     rev: 52,  addr: "1432 Ocean Ave",      hood: "Ingleside",         status: "none",                         phone: "(415) 555-0274" },
  { name: "Quintara Rooter & Plumbing", cat: "Plumber",         rev: 95,  addr: "2200 Quintara St",    hood: "Parkside",          status: "none",                         phone: "(415) 555-0285" },
  { name: "Balboa Optical",             cat: "Optometrist",     rev: 27,  addr: "3821 Balboa St",      hood: "Outer Richmond",    status: "third", thirdKind: "Linktree",  phone: "(415) 555-0291" },
  { name: "Persia Avenue Upholstery",   cat: "Upholstery",      rev: 6,   addr: "88 Persia Ave",       hood: "Excelsior",         status: "none",                         phone: "(415) 555-0296" },
  { name: "Hyde Street Tailoring",      cat: "Tailor",          rev: 24,  addr: "1521 Hyde St",        hood: "Russian Hill",      status: "none",                         phone: "(415) 555-0302" },
  { name: "Silver Terrace Grocery",     cat: "Grocery",         rev: 33,  addr: "1801 Silver Ave",     hood: "Silver Terrace",    status: "none",                         phone: "(415) 555-0307" },
];

const ALL_ROWS = [...DATA, ...EXTRA];
const REVIEW_STOPS = [0, 5, 10, 25, 50, 100];
const STAR_STOPS = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

// Believable cache totals per category {t: total rows, l: strictly no website}
const TOTALS = {
  "All categories": { t: 24816, l: 9442 },
  "Barber shop": { t: 212, l: 117 }, "Hair salon": { t: 318, l: 121 },
  "Nail salon": { t: 247, l: 138 }, "Auto repair": { t: 156, l: 71 },
  "Plumber": { t: 134, l: 77 }, "Bakery": { t: 98, l: 31 },
  "Grocery": { t: 421, l: 260 }, "Shoe repair": { t: 23, l: 17 },
  "Tailor": { t: 61, l: 39 }, "Dry cleaner": { t: 88, l: 52 },
  "Dentist": { t: 402, l: 64 }, "Hardware store": { t: 34, l: 14 },
  "Upholstery": { t: 18, l: 13 }, "Locksmith": { t: 42, l: 21 },
  "Restaurant": { t: 4812, l: 1387 }, "HVAC": { t: 129, l: 58 },
  "Laundromat": { t: 54, l: 36 }, "Florist": { t: 71, l: 29 },
  "Tax service": { t: 63, l: 27 }, "Pet groomer": { t: 47, l: 22 },
  "Optometrist": { t: 96, l: 18 }, "Furniture store": { t: 83, l: 35 },
};

const CHECKED = "Checked Jun 5"; // cache crawl date — matches "updated 6 days ago"
const VERIFY = {
  none: `No URL on its Google listing, OSM entry, or registry record. ${CHECKED}`,
  Facebook: `Listed URL points to facebook.com. No standalone site. ${CHECKED}`,
  Instagram: `Listed URL points to instagram.com. No standalone site. ${CHECKED}`,
  Linktree: `Listed URL points to linktr.ee. No standalone site. ${CHECKED}`,
  site: `Standalone site responded OK. ${CHECKED}`,
};

// Value copy for locked power filters, shown in the right pane on click.
const FEATURES = {
  "Real-time data": "Free results come from the shared SF cache, last checked Jun 5. Paid runs a live crawl of your category and area on demand, so every row reflects what is online right now, with no 6-day lag.",
  "Custom filters": "Set any minimum review count or star rating with a slider instead of the fixed presets. Dial lead quality to the exact threshold you want.",
  "Radius / Draw area": "Draw your service area on a map and screen only inside it. Stop scrolling past leads you would never drive to.",
  "Multiple categories": "Stack every trade you serve into one view: plumbers, HVAC, electricians in a single pass.",
  "Exclude contacted": "Mark a lead as contacted once and it stays hidden in every future search. No double outreach, no spreadsheet cross-checking.",
  "Compare businesses": "Open several businesses side by side and work them at once instead of one pane at a time.",
  "Contact enrichment": "Pull owner names, emails, and socials on top of the phone so you can reach a person, not a front desk.",
  "Duplicate filter": "Collapse the same business listed twice across sources into one clean row.",
};

const STATUS_META = {
  none: { c: RED, label: "No website", order: 0 },
  third: { c: AMBER, label: "only", order: 1 }, // prefixed with platform name
  site: { c: GREEN, label: "Has site", order: 2 },
};

// ── Tiny stroke icons (no dingbats, no emoji) ────────────────────────────────
function Icon({ k, size = 12, fill = "none" }) {
  const p = {
    play: <path d="M8 5.5v13l11-6.5z" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    target: <><circle cx="12" cy="12" r="6.5" /><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" /></>,
    refresh: <><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M20.5 2.5v4.2h-4.2" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="1.6" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M20.5 20.5l-4.6-4.6" /></>,
    share: <><path d="M4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6" /><path d="M12 14.5V3.5M7.5 7.5 12 3l4.5 4.5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>,
    expand: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
    spinner: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10.5 19.5a2 2 0 0 0 3 0" /></>,
    bookmark: <><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></>,
    sun: <><path d="M7 17a5 5 0 0 1 10 0" /><path d="M3 17h18" /><path d="M12 3.5v2.2M6 8.4l1.5 1.5M18 8.4l-1.5 1.5M2.5 13.5h2.2M19.3 13.5h2.2" /></>,
    moon: <path d="M20.5 14.8A8.2 8.2 0 0 1 9.2 3.5a8.2 8.2 0 1 0 11.3 11.3z" />,
  }[k];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

// Shared ad behavior: Cancel swaps in the Go-unlimited pitch, which
// auto-reverts to the ad after 5s unless the person acts on it.
const useAdMode = () => {
  const [m, setM] = useState("ad"); // "ad" | "pitch"
  useEffect(() => {
    if (m !== "pitch") return;
    const t = setTimeout(() => setM("ad"), 5000);
    return () => clearTimeout(t);
  }, [m]);
  return [m, setM];
};

function Lock() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      style={{ marginLeft: 6, opacity: 0.55, flexShrink: 0, display: "block" }} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Caret({ dir }) {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      style={{ marginLeft: 4, transform: dir === "asc" ? "rotate(180deg)" : "none" }}>
      <path d="M12 17l-7-9h14z" />
    </svg>
  );
}

function statusBits(d) {
  const m = STATUS_META[d.status] || STATUS_META.site;
  const label = d.status === "third" ? `${d.thirdKind || "Social"} only` : m.label;
  // Live rows carry their own provenance line (source + real check date).
  const tip = d.statusNote || (d.status === "third" ? (VERIFY[d.thirdKind] || VERIFY.Facebook) : VERIFY[d.status]);
  return { c: m.c, label, tip };
}

function Status({ d }) {
  const { c, label, tip } = statusBits(d);
  return (
    <span style={S.status} title={tip}>
      <span style={{ color: d.status === "site" ? MUTED : c, fontWeight: 700 }}>{label}</span>
    </span>
  );
}

// Live rows carry their real city ("Portland, OR"); the demo rows are SF.
const cityOf = (d) => d.city || "San Francisco, CA";
const mapHref = (d) =>
  d.mapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.name} ${d.addr || ""} ${cityOf(d)}`)}`;
const mapEmbed = (d) =>
  d.addr
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${d.name}, ${d.addr}, ${cityOf(d)}`)}&output=embed`
    : d.lat != null && d.lon != null
    ? `https://www.google.com/maps?q=${d.lat},${d.lon}&z=16&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${d.name}, ${cityOf(d)}`)}&output=embed`;
// Web presence. Live rows store the listed URL and open it directly; rows
// without one resolve to a scoped Google search that lands on whatever the
// business actually has — their site, their social page, or just the Google
// listing that proves there's no site.
const webHref = (d) => {
  if (d.website) return /^https?:\/\//i.test(d.website) ? d.website : `https://${d.website}`;
  const plat = d.status === "third" && d.thirdKind ? ` ${d.thirdKind}` : "";
  return `https://www.google.com/search?q=${encodeURIComponent(`"${d.name}" ${d.hood} ${cityOf(d)}${plat}`)}`;
};

// Live viewer count per business (deterministic). Low numbers are the prize:
// fewer agencies looking at that lead right now.
const viewersOf = (d) => 1 + (hashStr(d.name + "watch") % 48);

const bizUrl = (d) => "https://b2web.site/business/" + d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── Metrics: real fields first, deterministic mock as the demo fallback ─────
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const THIS_YEAR = new Date().getFullYear();
// Live rows carry d.rating from Google Places; null until enriched. Mock
// ratings span 1.0–5.0 but cluster in 3–5; only ~1 in 8 falls below 3.0.
const ratingOf = (d) => {
  if (d.rating != null) return d.rating;
  if (d.real) return null; // real business, rating not fetched yet
  const h = hashStr(d.name + "rt");
  if (h % 8 === 0) return Math.round((1 + (h % 20) / 10) * 10) / 10; // 1.0–2.9 (rare)
  return Math.round((3 + (h % 21) / 10) * 10) / 10;                  // 3.0–5.0 (common)
};
const ratingLabel = (d) => { const r = ratingOf(d); return r == null ? "—" : r.toFixed(1); };
// Age: registry / OSM start_date year when a source has it; mock otherwise.
const ageOf = (d) => {
  if (d.sinceYear) return Math.max(0, THIS_YEAR - d.sinceYear);
  if (d.real) return null; // no registry match yet
  return 2 + (hashStr(d.name + "age") % 28); // stable 2–29 yrs listed
};
const sinceYearOf = (d) => d.sinceYear || (ageOf(d) != null ? THIS_YEAR - ageOf(d) : null);
// Ready-to-paste build prompt (Lovable, v0, Bolt) written from the row's data.
const aiPromptOf = (d) => {
  const presence = d.status === "none" ? "They currently have no website at all"
    : d.status === "third" ? `Their only web presence is a ${d.thirdKind} page`
    : "They have a standalone site that needs a rebuild";
  const proof = ratingOf(d) != null && d.rev
    ? `They hold a ${ratingOf(d).toFixed(1)} star Google rating across ${d.rev} reviews, so lead with social proof: a reviews strip, a star badge, and two short testimonials.`
    : `Lead with whatever social proof they have: a reviews strip and two short testimonials.`;
  return `Build a fast, mobile-first, single-page website for ${d.name}, a ${d.cat.toLowerCase()} in ${d.hood}, ${cityOf(d)}${d.addr ? ` (${d.addr})` : ""}. ${presence}. ${proof} Sections: hero with a one-line value promise and a tap-to-call button${d.phone ? ` (${d.phone})` : ""}, services with prices, hours and location with an embedded map, and a booking or quote form. Tone: neighborhood-trusted, no stock-photo gloss. Ship clean semantic HTML, system fonts, one accent color, and LocalBusiness structured data for SEO.`;
};

// ── Geo: neighborhood lat/lng + haversine + nearest-city table ──────────────
// Business position = hood centroid + tiny stable jitter. Production geocodes
// the real address; the demo only needs believable relative distances.
const HOOD_LL = {
  "Castro": [37.7609, -122.4350], "Mission": [37.7599, -122.4148], "Lower Nob Hill": [37.7887, -122.4149],
  "Outer Sunset": [37.7554, -122.4939], "Marina": [37.8021, -122.4369], "Hayes Valley": [37.7759, -122.4245],
  "Inner Sunset": [37.7601, -122.4689], "Outer Richmond": [37.7776, -122.4939], "Bernal Heights": [37.7389, -122.4158],
  "Glen Park": [37.7338, -122.4337], "Excelsior": [37.7239, -122.4311], "Inner Richmond": [37.7801, -122.4645],
  "Nob Hill": [37.7930, -122.4161], "SoMa": [37.7785, -122.4056], "Portola": [37.7266, -122.4106],
  "North Beach": [37.8060, -122.4103], "Lower Pac Heights": [37.7873, -122.4324], "Parkside": [37.7411, -122.4892],
  "Ingleside": [37.7239, -122.4576], "Noe Valley": [37.7502, -122.4337], "NoPa": [37.7754, -122.4394],
  "Visitacion Valley": [37.7134, -122.4041], "West Portal": [37.7407, -122.4664], "Cole Valley": [37.7659, -122.4501],
  "Bayview": [37.7299, -122.3865], "Cow Hollow": [37.7972, -122.4389], "Russian Hill": [37.8014, -122.4189],
  "Silver Terrace": [37.7368, -122.3993],
};
const llOf = (d) => {
  if (d.lat != null && d.lon != null) return [d.lat, d.lon]; // real coordinates
  const b = HOOD_LL[d.hood] || [37.7749, -122.4194];
  return [b[0] + ((hashStr(d.name + "la") % 100) / 100 - 0.5) * 0.006,
          b[1] + ((hashStr(d.name + "lo") % 100) / 100 - 0.5) * 0.006];
};
const hav = (a1, o1, a2, o2) => {
  const R = 3958.8, r = Math.PI / 180;
  const dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const q = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q)); // miles
};
// Nearest-city detection is offline: geolocate, then pick the closest of
// these. Enough to say "we found you near Boston" without a geocoding API.
const CITIES = [
  { n: "San Francisco, CA", lat: 37.7749, lng: -122.4194 }, { n: "Oakland, CA", lat: 37.8044, lng: -122.2712 },
  { n: "San Jose, CA", lat: 37.3382, lng: -121.8863 }, { n: "Sacramento, CA", lat: 38.5816, lng: -121.4944 },
  { n: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 }, { n: "San Diego, CA", lat: 32.7157, lng: -117.1611 },
  { n: "Las Vegas, NV", lat: 36.1699, lng: -115.1398 }, { n: "Portland, OR", lat: 45.5152, lng: -122.6784 },
  { n: "Seattle, WA", lat: 47.6062, lng: -122.3321 }, { n: "Phoenix, AZ", lat: 33.4484, lng: -112.0740 },
  { n: "Denver, CO", lat: 39.7392, lng: -104.9903 }, { n: "Dallas, TX", lat: 32.7767, lng: -96.7970 },
  { n: "Austin, TX", lat: 30.2672, lng: -97.7431 }, { n: "Houston, TX", lat: 29.7604, lng: -95.3698 },
  { n: "Chicago, IL", lat: 41.8781, lng: -87.6298 }, { n: "Minneapolis, MN", lat: 44.9778, lng: -93.2650 },
  { n: "Detroit, MI", lat: 42.3314, lng: -83.0458 }, { n: "Atlanta, GA", lat: 33.7490, lng: -84.3880 },
  { n: "Miami, FL", lat: 25.7617, lng: -80.1918 }, { n: "Washington, DC", lat: 38.9072, lng: -77.0369 },
  { n: "Philadelphia, PA", lat: 39.9526, lng: -75.1652 }, { n: "New York, NY", lat: 40.7128, lng: -74.0060 },
  { n: "Boston, MA", lat: 42.3601, lng: -71.0589 },
];

// ── Synthetic cache rows for admin volume testing ───────────────────────────
// Deterministic per index so distances/ratings stay stable across renders.
// Hoods come from HOOD_LL so llOf/haversine resolve; status is biased toward
// "none" since this is a no-website screener. Names combine a place word, a
// suffix noun, and the category, which keeps them unique and natural-looking
// for the thousands of rows admin can request.
const GEN_PLACES = ["Castro","Mission","Sunset","Richmond","Marina","Noe","Bernal","Portola","Excelsior","Glen Park","Hayes","Cole","Bayview","Ingleside","Parkside","Ocean","Balboa","Judah","Clement","Geary","Irving","Taraval","Divisadero","Fillmore","Polk","Hyde","Ulloa","Cortland","Lombard","Haight","Church","Valencia"];
const GEN_SUFFIX = ["Studio","Co.","Works","Center","Shop","House","Express","Pro","Depot","Corner","Point","Hub","Room","Station","Collective","Group"];
const GEN_CATS = ["Barber shop","Hair salon","Nail salon","Auto repair","Plumber","Bakery","Grocery","Shoe repair","Tailor","Dry cleaner","Dentist","Hardware store","Upholstery","Locksmith","Restaurant","HVAC","Laundromat","Florist","Tax service","Pet groomer","Optometrist","Furniture store","Electrician","Roofing","Landscaping","Pest control","Chiropractor","Cafe","Bar","Bookstore"];
const GEN_STREETS = ["Mission St","Valencia St","Geary Blvd","Irving St","Clement St","Judah St","Taraval St","Ocean Ave","Balboa St","Noriega St","24th St","Church St","Divisadero St","Fillmore St","Polk St","Hyde St","Ulloa St","Cortland Ave","San Bruno Ave","3rd St","Columbus Ave","Chestnut St"];
const GEN_THIRD = ["Facebook","Instagram","Linktree"];
const GEN_HOODS = Object.keys(HOOD_LL);
const genRow = (i) => {
  const id = ALL_ROWS.length + i + 1;
  const h = (salt) => hashStr("gen:" + id + ":" + salt);
  const cat = GEN_CATS[h("cat") % GEN_CATS.length];
  const r = h("stat") % 100;
  let status = "none", thirdKind;
  if (r >= 62) { status = "third"; thirdKind = GEN_THIRD[h("tk") % GEN_THIRD.length]; }
  const name = `${GEN_PLACES[i % GEN_PLACES.length]} ${GEN_SUFFIX[Math.floor(i / GEN_PLACES.length) % GEN_SUFFIX.length]} ${cat}`;
  return {
    name, cat, rev: 5 + (h("rev") % 400),
    addr: `${100 + (h("num") % 4899)} ${GEN_STREETS[h("st") % GEN_STREETS.length]}`,
    hood: GEN_HOODS[h("hood") % GEN_HOODS.length],
    status, ...(thirdKind ? { thirdKind } : {}),
    phone: `(415) 555-${String(320 + (h("ph") % 9679)).padStart(4, "0")}`,
  };
};
const GEN_MAX = 5000; // safety ceiling so the table doesn't lock the browser

// ── "Listed" recency metric ─────────────────────────────────────────────────
// Live rows carry listedDays (days since their OSM record was last touched);
// mock rows fall back to a deterministic hash-stable 1d–2y spread. Rows
// injected by Refresh carry listedAgoMin (minutes) and render green.
const listedDaysOf = (d) =>
  d.listedDays != null ? Math.max(1, d.listedDays)
  : d.real ? null // Google-only row: no edit history to date it by
  : 1 + (hashStr(d.name + "listed") % 720);
const listedMin = (d) => {
  if (d.listedAgoMin != null) return d.listedAgoMin;
  const days = listedDaysOf(d);
  return days == null ? Number.MAX_SAFE_INTEGER : days * 1440;
};
const listedLabel = (d) => {
  if (d.listedAgoMin != null) return d.listedAgoMin < 60 ? `${d.listedAgoMin}m ago` : `${Math.round(d.listedAgoMin / 60)}h ago`;
  const days = listedDaysOf(d);
  if (days == null) return "—";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")}y ago`;
};

// ── Mock Google reviews (deterministic per business) ────────────────────────
// A believable review dump the "copy all reviews" button pulls to clipboard.
// Count tracks the listing's review number (capped for the sample); text is
// stitched from parts so it reads like real Google reviews without repeating.
const RV_NAMES = ["Marcus T.","Jenny L.","David R.","Priya S.","Carlos M.","Aisha K.","Tom W.","Linda H.","Sofia G.","Ben C.","Rachel N.","Kevin P.","Grace O.","Sam D.","Nina V.","Omar F.","Hannah B.","Leo M.","Yuki T.","Ana P."];
const RV_OPEN = ["Been coming here for years", "Booked last minute", "First time customer", "My go-to spot", "Stopped in on a whim", "Local and loyal", "Found them on a recommendation", "Walked in off the street"];
const RV_MID = ["and the staff were friendly and quick", "and the service was solid all around", "and they really know what they're doing", "and the pricing was fair", "and I was in and out fast", "and they went above and beyond", "and the quality was better than expected", "and the owner is genuinely great"];
const RV_END = ["Highly recommend.", "Will be back.", "Can't beat it.", "Five stars.", "Tell your friends.", "Worth the trip.", "No complaints.", "Exactly what I needed."];
const RV_LOW = ["Service was slow and a bit disorganized.", "Fine, but nothing special for the price.", "Had to wait way past my appointment time.", "Decent work but the communication was poor.", "Wanted to love it, left underwhelmed."];
const reviewsOf = (d) => {
  if (d.real) {
    // Real rows only ever show real review text (fetched by /api/enrich when
    // the row is opened; needs a Places key). Never synthesize for them.
    const list = d.reviews || [];
    return { total: d.rev != null ? d.rev : list.length, sampled: list.length, list };
  }
  const total = Math.max(1, d.rev);
  const n = Math.min(total, 12); // sample the most recent dozen
  const rating = ratingOf(d);
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (salt) => hashStr(d.name + ":rv:" + i + ":" + salt);
    const low = (h("stars") % 10) < 2 && rating < 4.5; // occasional 2-3 star
    const stars = low ? 2 + (h("s") % 2) : 4 + (h("s") % 2);
    const when = 1 + (h("when") % 51);
    const whenL = when < 4 ? `${when} weeks ago` : `${Math.round(when / 4.3)} months ago`;
    const body = low
      ? RV_LOW[h("b") % RV_LOW.length]
      : `${RV_OPEN[h("o") % RV_OPEN.length]} ${RV_MID[h("m") % RV_MID.length]}. ${RV_END[h("e") % RV_END.length]}`;
    out.push({ author: RV_NAMES[h("nm") % RV_NAMES.length], stars, when: whenL, body });
  }
  return { total, sampled: n, list: out };
};
const reviewsText = (d) => {
  const { total, sampled, list } = reviewsOf(d);
  const head = `${d.name}, ${[d.addr, cityOf(d)].filter(Boolean).join(", ")}\nGoogle reviews: ${ratingLabel(d)}★, ${total} total (showing ${sampled} most recent)\n${"=".repeat(48)}\n`;
  if (!list.length) return head + `No review text cached yet. Latest reviews: ${mapHref(d)}`;
  return head + list.map((r) => `${r.author}, ${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}, ${r.when}\n${r.body}`).join("\n\n");
};

// Fresh rows for the Refresh action: generated off a high index band so they
// never collide with admin volume rows, biased hard toward no-website.
const freshRow = (k) => {
  const base = genRow(10000 + k);
  const r = hashStr("fr:" + k) % 100;
  const status = r < 75 ? "none" : "third";
  return {
    ...base,
    status,
    ...(status === "third" ? { thirdKind: GEN_THIRD[hashStr("frk:" + k) % GEN_THIRD.length] } : {}),
    listedAgoMin: 2 + (hashStr("fram:" + k) % 38),
  };
};

// Route entry. Hosts must not fork the UI: the screener below is fully
// responsive, so m.b2web.site serves the exact same component and the
// mobile-first layer kicks in by viewport. (MobileScreener is the hamburger
// nav the screener mounts in its header — it is not a standalone page, so
// early-returning it here would render an empty menu and nothing else.)
// The only host-specific behavior is the bounce: a phone that lands on the
// desktop host gets moved to the mobile host.
export default function Page() {
  useEffect(() => {
    const currentHost = window.location.hostname;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobileDevice && currentHost === "app.b2web.site") {
      window.location.replace("https://m.b2web.site");
    }
  }, []);

  return <Screener />;
}

function Screener() {
  // filters + sort
  const [cat, setCat] = useState("All categories");
  const [minRev, setMinRev] = useState(0);
  const [minStars, setMinStars] = useState(0);
  const [hood, setHood] = useState(null);
  const [onlyLeads, setOnlyLeads] = useState(false); // "No website only", paid-gated outside admin
  const [sort, setSort] = useState({ key: "rev", dir: "desc" });

  // selection + pane
  const [selected, setSelected] = useState(null);       // business name (stable key)
  const [multi, setMulti] = useState(() => new Set());  // shift+click set
  const [pane, setPane] = useState({ mode: null });     // null | business

  // data volume + ad
  const [extra, setExtra] = useState(false); // rows 21–40 unlocked
  const [adminRows, setAdminRows] = useState(null); // admin: forced cache size (generates rows)
  const [fresh, setFresh] = useState([]);            // rows injected by Refresh (newly listed)
  const [refreshing, setRefreshing] = useState(false);
  const freshCount = useRef(0);
  const [viewed, setViewed] = useState(() => new Set()); // rows opened in detail
  const markViewed = (name) => setViewed((v) => { if (v.has(name)) return v; const n = new Set(v); n.add(name); return n; });
  const [picks, setPicks] = useState(() => new Set());   // far-left bulk checkboxes
  // Data readiness: "loading" is a full cache fetch (page open / refresh);
  // "indexing" is the shorter re-index after a filter or sort change.
  const [busy, setBusy] = useState("loading");
  const firstPaint = useRef(true);
  const idxTimer = useRef(null);
  const [editRows, setEditRows] = useState(false);  // editing the Showing count inline
  const [rowDraft, setRowDraft] = useState("");
  const [adOpen, setAdOpen] = useState(false);
  const [adLeft, setAdLeft] = useState(0);
  const [inFeedMode, setInFeedMode] = useAdMode(); // in-table slot
  const [inFeedCountdown, setInFeedCountdown] = useState(5);
  const [pageAdMode, setPageAdMode] = useAdMode(); // business-page sidebar
  const [inFeed2, setInFeed2] = useAdMode();       // second in-table slot

  // anchored "Go unlimited" popover: {x, y, feature?} · one popover, many triggers
  const [up, setUp] = useState(null);
  const [upBilling, setUpBilling] = useState("mo"); // "mo" | "yr"
  const [upTier, setUpTier] = useState(null);       // picked plan id, reveals trial form
  const [upErr, setUpErr] = useState(false);
  const [trialEmail, setTrialEmail] = useState(""); // checkout field while signed out; the shared email is derived now

  // location: geolocate -> nearest city + nearest-first sort
  const [geo, setGeo] = useState(null);            // {lat, lng, city}
  const [locPrompt, setLocPrompt] = useState(null); // {x, y} · "detect my location" popover
  const locPromptRef = useRef(null);
  const [pendingLoc, setPendingLoc] = useState(false); // detect requested pre-signup
  const [pendingPlan, setPendingPlan] = useState(null); // plan chosen before signup

  // top search bar: typeahead over the accessible pool, Enter or click opens
  // the business detail pane (the per-business page)
  const [bizPage, setBizPage] = useState(null); // full profile page (from search)
  const [q, setQ] = useState("");
  const [qOpen, setQOpen] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const searchWrapRef = useRef(null);
  const [infoPage, setInfoPage] = useState(null); // null | "about" | "help" (full pages)
  const [share, setShare] = useState(null);       // {x, y, biz} share popover
  const [shareCopied, setShareCopied] = useState(false);
  const shareRef = useRef(null);
  const [acctMenu, setAcctMenu] = useState(false);
  const acctRef = useRef(null);
  const [acctOpen, setAcctOpen] = useState(false); // manage-account modal
  const [acctOpen2, setAcctOpen2] = useState(false); // preferences modal
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false); // delete-account confirm modal
  const [deleteText, setDeleteText] = useState("");  // must type DELETE to confirm
  const [busyAuth, setBusyAuth] = useState(null);    // null | "signup" | "login" | "delete"
  const cityRef = useRef(null);
  const [refReveal, setRefReveal] = useState(false); // "Referral code?" on signup
  const [resendLeft, setResendLeft] = useState(0);   // code resend cooldown
  const [refreshLock, setRefreshLock] = useState(0); // seconds until refresh allowed
  const [authLock, setAuthLock] = useState(0);       // seconds until auth allowed
  const [viewers, setViewers] = useState(212);       // live "current viewers"
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const [notifSeen, setNotifSeen] = useState(false);
  const [apiInfo, setApiInfo] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const exportRef = useRef(null);
  const [tier, setTier] = useState("free");        // "free" | "starter" | "unlimited"
  const [gateMode, setGateMode] = useState("signup"); // wall gate mode
  const [gateEmail, setGateEmail] = useState(false);  // gate: email form revealed
  const [gateConsent, setGateConsent] = useState(true);
  const [agreeTos, setAgreeTos] = useState(false);   // required: ToS + privacy
  const [agreePromo, setAgreePromo] = useState(true); // optional: promo emails
  const searchInputRef = useRef(null);
  const [locCity, setLocCity] = useState("San Francisco, CA");
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState(null);

  // Live data: real businesses for a real location, served by /api/businesses
  // (OpenStreetMap Overpass, plus Google Places when a key is configured).
  // null = fetch not landed yet (or failed) -> the mock demo cache renders.
  const [live, setLive] = useState(null); // {rows, city, lat, lng, checkedAt, source, count, googleEnriched}
  const liveReq = useRef(0);              // request generation, drops stale responses
  const enrichBusy = useRef(new Set());   // per-business enrich in flight
  const [pendingCoords, setPendingCoords] = useState(null); // detected coords awaiting signup

  // admin QA switch (bottom-right): makes the paid gates functional
  const [admin, setAdmin] = useState(() => {
    try { return localStorage.getItem("b2w-admin") === "1"; } catch {}
    return false;
  });
  const [revCustom, setRevCustom] = useState(false);
  const [starsCustom, setStarsCustom] = useState(false);
  const [contacted, setContacted] = useState(() => new Set());
  const [excludeContacted, setExcludeContacted] = useState(false);
  const [multiCatOn, setMultiCatOn] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [compare, setCompare] = useState(() => new Set()); // multi-select for Pro compare
  const [view, setView] = useState("grid"); // "grid" | "split" | "trending"
  const rootRef = useRef(null);
  const [cats, setCats] = useState(() => new Set()); // stacked categories
  const [radiusOn, setRadiusOn] = useState(false);
  const [radiusMi, setRadiusMi] = useState(3);
  const [rtOn, setRtOn] = useState(false);           // simulated live mode
  const [ultra, setUltra] = useState(false);         // ULTRA demo: hyper-live stats
  // Viewers dock (bottom-left social proof). Admin can switch it off; the
  // choice persists and outlives admin, so a clean recording stays clean.
  const [viewersOn, setViewersOn] = useState(() => {
    try { return localStorage.getItem("b2w-viewers") !== "0"; } catch {}
    return true;
  });
  const [simTier, setSimTier] = useState("unlimited"); // admin: which tier to preview
  const [deskNote, setDeskNote] = useState(true);    // ≤768px: "use desktop" strip
  const [adminAsk, setAdminAsk] = useState(false);   // admin password modal
  const [adminPw, setAdminPw] = useState("");
  const [adminErr, setAdminErr] = useState(false);
  const [alertOn, setAlertOn] = useState(false);     // armed alert (mock)
  const [alertToast, setAlertToast] = useState(null); // {biz, ago} · dropped notification
  const alertIdx = useRef(0);

  // first-visit tour: step index 0-2, or null when done (stored)
  const [tour, setTour] = useState(() => {
    try { if (!localStorage.getItem("b2w-tour")) return 0; } catch {}
    return null;
  });
  const [tourEmail, setTourEmail] = useState(""); // tour signup field; the shared email is derived now

  // misc ui
  const [notes, setNotes] = useState({});
  const [now, setNow] = useState(() => new Date()); // UTC clock in the header
  const [guard, setGuard] = useState(false);        // screenshot blur (best effort)
  const [copiedName, setCopiedName] = useState(null);
  const [copiedRev, setCopiedRev] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [kPulse, setKPulse] = useState(false);
  // Customizable single-key shortcuts, persisted. Non-remappable keys (arrows,
  // Enter, Esc, /, Cmd/Ctrl K) stay fixed; these five are user-editable.
  const KB_DEFAULT = { phone: "c", reviews: "r", web: "w", map: "m" };
  const [keybinds, setKeybinds] = useState(() => {
    try { return { ...KB_DEFAULT, ...JSON.parse(localStorage.getItem("b2w-keys") || "{}") }; } catch { return { ...KB_DEFAULT }; }
  });
  useEffect(() => { try { localStorage.setItem("b2w-keys", JSON.stringify(keybinds)); } catch {} }, [keybinds]);
  const [rebinding, setRebinding] = useState(null); // which action is capturing a key
  // Notification preferences (mock), persisted.
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try { return { newLeads: true, priceDrops: false, weekly: true, product: true, ...JSON.parse(localStorage.getItem("b2w-notif") || "{}") }; } catch { return { newLeads: true, priceDrops: false, weekly: true, product: true }; }
  });
  useEffect(() => { try { localStorage.setItem("b2w-notif", JSON.stringify(notifPrefs)); } catch {} }, [notifPrefs]);
  const [theme, setTheme] = useState(() => {
    // OLED (pitch) is the first-visit default; a saved choice always wins.
    try { const v = localStorage.getItem("b2w-theme"); if (v === "light" || v === "dark" || v === "pitch") return v; } catch {}
    return "pitch";
  });

  // was: const [authed, setAuthed] = useState(false);
  // was: const [email, setEmail]   = useState("");
  const { user, signOut } = useAuth();
  const authed = !!user;
  const email = user?.email ?? "";
  // Mock settings become account settings. Anonymous: unchanged, localStorage
  // only. Signed in: pull on load (first-ever sign-in seeds the row FROM the
  // local state instead of clobbering it), push on change, debounced.
  useProfileSync({ theme, setTheme, keybinds, setKeybinds, notifPrefs, setNotifPrefs, setTier });
  // Effective tier the UI behaves as. Admin previews any tier via simTier; a
  // signed-in user is their own tier; anonymous is free.
  const effTier = admin ? simTier : (authed ? tier : "free");
  const isPaid = effTier === "starter" || effTier === "unlimited";
  const isUnlimited = effTier === "unlimited";
  const showAds = !isUnlimited;      // unlimited is ad-free; free + starter see ads
  const showLocks = !isPaid;         // padlocks only while on the free tier
  const noWall = admin || authed;    // real signed-in users and admin never hit the wall
  const canCompare = isPaid;
  const cmpActive = canCompare && compareOn;
  const toggleCmp = (name) => setCompare((s0) => { const n = new Set(s0); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const [authModal, setAuthModal] = useState(null); // null | "signup" | "login"
  const [authPw, setAuthPw] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authCode2, setAuthCode2] = useState(""); // referral code at signup
  const [authStep, setAuthStep] = useState("form"); // "form" | "code"
  const [authErr, setAuthErr] = useState("");
  const [pwShake, setPwShake] = useState(false);
  const [pendingCity, setPendingCity] = useState(null); // city awaiting free signup
  const [wall, setWall] = useState(false); // 60s wall: signup cannot be dismissed
  const walled = useRef(false);

  const locRef = useRef(null);
  const notesRef = useRef(null);
  const rowRefs = useRef(new Map());
  const upRef = useRef(null);

  // Drive the palette from data-theme on <html> (vars cascade to body too).
  // useLayoutEffect runs pre-paint so a light-mode visitor never flashes dark.
  useLayoutEffect(() => {
    try { document.documentElement.setAttribute("data-theme", theme); } catch {}
    try { localStorage.setItem("b2w-theme", theme); } catch {}
  }, [theme]);

  const liveRows = live ? live.rows : null;
  const pool = useMemo(() => {
    let base;
    if (admin && adminRows != null) {
      const n = Math.max(1, Math.min(adminRows, GEN_MAX));
      if (n <= ALL_ROWS.length) base = ALL_ROWS.slice(0, n);
      else {
        const gen = []; for (let i = 0; i < n - ALL_ROWS.length; i++) gen.push(genRow(i));
        base = ALL_ROWS.concat(gen);
      }
    } else if (liveRows && liveRows.length) {
      // Real crawled businesses. The anonymous free slice stays capped like
      // the demo (20 rows, 40 after the rewarded ad); paid/admin get it all.
      base = admin || isPaid ? liveRows : liveRows.slice(0, extra ? 40 : 20);
    } else {
      base = admin || extra ? ALL_ROWS : DATA; // admin (no target): full mock cache
    }
    return fresh.length ? [...fresh, ...base] : base;
  }, [admin, adminRows, extra, fresh, liveRows, isPaid]);

  // Category options track whatever is actually in the pool.
  const catOpts = useMemo(
    () => ["All categories", ...Array.from(new Set(pool.map((d) => d.cat))).sort()],
    [pool]);

  // "While you were away": newly listed no-website businesses you have not
  // opened yet. Deterministic so the badge count is stable across renders.
  const missed = useMemo(() => Array.from({ length: 6 }, (_, i) => freshRow(500 + i)), []);

  const qMatches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return pool
      .filter((d) => `${d.name} ${d.cat} ${d.hood} ${d.addr}`.toLowerCase().includes(t))
      .slice(0, 8);
  }, [q, pool]);

  const rows = useMemo(() => {
    let r = pool.filter((d) => {
      if (admin && multiCatOn && cats.size) { if (!cats.has(d.cat)) return false; }
      else if (cat !== "All categories" && d.cat !== cat) return false;
      if (minRev && (d.rev ?? 0) < minRev) return false;
      if (minStars && (ratingOf(d) ?? 0) < minStars) return false;
      if (hood && d.hood !== hood) return false;
      if (onlyLeads && d.status !== "none") return false;
      if (admin && excludeContacted && contacted.has(d.name)) return false;
      if (admin && radiusOn && geo) {
        const [la, lo] = llOf(d);
        if (hav(geo.lat, geo.lng, la, lo) > radiusMi) return false;
      }
      return true;
    });
    const dirMul = sort.dir === "desc" ? -1 : 1;
    const ord = (d) => STATUS_META[d.status].order;
    r = [...r].sort((a, b) => {
      let v = 0;
      if (sort.key === "rev") v = (a.rev ?? -1) - (b.rev ?? -1);
      else if (sort.key === "rating") v = (ratingOf(a) ?? -1) - (ratingOf(b) ?? -1);
      else if (sort.key === "name") v = a.name.localeCompare(b.name);
      else if (sort.key === "addr") v = a.addr.localeCompare(b.addr);
      else if (sort.key === "status") v = ord(a) - ord(b);
      else if (sort.key === "views") v = viewersOf(a) - viewersOf(b);
      else if (sort.key === "listed") v = listedMin(a) - listedMin(b);
      else if (sort.key === "dist" && geo) v = hav(geo.lat, geo.lng, ...llOf(a)) - hav(geo.lat, geo.lng, ...llOf(b));
      return v * dirMul;
    });
    return r;
  }, [pool, cat, minRev, minStars, hood, onlyLeads, sort, geo, excludeContacted, contacted, admin, multiCatOn, cats, radiusOn, radiusMi]);

  // Cache-wide totals, scaled down believably as min-reviews rises
  const decay = Math.exp(-minRev / 70);
  const base = TOTALS[cat] || TOTALS["All categories"];
  const cacheTotal = Math.max(rows.length, Math.round((onlyLeads ? base.l : base.t) * decay));
  const remaining = cacheTotal - rows.length;
  const freeCap = extra ? 40 : 20;

  // Resolve against the live pool first (it may hold generated or freshly
  // refreshed rows that are not in the static ALL_ROWS), then fall back.
  const findBiz = (name) => pool.find((d) => d.name === name) || ALL_ROWS.find((d) => d.name === name) || null;
  const selBiz = selected ? findBiz(selected) : null;

  const toggleSort = (key) =>
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
      : { key, dir: key === "rev" || key === "rating" ? "desc" : "asc" }));

  const fmt = (n) => n.toLocaleString("en-US");

  // Cache provenance labels, real when live data is up.
  const agoLabel = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
  };
  const snapLabel = live
    ? new Date(live.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Jun 5";
  const cityTag = (live ? live.city : locCity).split(",")[0].trim();

  const copyPhone = (d) => {
    if (!d.phone) return; // live row without a listed phone
    if (navigator.clipboard) navigator.clipboard.writeText(d.phone).catch(() => {});
    setCopiedName(d.name);
    setTimeout(() => setCopiedName(null), 850);
  };

  const copyPrompt = (d) => {
    if (navigator.clipboard) navigator.clipboard.writeText(aiPromptOf(d)).catch(() => {});
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1400);
  };

  const copyReviews = (d) => {
    const txt = reviewsText(d);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    setCopiedRev(true);
    setTimeout(() => setCopiedRev(false), 1400);
  };

  const selectRow = (d) => {
    setSelected(d.name);
    setPane({ mode: "business" });
    setCopiedRev(false);
    markViewed(d.name);
    enrichBiz(d); // live rows: pull rating, reviews, registry year, URL check
  };
  // Search opens the dedicated page, not the side pane.
  const openBizPage = (d) => { setBizPage(d); setPane({ mode: null }); setCopiedRev(false); setCopiedPrompt(false); setPageAdMode("ad"); markViewed(d.name); enrichBiz(d); };

  const rowClick = (e, d) => {
    if (e.shiftKey) {
      setMulti((m) => {
        const n = new Set(m);
        n.has(d.name) ? n.delete(d.name) : n.add(d.name);
        return n;
      });
      return;
    }
    selectRow(d);
  };

  const resetAll = () => {
    setCat("All categories"); setMinRev(0); setMinStars(0); setHood(null); setOnlyLeads(false);
    setSort({ key: "rev", dir: "desc" });
    setRevCustom(false); setStarsCustom(false); setExcludeContacted(false);
    setMultiCatOn(false); setCats(new Set()); setRadiusOn(false);
    setAdminRows(null); setEditRows(false);
    setSelected(null); setMulti(new Set()); setPane({ mode: null });
  };

  // One popover for every upsell. It anchors under the clicked element
  // (clamped to the viewport); `feature` optionally carries a {title, body}
  // pitch that renders above the plan bullets.
  // Open the pricing popover anchored near the top-right controls when a
  // feature is gated but there is no specific element to anchor to.
  const openUnlimitedAt = (feature = null) => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    setUpTier(null); setUpErr(false);
    setUp({ x: Math.max(8, vw - 460), y: 60, feature });
  };
  const openUnlimited = (el, feature = null) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    setUpTier(null); setUpErr(false);
    setUp({
      x: Math.max(8, Math.min(r.left, vw - 448)),
      y: Math.max(8, Math.min(r.bottom + 6, vh - 420)),
      feature,
    });
  };

  // Trial start: email required here; payment details are collected on
  // Stripe. The prototype opens Stripe checkout and starts the trial at
  // that tier.
  const startTrial = (plan) => {
    if (!authed && !admin && !trialEmail.trim()) { setUpErr(true); return; }
    // Logged-out: run the free signup first (email code), remembering the plan
    // so checkout resumes right after. Signed-in: straight to Stripe.
    if (!authed && !admin) {
      setPendingPlan(plan);
      setUp(null);
      goToLogin();
      return;
    }
    window.open("https://checkout.stripe.com", "_blank", "noopener");
    if (plan) setTier(plan);
    setUp(null);
  };

  // Distance from the located user to a business, in miles.
  const distMi = (d) => (geo ? hav(geo.lat, geo.lng, llOf(d)[0], llOf(d)[1]) : null);

  const flashGeo = (m) => { setGeoMsg(m); setTimeout(() => setGeoMsg(null), 3200); };

  // Pull the real business cache for a location. Resolves the city label via
  // /api/geocode when the caller doesn't have one, then crawls with
  // /api/businesses. On failure the mock demo cache stays up.
  const loadLive = async (lat, lng, cityLabel, opts = {}) => {
    const reqId = ++liveReq.current;
    setBusy("loading");
    try {
      let label = cityLabel;
      if (!label) {
        try {
          const g = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`).then((r) => r.json());
          if (g && g.ok && g.label) label = g.label;
        } catch {}
      }
      const qs = `lat=${lat}&lon=${lng}&radius=${opts.radiusM || 4000}` +
        `&city=${encodeURIComponent(label || "")}` + (opts.fresh ? "&fresh=1" : "");
      const r = await fetch(`/api/businesses?${qs}`);
      const j = await r.json();
      if (reqId !== liveReq.current) return null; // superseded by a newer request
      if (!j || !j.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
      setLive((prev) => {
        let rows = j.rows;
        if (opts.fresh && prev && prev.rows.length) {
          // A re-crawl: anything we have not seen before is "just listed".
          const known = new Set(prev.rows.map((x) => x.id));
          rows = rows.map((x) => (known.has(x.id) ? x : { ...x, listedAgoMin: 1 }));
        }
        return {
          rows, city: label || (prev && prev.city) || "your area",
          lat, lng, checkedAt: j.checkedAt, source: j.source,
          count: j.count, googleEnriched: j.googleEnriched,
        };
      });
      return j;
    } catch {
      if (reqId === liveReq.current) flashGeo("Live crawl unreachable right now. Showing the demo cache.");
      return null;
    } finally {
      if (reqId === liveReq.current) { setBusy("idle"); firstPaint.current = false; }
    }
  };

  // Per-business enrichment, fired when a row is opened: Google rating +
  // review text, registry year, and a live check of the listed URL. Whatever
  // comes back is merged into the row in place.
  const enrichBiz = (d) => {
    if (!d || !d.real || d.enriched || enrichBusy.current.has(d.id)) return;
    enrichBusy.current.add(d.id);
    const qs = new URLSearchParams({
      name: d.name,
      city: d.city || "",
      state: ((d.city || "").split(",")[1] || "").trim(),
      website: d.website || "",
    });
    if (d.lat != null && d.lon != null) { qs.set("lat", String(d.lat)); qs.set("lon", String(d.lon)); }
    fetch(`/api/enrich?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j || !j.ok) return;
        const patch = (x) => {
          if (x.id !== d.id) return x;
          const n = { ...x, enriched: true };
          if (j.rating != null) n.rating = j.rating;
          if (j.rev != null) n.rev = j.rev;
          if (j.reviews && j.reviews.length) n.reviews = j.reviews;
          if (j.website && !n.website) n.website = j.website;
          if (j.phone && !n.phone) n.phone = j.phone;
          if (j.mapsUri) n.mapsUri = j.mapsUri;
          if (j.sinceYear != null) n.sinceYear = j.sinceYear;
          if (j.statusPatch) {
            n.status = j.statusPatch.status;
            if (j.statusPatch.thirdKind) n.thirdKind = j.statusPatch.thirdKind; else delete n.thirdKind;
            n.statusNote = j.statusPatch.statusNote;
          }
          n.sources = Array.from(new Set([...(x.sources || []), ...(j.sources || [])]));
          return n;
        };
        setLive((prev) => (prev ? { ...prev, rows: prev.rows.map(patch) } : prev));
        setBizPage((bp) => (bp && bp.id === d.id ? patch(bp) : bp));
      })
      .catch(() => {})
      .finally(() => enrichBusy.current.delete(d.id));
  };

  // Locate: real browser geolocation -> reverse geocode -> real business
  // crawl for that spot, plus the nearest-first sort. The nearest-city table
  // is only the label fallback when the geocoder is unreachable. Switching
  // the cache to a non-SF city stays the signup gate for anonymous visitors.
  const locate = () => {
    if (locating) return;
    const fail = (msg) => { setLocating(false); flashGeo(msg); };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      flashGeo("This browser cannot share a location."); return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let label = null;
      try {
        const g = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`).then((r) => r.json());
        if (g && g.ok && g.label) label = g.label;
      } catch {}
      if (!label) {
        let best = CITIES[0], bd = Infinity;
        for (const c of CITIES) { const dd = hav(lat, lng, c.lat, c.lng); if (dd < bd) { bd = dd; best = c; } }
        label = best.n;
      }
      setLocating(false);
      setGeo({ lat, lng, city: label });
      setSort({ key: "dist", dir: "asc" });
      if (admin || authed || label.startsWith("San Francisco")) {
        setLocCity(label);
        loadLive(lat, lng, label);
      } else {
        setPendingCity(label);
        setPendingCoords({ lat, lng });
        goToLogin();
      }
    }, (err) => {
      fail(err && err.code === 1
        ? "Location permission denied. Allow access and try again."
        : "Could not detect your location. Try again.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };

  // Refresh (admin / paid): pull "just listed" businesses into the cache. A
  // short spin sells the crawl, then 2-4 fresh no-website leads land on top
  // and the sort flips to newest-first so they are visible immediately.
  const refreshCache = () => {
    if (refreshing) return;
    const wait = rlRetryIn("refresh");
    if (wait > 0) { setRefreshLock(wait); flashGeo(`Rate limited. ${RL.refresh.max} refreshes per minute. Try again in ${rlFmt(wait)}`); return; }
    rlHit("refresh");
    setRefreshLock(rlRetryIn("refresh"));
    setRefreshing(true);
    setBusy("loading");
    if (live) {
      // Real mode: re-crawl the area now; anything new floats to the top as
      // "just listed" (loadLive marks unseen rows with listedAgoMin).
      loadLive(live.lat, live.lng, live.city, { fresh: true }).then((j) => {
        setRefreshing(false);
        if (j) setSort({ key: "listed", dir: "asc" });
      });
      return;
    }
    setTimeout(() => {
      const batch = 2 + (freshCount.current % 3);
      const add = [];
      for (let i = 0; i < batch; i++) add.push(freshRow(freshCount.current + i));
      freshCount.current += batch;
      setFresh((f) => [...add, ...f].slice(0, 40));
      setSort({ key: "listed", dir: "asc" });
      setRefreshing(false);
      setBusy("idle");
    }, 650);
  };

  // CSV export (admin / paid): the current view or the shift+click selection.
  const exportCSV = (list) => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ["Name", "Category", "Reviews", "Stars", "Address", "Neighborhood", "Website status", "Phone"];
    const lines = [head.join(",")].concat(list.map((d) =>
      [d.name, d.cat, d.rev ?? "", ratingLabel(d), [d.addr, cityOf(d)].filter(Boolean).join(", "), d.hood, statusBits(d).label, d.phone || ""].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "b2web-sf-leads.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    try { localStorage.setItem("b2w-admin", admin ? "1" : "0"); } catch {}
    if (!admin) { setAdminRows(null); setEditRows(false); setFresh([]); }
    if (admin) setWall(false); // admin acts as the top paid tier: no wall
    if (!admin) setUltra(false);
  }, [admin]);

  useEffect(() => {
    try { localStorage.setItem("b2w-viewers", viewersOn ? "1" : "0"); } catch {}
  }, [viewersOn]);

  // Armed alerts (admin): simulate newly listed no-website businesses pushing
  // in. A toast drops from the top center ~1.2s after arming, then every 18s,
  // rotating through the cache (nearest first once located).
  useEffect(() => {
    if (!(admin && alertOn)) { setAlertToast(null); return; }
    const cand = (liveRows && liveRows.length ? liveRows : ALL_ROWS).filter((d) => d.status === "none");
    if (!cand.length) { setAlertToast(null); return; }
    if (geo) cand.sort((a, b) => hav(geo.lat, geo.lng, ...llOf(a)) - hav(geo.lat, geo.lng, ...llOf(b)));
    const fire = () => {
      const biz = cand[alertIdx.current % cand.length];
      alertIdx.current += 1;
      setAlertToast({ biz, ago: 1 + (hashStr(biz.name + "ago") % 9) });
    };
    const t0 = setTimeout(fire, 1200);
    const iv = setInterval(fire, 18000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [admin, alertOn, geo, liveRows]);

  // Each toast auto-dismisses; it is a preview, not a modal.
  useEffect(() => {
    if (!alertToast) return;
    const t = setTimeout(() => setAlertToast(null), 8000);
    return () => clearTimeout(t);
  }, [alertToast]);

  const endTour = () => { setTour(null); try { localStorage.setItem("b2w-tour", "1"); } catch {} };
  const nextTour = () => { if (tour < 3) setTour(tour + 1); };

  // Every login / signup entry point now hands off to the real auth page.
  // The in-app modal, the finviz wall, and the emailed-code step were a
  // prototype; b2web.site/login is the real gate.
  const goToLogin = () => { window.location.href = "https://b2web.site/login"; };

  // Prototype auth: flips the flag, applies a pending city unlock if the
  // signup came from the locate flow. Log out reverts to the SF demo slice.
  const signIn = (t) => {
    if (t) setTier(t);
    setAuthModal(null);
    setWall(false);
    setAcctMenu(false);
    setAuthPw(""); setAuthCode(""); setAuthErr("");
    if (pendingCity) {
      setLocCity(pendingCity);
      // Detection ran before signup: load the real cache for those coords now.
      if (pendingCoords) { loadLive(pendingCoords.lat, pendingCoords.lng, pendingCity); setPendingCoords(null); }
      setPendingCity(null);
    }
    if (pendingLoc) { setPendingLoc(false); locate(); flashGeo("Detecting your location and crawling the businesses around you."); } // finish the detect flow
    if (pendingPlan) { const pl = pendingPlan; setPendingPlan(null); setTier(pl); window.open("https://checkout.stripe.com", "_blank", "noopener"); }
  };
  const doLogOut = async () => {
    if (busyAuth) return;
    setBusyAuth("logout");
    await flushProfileNow();            // a keybind changed 2s ago still lands
    const { error } = await signOut();  // SIGNED_OUT flips `authed` via context
    setBusyAuth(null);
    if (error) { flashGeo("Could not sign out. Try again."); return; }
    setTier("free"); setAcctMenu(false); setLocCity("San Francisco, CA");
    setLogoutAsk(false);
  };

  // Registered-email store (prototype): signing up with a known email routes
  // to log in. Non-Gmail/Outlook emails also require a phone number.
  const bump = () => { setPwShake(true); setTimeout(() => setPwShake(false), 420); };
  const resendCode = () => {
    if (resendLeft > 0) return;
    const wait = rlRetryIn("auth");
    if (wait > 0) { setAuthLock(wait); setAuthErr(`Too many attempts. Try again in ${rlFmt(wait)}.`); return; }
    rlHit("auth");
    setResendLeft(60);
  };
  const REG_KEY = "b2w-users";
  const regList = () => { try { return JSON.parse(localStorage.getItem(REG_KEY) || "[]"); } catch { return []; } };
  const regAdd = (em) => { try { const l = regList(); if (!l.includes(em)) { l.push(em); localStorage.setItem(REG_KEY, JSON.stringify(l)); } } catch {} };
  const regRemove = (em) => { try { localStorage.setItem(REG_KEY, JSON.stringify(regList().filter((x) => x !== em))); } catch {} };
  const deleteAccount = () => {
    if (busyAuth) return;
    setBusyAuth("delete");
    // Deleting the account, purging credits and lists, takes a moment.
    setTimeout(() => {
      regRemove(email.trim().toLowerCase());
      setDeleteAsk(false); setDeleteText("");
      setAcctOpen(false);
      doLogOut();
      setBusyAuth(null);
      flashGeo("Account deleted. You are back on the anonymous San Francisco cache.");
    }, 1200);
  };
  // NIST-style: length beats complexity. Accept >= 15 chars, or a passphrase
  // of 4+ words. No forced numbers/symbols/case.
  const strongPw = (pw) => pw.trim().length >= 15 || pw.trim().split(/\s+/).filter(Boolean).length >= 4;
  const needsPhone = (em) => /@/.test(em) && !/@(gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|live\.com)\s*$/i.test(em.trim());

  // Step 1: identifier + password (+ phone when required). A matching pair
  // "sends" a 6-digit code to the email (mocked). Step 2 confirms it.
  const authContinue = (su, inGate) => {
    const wait = rlRetryIn("auth");
    if (wait > 0) { setAuthLock(wait); setAuthErr(`Too many attempts. Try again in ${rlFmt(wait)}.`); bump(); return; }
    const em = email.trim();
    if (!em || !authPw.trim() || (needsPhone(em) && !authPhone.trim())) { rlHit("auth"); setAuthLock(rlRetryIn("auth")); setAuthErr("Must fill in required fields."); bump(); return; }
    if (su && !strongPw(authPw)) { rlHit("auth"); setAuthLock(rlRetryIn("auth")); setAuthErr("Use at least 15 characters, or 4+ words as a passphrase."); bump(); return; }
    if (su && !inGate && !agreeTos) { setAuthErr("Please agree to the Terms of Service and Privacy Policy to continue."); bump(); return; }
    if (su && regList().includes(em.toLowerCase())) {
      if (inGate) setGateMode("login"); else setAuthModal("login");
      setAuthErr("That email already has an account. Log in instead.");
      return;
    }
    rlClear("auth"); // a valid identifier+password pair resets the window
    setAuthLock(0);
    setAuthErr("");
    // Sending the code takes a moment; the code step only appears once it
    // would plausibly have landed in an inbox.
    setBusyAuth("sending");
    setTimeout(() => {
      setBusyAuth(null);
      setAuthStep("code");
      setResendLeft(60);
    }, 850);
  };
  const authConfirm = (su) => {
    if (busyAuth) return;
    const wait = rlRetryIn("code");
    if (wait > 0) { setAuthLock(wait); setAuthErr(`Too many code attempts. Try again in ${rlFmt(wait)}.`); bump(); return; }
    if (authCode.trim().length < 6) { rlHit("code"); setAuthLock(rlRetryIn("code")); setAuthErr("Enter the 6-digit code from your email."); bump(); return; }
    // Verifying the code and provisioning the session takes a round trip.
    setAuthErr("");
    setBusyAuth(su ? "signup" : "login");
    setTimeout(() => {
      rlClear("code");
      setAuthLock(0);
      if (su) regAdd(email.trim().toLowerCase());
      setBusyAuth(null);
      signIn("free");
    }, 1100);
  };

  const openAd = () => { setAdOpen(true); setAdLeft(5); };
  const claimRows = () => { setExtra(true); setAdOpen(false); };

  // rewarded-ad countdown (5s demo timer standing in for the 60s unit)
  useEffect(() => {
    if (!adOpen || adLeft <= 0) return;
    const t = setTimeout(() => setAdLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [adOpen, adLeft]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live "current viewers" wobble. ULTRA makes it lurch faster and wider.
  useEffect(() => {
    const period = ultra ? 380 : 2600;
    const t = setInterval(() => {
      setViewers((v) => {
        const swing = ultra ? 14 : 3;
        let n = v + (Math.floor(Math.random() * (swing * 2 + 1)) - swing);
        if (n < 120) n = 120 + Math.floor(Math.random() * 20);
        if (n > 940) n = 940 - Math.floor(Math.random() * 20);
        return n;
      });
    }, period);
    return () => clearInterval(t);
  }, [ultra]);

  // LIVE (admin): the cache streams. Every 1.6s a newly listed no-website
  // business lands on top and everything already in the fresh block ages a
  // minute, so the feed visibly flows down and off the bottom at 40 rows.
  // Sort pins to newest-first on the way in; a hand sort afterwards is left
  // alone. No setBusy here: skeletons would strobe the table every tick.
  useEffect(() => {
    if (!(admin && ultra)) return;
    setSort({ key: "listed", dir: "asc" });
    const t = setInterval(() => {
      const row = { ...freshRow(freshCount.current), listedAgoMin: 1 };
      freshCount.current += 1;
      setFresh((f) => [row, ...f.map((d) => ({ ...d, listedAgoMin: (d.listedAgoMin ?? 0) + 1 }))].slice(0, 40));
    }, 1600);
    return () => clearInterval(t);
  }, [admin, ultra]);

  // Resend-code cooldown countdown
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = setTimeout(() => setResendLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);

  // Rate-limit countdowns. Recomputed from the stored window each tick, so
  // they stay honest across tab sleeps and reloads.
  useEffect(() => {
    if (refreshLock <= 0 && authLock <= 0) return;
    const t = setInterval(() => {
      setRefreshLock(rlRetryIn("refresh"));
      setAuthLock(Math.max(rlRetryIn("auth"), rlRetryIn("code")));
    }, 1000);
    return () => clearInterval(t);
  }, [refreshLock, authLock]);

  // Restore any lock still in force from a previous session
  useEffect(() => {
    setRefreshLock(rlRetryIn("refresh"));
    setAuthLock(Math.max(rlRetryIn("auth"), rlRetryIn("code")));
  }, []);

  // Initial cache fetch when the page opens: the real SF slice by default
  // (Locate swaps in the visitor's own area). If the crawl fails, the demo
  // rows stay up and the timeout below still clears the skeleton.
  useEffect(() => {
    loadLive(37.7749, -122.4194, "San Francisco, CA");
    const t = setTimeout(() => { setBusy((b) => (b === "loading" ? "idle" : b)); firstPaint.current = false; }, 15000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-index whenever the filter or sort inputs change (skip the first paint,
  // which the load effect already covers). A short flash, long enough to read
  // as work without getting in the way.
  useEffect(() => {
    if (firstPaint.current) return;
    setBusy("indexing");
    clearTimeout(idxTimer.current);
    idxTimer.current = setTimeout(() => setBusy("idle"), 360);
    return () => clearTimeout(idxTimer.current);
  }, [cat, minRev, minStars, hood, onlyLeads, q, sort, multiCatOn]);

  // Screenshot deterrent. Best effort only: browsers cannot truly block OS
  // captures. PrintScreen and window focus loss blur everything; focus
  // restores it. Screen recorders that keep focus are unaffected.
  useEffect(() => {
    let t;
    const up = (e) => {
      if (e.key === "PrintScreen") {
        setGuard(true);
        clearTimeout(t); t = setTimeout(() => setGuard(false), 1500);
      }
    };
    const onBlur = () => setGuard(true);
    const onFocus = () => setGuard(false);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // in-feed ad: count down to 0, then the Cancel control goes live
  useEffect(() => {
    if (inFeedCountdown <= 0) return;
    const t = setTimeout(() => setInFeedCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [inFeedCountdown]);


  // Close the popover when clicking anywhere outside it
  useEffect(() => {
    if (!up) return;
    const onDoc = (e) => {
      if (upRef.current && !upRef.current.contains(e.target)) setUp(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [up]);

  // Hard wall: after 2 minutes of anonymous browsing a full-page signup gate
  // takes over and cannot be clicked away. Admin (= top paid tier) is exempt
  // so QA never gets locked out; the timer waits for the first-visit tour.
  useEffect(() => {
    if (authed || admin || walled.current || tour != null) return;
    const t = setTimeout(() => {
      walled.current = true;
      goToLogin();
    }, 120000);
    return () => clearTimeout(t);
  }, [authed, admin, tour]);

  // Close the share popover / account menu on outside clicks
  useEffect(() => {
    if (!share) return;
    const onDoc = (e) => { if (shareRef.current && !shareRef.current.contains(e.target)) setShare(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [share]);
  useEffect(() => {
    if (!exportMenu) return;
    const onDoc = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportMenu]);
  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [notifOpen]);
  useEffect(() => {
    if (!acctMenu) return;
    const onDoc = (e) => { if (acctRef.current && !acctRef.current.contains(e.target)) setAcctMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [acctMenu]);

  // Reset the auth flow whenever the modal opens or switches mode
  useEffect(() => {
    if (!authModal) return;
    setAuthStep("form"); setAuthCode("");
  }, [authModal]);

  // Close the search dropdown on any outside click
  useEffect(() => {
    if (!qOpen) return;
    const onDoc = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setQOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [qOpen]);

  // Close the "detect my location" popover on any outside click
  useEffect(() => {
    if (!locPrompt) return;
    const onDoc = (e) => {
      if (locPromptRef.current && !locPromptRef.current.contains(e.target) &&
          locRef.current && !locRef.current.contains(e.target)) setLocPrompt(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [locPrompt]);

  // ── Keyboard suite ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Capturing a new shortcut in Preferences takes priority over everything.
      if (rebinding) {
        const key = e.key.length === 1 ? e.key.toLowerCase() : null;
        e.preventDefault();
        if (key && /[a-z0-9]/.test(key)) {
          setKeybinds((kb) => {
            // If the key is already used by another action, swap them.
            const clash = Object.keys(kb).find((a) => kb[a] === key && a !== rebinding);
            const next = { ...kb, [rebinding]: key };
            if (clash) next[clash] = kb[rebinding];
            return next;
          });
        }
        setRebinding(null);
        return;
      }
      const inField = e.target.closest && e.target.closest("input, textarea, select");

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        locRef.current && locRef.current.focus();
        setKPulse(true);
        setTimeout(() => setKPulse(false), 1100);
        return;
      }

      if (e.key === "Escape") {
        if (adminAsk) { setAdminAsk(false); return; } // reachable even behind the wall
        if (tour != null || wall) return; // tour and the wall cannot be dismissed
        if (share) { setShare(null); return; }
        if (bizPage) { setBizPage(null); return; }
        if (infoPage) { setInfoPage(null); return; }
        if (alertToast) { setAlertToast(null); return; }
        if (acctMenu) { setAcctMenu(false); return; }
        if (acctOpen) { setAcctOpen(false); return; }
        if (up) { setUp(null); return; }
        if (locPrompt) { setLocPrompt(null); return; }
        if (authModal) { setAuthModal(null); setPendingCity(null); setPendingLoc(false); return; }
        if (adOpen) { setAdOpen(false); return; }
        if (inField) { e.target.blur(); return; }
        if (pane.mode) { setPane({ mode: null }); return; }
        if (multi.size) { setMulti(new Set()); return; }
        if (selected) { setSelected(null); return; }
        return;
      }

      if (tour != null) {
        if (e.key === "Enter" && tour < 3) { e.preventDefault(); nextTour(); }
        return;
      }

      if (bizPage && e.key === "ArrowLeft") { e.preventDefault(); setBizPage(null); return; }

      if (inField || adOpen || authModal || locPrompt || bizPage || wall || infoPage) return;

      if (e.key === "/") { e.preventDefault(); if (searchInputRef.current) searchInputRef.current.focus(); return; }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return;
        e.preventDefault();
        const idx = rows.findIndex((d) => d.name === selected);
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = idx === -1
          ? (step === 1 ? 0 : rows.length - 1)
          : Math.min(rows.length - 1, Math.max(0, idx + step));
        const d = rows[next];
        selectRow(d);
        requestAnimationFrame(() => {
          const el = rowRefs.current.get(d.name);
          el && el.scrollIntoView({ block: "nearest" });
        });
        return;
      }

      if (e.key === "Enter" && pane.mode === "business") {
        e.preventDefault();
        notesRef.current && notesRef.current.focus();
        return;
      }

      const k = e.key.toLowerCase();
      if (k === keybinds.phone && selBiz) { copyPhone(selBiz); return; }
      if (k === keybinds.reviews && selBiz) { copyReviews(selBiz); return; }
      if ((k === keybinds.web || k === keybinds.map) && selBiz) {
        // Browsers focus the new tab; true background tabs can't be forced from
        // JS. Selection persists, so the panel state is intact on return.
        window.open(k === keybinds.web ? webHref(selBiz) : mapHref(selBiz), "_blank", "noopener");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, selBiz, pane.mode, multi, adOpen, up, tour, authModal, locPrompt, alertToast, bizPage, infoPage, wall, share, acctMenu, acctOpen, adminAsk, keybinds, rebinding]);

  // ── Pane content (business detail only) ─────────────────────────────────────
  const paneTitle = pane.mode === "business" && selBiz ? selBiz.name : "";

  // Mobile nav: the desktop header cluster restated as dense menu rows. The
  // burger sits inside the existing top bar, so the menu costs zero vertical
  // space; every action delegates to the same handlers the desktop uses.
  const mnavItems = [
    { key: "search", label: "Search businesses", hint: "/", onClick: () => searchInputRef.current?.focus() },
    { key: "loc", label: locating ? "Locating..." : `Location: ${locCity}`, onClick: () => setLocPrompt({ x: 8, y: 56 }) },
    { key: "alerts", label: "No-website alerts", hint: isPaid ? null : "Paid", onClick: () => (isPaid
      ? flashGeo("Alerts are armed: new no-website listings will notify you")
      : openUnlimitedAt({ title: "Alerts", body: "Get notified the moment a new no-website business appears in your categories and area. Alerts ship with the paid plans." })) },
    { key: "lists", label: "Saved lists", hint: isPaid ? null : "Paid", onClick: () => (isPaid
      ? flashGeo("Saved lists: you have no lists yet. Select leads and choose Add to list.")
      : openUnlimitedAt({ title: "Saved lists", body: "Group leads into named lists (Barbers, Follow-ups, Won) and jump back to them any time. Saved lists ship with the paid plans." })) },
    { key: "plans", label: "Plans & pricing", onClick: () => openUnlimitedAt() },
    { key: "about", label: "About", onClick: () => setInfoPage("about") },
    { key: "help", label: "Help", onClick: () => setInfoPage("help") },
    { key: "theme", label: `Theme: ${theme === "light" ? "Light" : theme === "pitch" ? "Pitch black" : "Dark"}`,
      onClick: () => setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "pitch" : "light")) },
    { key: "d1", kind: "divider" },
    ...(authed
      ? [
          { key: "acctHead", kind: "heading", label: email || "Account" },
          { key: "acct", label: "Manage account", onClick: () => setAcctOpen(true) },
          { key: "prefs", label: "Preferences", onClick: () => setAcctOpen2(true) },
          { key: "logout", label: "Log out", onClick: () => setLogoutAsk(true) },
        ]
      : [
          { key: "login", label: "Log in", onClick: goToLogin },
          { key: "signup", label: "Sign up free", accent: true, onClick: goToLogin },
        ]),
  ];

  return (
    <div ref={rootRef} style={{ ...S.root, paddingBottom: 24 }} className={!admin && guard ? "snapguard" : ""}>
      <style>{CSS}</style>
      {!admin && guard && (
        <div className="guardNote" style={S.guardNote}>
          <span style={S.guardBadge}>Screenshots are disabled. Cached lead data is licensed to your plan.</span>
        </div>
      )}

      {/* Top bar — the whole header. No hero, no tagline. */}
      <header className="topbar" style={S.topbar}>
        <div style={S.brandWrap}>
          <button className="brandBtn" style={S.brandBtn} onClick={resetAll} title="Reset filters">
            <span style={{ color: TEXT, fontWeight: 700 }}>B2Web</span>
            <span style={{ color: RED, fontFamily: mono }}>.site</span>
          </button>
        </div>

        <div className="centerUnit" style={S.centerUnit}>
        <div ref={searchWrapRef} className="searchWrapInner" style={S.searchWrapInner}>
          <span style={S.searchIcon} aria-hidden="true"><Icon k="search" size={12} /></span>
          <input ref={searchInputRef} style={S.searchInput} placeholder="Search businesses ( / )"
            aria-label="Search businesses" value={q}
            onChange={(e) => { setQ(e.target.value); setQOpen(true); setQIdx(0); }}
            onFocus={() => q.trim() && setQOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setQIdx((i) => Math.min(i + 1, qMatches.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setQIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && qMatches[qIdx]) { openBizPage(qMatches[qIdx]); setQ(""); setQOpen(false); e.currentTarget.blur(); }
              else if (e.key === "Escape") { e.stopPropagation(); setQOpen(false); e.currentTarget.blur(); }
            }} />
          {qOpen && q.trim() && (
            <div style={S.searchDrop} role="listbox" aria-label="Search results">
              {qMatches.length ? qMatches.map((d, i) => {
                const sb = statusBits(d);
                return (
                  <button key={d.name} className="qItem" role="option" aria-selected={i === qIdx}
                    style={{ ...S.qItem, ...(i === qIdx ? { background: SEL } : null) }}
                    onMouseEnter={() => setQIdx(i)}
                    onClick={() => { openBizPage(d); setQ(""); setQOpen(false); }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                      <span style={{ display: "block", fontSize: 10, color: MUTED }}>{d.cat}, {d.hood}</span>
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: d.status === "site" ? MUTED : sb.color, flexShrink: 0 }}>{sb.label}</span>
                  </button>
                );
              }) : (
                <div style={{ padding: "10px 11px", fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                  No matches in your slice. The paid cache holds the full city.
                  <button className="paneLink" style={{ ...S.paneLink, marginTop: 6, display: "block" }}
                    onClick={(e) => { setQOpen(false); openUnlimited(e.currentTarget); }}>
                    See plans
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
          <button ref={cityRef} className="cityBtn" style={S.cityBtn}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const vw = window.innerWidth || 1200;
              setLocPrompt({ x: Math.max(8, Math.min(r.left, vw - 288)), y: r.bottom + 6 });
            }}
            title="Change location">
            <Icon k="target" size={11} />
            <span style={{ color: TEXT, fontWeight: 700 }}>{locating ? "Locating..." : locCity}</span>
          </button>
        </div>
        <div className="topMeta" style={S.topMeta}>
          <span ref={notifRef} style={{ position: "relative", display: "inline-flex" }}>
            <button className="themeBtn" style={S.themeBtn} aria-label="Notifications"
              title={isPaid ? "New no-website listings you missed" : "Alerts are a paid feature"}
              onClick={(e) => {
                if (!isPaid) { openUnlimited(e.currentTarget, { title: "Alerts", body: "Get notified the moment a new no-website business appears in your categories and area. Alerts ship with the paid plans." }); return; }
                setNotifOpen((v) => !v); setNotifSeen(true);
              }}>
              <Icon k="bell" size={15} />
              {isPaid && !notifSeen && <span style={S.notifDot} aria-hidden="true" />}
            </button>
            {notifOpen && (
              <span style={S.notifPop} role="menu" aria-label="New listings">
                <span style={S.notifHead}>
                  <span>New since your last visit</span>
                  <span style={{ color: FAINT }}>{missed.length}</span>
                </span>
                {missed.map((d) => {
                  const sb = statusBits(d);
                  return (
                    <button key={d.name} className="qItem" style={{ ...S.qItem, padding: "8px 10px" }}
                      onClick={() => { setNotifOpen(false); openBizPage(d); }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        <span style={{ display: "block", fontSize: 9.5, color: MUTED }}>{d.cat}, {d.hood}, listed {listedLabel(d)}</span>
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, color: sb.c, flexShrink: 0 }}>{sb.label}</span>
                    </button>
                  );
                })}
              </span>
            )}
          </span>
          <button className="themeBtn" style={S.themeBtn} aria-label="Saved lists"
            title={isPaid ? "Your saved lead lists" : "Saved lists are a paid feature"}
            onClick={(e) => {
              if (!isPaid) { openUnlimited(e.currentTarget, { title: "Saved lists", body: "Group leads into named lists (Barbers, Follow-ups, Won) and jump back to them any time. Saved lists ship with the paid plans." }); return; }
              flashGeo("Saved lists: you have no lists yet. Select leads and choose Add to list.");
            }}>
            <Icon k="bookmark" size={15} />
          </button>
          <button className="hdrLink" style={S.hdrLink} onClick={() => setInfoPage("about")}>About</button>
          <button className="hdrLink" style={S.hdrLink} onClick={() => setInfoPage("help")}>Help</button>
          <button className="themeBtn" style={S.themeBtn}
            onClick={() => setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "pitch" : "light"))}
            title={`Theme: ${theme === "light" ? "Light" : theme === "pitch" ? "Pitch black" : "Dark"}. Click to change`}
            aria-label="Cycle theme: light, dark, pitch black">
            <Icon k={theme === "light" ? "sun" : "moon"} size={14} fill={theme === "pitch" ? "currentColor" : "none"} />
          </button>
          {admin ? (
            <button className="tierChipBtn" style={S.tierChip}
              title="Demo mode. Sign up to use a real account."
              onClick={goToLogin}>
              DEMO
            </button>
          ) : authed ? (
            <button className="tierChipBtn" style={S.tierChip}
              title="Your current plan. Click to see upgrades."
              onClick={() => openUnlimitedAt()}>
              {effTier.toUpperCase()}
            </button>
          ) : null}
          {authed ? (
            <span ref={acctRef} style={{ position: "relative", display: "inline-flex" }}>
              <button className="btnO" style={{ ...S.outBtn, padding: "6px 12px", maxWidth: 180, whiteSpace: "nowrap" }}
                onClick={() => setAcctMenu((v) => !v)} aria-haspopup="menu" aria-expanded={acctMenu}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{email || "Account"}</span>
              </button>
              {acctMenu && (
                <span style={S.acctMenu} role="menu" aria-label="Account">
                  <button className="acctItem" style={S.acctItem} role="menuitem"
                    onClick={() => { setAcctMenu(false); setAcctOpen(true); }}>Manage account</button>
                  <button className="acctItem" style={S.acctItem} role="menuitem"
                    onClick={() => { setAcctMenu(false); setAcctOpen2(true); }}>Preferences</button>
                  <button className="acctItem" style={S.acctItem} role="menuitem"
                    onClick={() => { setAcctMenu(false); setLogoutAsk(true); }}>Log out</button>
                </span>
              )}
            </span>
          ) : (
            <>
              <button className="btnO" style={{ ...S.outBtn, padding: "6px 14px" }}
                onClick={goToLogin}>Log in</button>
              <button className="btnP" style={{ ...S.priBtn, padding: "6px 16px" }}
                onClick={goToLogin}>Sign up</button>
            </>
          )}
        </div>
        {/* ≤768px: the header cluster above hides and this burger takes over */}
        <MobileScreener label="Screener menu" items={mnavItems} />
      </header>

      {/* ≤768px only: mobile is a compact read-only slice of the screener.
          Power filters, compare, exports, and views live on desktop, so say
          so up front instead of letting the missing chrome read as broken. */}
      {deskNote && (
        <div className="mobileNotice" role="note">
          <span>
            <strong style={{ color: TEXT }}>To unlock the full abilities of the screener, use B2Web on desktop.</strong>{" "}
            Mobile shows a compact view: business name and website status.
          </span>
          <button className="mobileNoticeX" onClick={() => setDeskNote(false)} aria-label="Dismiss notice">✕</button>
        </div>
      )}

      {/* Control deck: free filters left, locked power filters right — visible, never hidden */}
      <div className="filtersDeck" style={S.filters}>
        <div style={S.fGroup}>
          <label style={S.fLabel} htmlFor="f-cat">Category</label>
          <select id="f-cat" style={S.select} value={admin && multiCatOn ? "All categories" : cat}
            onChange={(e) => {
              const v = e.target.value;
              if (admin && multiCatOn) {
                if (v !== "All categories") setCats((s0) => { const n = new Set(s0); n.add(v); return n; });
                return;
              }
              setCat(v);
            }}>
            {catOpts.map((c) => <option key={c}>{c}</option>)}
            {!catOpts.includes(cat) && <option key={cat}>{cat}</option>}
          </select>
          {admin && multiCatOn && [...cats].map((c) => (
            <button key={c} className="hoodChip" style={S.hoodChip}
              onClick={() => setCats((s0) => { const n = new Set(s0); n.delete(c); return n; })}
              title="Remove category">
              {c} <span style={{ marginLeft: 5, color: MUTED }}>✕</span>
            </button>
          ))}
        </div>

        <span style={S.vrule} />

        <div style={S.fGroup}>
          <label style={S.fLabel} htmlFor="f-rev">Min reviews</label>
          {revCustom ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input id="f-rev" type="number" min="0" style={{ ...S.select, minWidth: 70, width: 70 }}
                value={minRev} onChange={(e) => setMinRev(Math.max(0, +e.target.value || 0))}
                aria-label="Custom minimum reviews" />
              <button className="tagBtn" style={{ ...S.tagBtn, marginLeft: 0 }} title="Back to presets"
                onClick={() => { setRevCustom(false); setMinRev(0); }}>Cancel</button>
            </span>
          ) : (
          <select id="f-rev" style={{ ...S.select, minWidth: 90 }} value={minRev}
            onChange={(e) => {
              if (e.target.value === "custom") {
                if (admin) { setRevCustom(true); return; }
                openUnlimited(e.target, { title: "Custom filters", body: FEATURES["Custom filters"] }); return;
              }
              setMinRev(+e.target.value);
            }}>
            {REVIEW_STOPS.map((n) => <option key={n} value={n}>{n === 0 ? "Any" : `${n}+`}</option>)}
            <option value="custom">{admin ? "Custom" : "Custom 🔒"}</option>
          </select>
          )}
        </div>

        <span style={S.vrule} />

        <div style={S.fGroup}>
          <label style={S.fLabel} htmlFor="f-stars">Min stars</label>
          {starsCustom ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input id="f-stars" type="number" min="0" max="5" step="0.1" style={{ ...S.select, minWidth: 70, width: 70 }}
                value={minStars} onChange={(e) => setMinStars(Math.max(0, Math.min(5, +e.target.value || 0)))}
                aria-label="Custom minimum stars" />
              <button className="tagBtn" style={{ ...S.tagBtn, marginLeft: 0 }} title="Back to presets"
                onClick={() => { setStarsCustom(false); setMinStars(0); }}>Cancel</button>
            </span>
          ) : (
          <select id="f-stars" style={{ ...S.select, minWidth: 90 }} value={minStars}
            onChange={(e) => {
              if (e.target.value === "custom") {
                if (admin) { setStarsCustom(true); return; }
                openUnlimited(e.target, { title: "Custom filters", body: FEATURES["Custom filters"] }); return;
              }
              setMinStars(+e.target.value);
            }}>
            {STAR_STOPS.map((n) => <option key={n} value={n}>{n === 0 ? "Any" : `${n.toFixed(1)}★`}</option>)}
            <option value="custom">{admin ? "Custom" : "Custom 🔒"}</option>
          </select>
          )}
        </div>

        <div className="viewGroup" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.fLabel}>View</span>
          <span style={S.billSeg} role="tablist" aria-label="Layout view">
            {[["grid", "Grid"], ["split", "Split"], ["trending", "Trending"]].map(([v, lab]) => {
              const paid = isPaid;
              const locked = v !== "grid" && !paid;
              return (
                <button key={v} role="tab" aria-selected={view === v}
                  style={{ ...S.billBtn, ...(view === v ? S.billOn : null) }}
                  onClick={(e) => {
                    if (locked) { openUnlimited(e.currentTarget, { title: `${lab} view`, body: "Split view keeps the screener on the left and the business you are working on the right. Trending ranks the cache by how many people are viewing each lead right now. Both ship with the paid plans." }); return; }
                    setView(v);
                  }}>
                  {lab}{locked && <Lock />}
                </button>
              );
            })}
          </span>
          {canCompare && (
            <button className="billBtn" style={{ ...S.billBtn, border: `1px solid ${LINE}`, borderRadius: 2, ...(compareOn ? S.billOn : null) }}
              onClick={() => { if (compareOn) setCompare(new Set()); setCompareOn(!compareOn); }}
              title="Select multiple businesses to compare side by side">
              Compare{compare.size ? ` (${compare.size})` : ""}
            </button>
          )}
          {isPaid && (
            <button className="themeBtn" style={S.themeBtn} title="Full screen the screener"
              onClick={() => {
                const el = rootRef.current;
                if (!el) return;
                if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
                else el.requestFullscreen && el.requestFullscreen();
              }}
              aria-label="Toggle full screen">
              <Icon k="expand" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Power (paid) filters — their own row beneath the free filters */}
      <div className="lockedRow" style={S.lockedRow}>
        <span style={S.fLabel}>Power filters</span>
        <div style={S.lockedChips} aria-label="Locked paid features">
          {Object.keys(FEATURES).filter((l) => l !== "Custom filters").map((l) => {
            // Admin: every chip is functional. [isOn, toggle] per label.
            const toggles = {
              "Exclude contacted": [excludeContacted, () => setExcludeContacted(!excludeContacted)],
              "Multiple categories": [multiCatOn, () => { if (multiCatOn) setCats(new Set()); setMultiCatOn(!multiCatOn); }],
              "Radius / Draw area": [radiusOn, () => {
                if (!radiusOn && !geo) { flashGeo("Request your location first"); return; }
                setRadiusOn(!radiusOn);
              }],
              "Real-time data": [rtOn, () => setRtOn(!rtOn)],
              "Compare businesses": [compareOn, () => { if (compareOn) setCompare(new Set()); setCompareOn(!compareOn); }],
            };
            const t = toggles[l];
            const active = admin && t ? t[0] : false;
            return (
              <button key={l} className="lockedChip" style={{ ...S.lockedChip, ...(active ? S.chipOn : null) }}
                onClick={(e) => {
                  if (admin && t) { t[1](); return; }
                  if (admin) { flashGeo(l + " is on (admin mock)"); return; }
                  openUnlimited(e.currentTarget, { title: l, body: FEATURES[l] });
                }}
                aria-pressed={t ? active : undefined}
                title={admin ? "Admin: functional" : "Paid plan filter. Click to preview"}>
                {l}{admin && radiusOn && l === "Radius / Draw area" ? `: ${radiusMi} mi` : ""}
              </button>
            );
          })}
          {admin && radiusOn && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <input type="number" min="1" max="30" style={{ ...S.select, minWidth: 58, width: 58 }}
                value={radiusMi} onChange={(e) => setRadiusMi(Math.max(1, Math.min(30, +e.target.value || 1)))}
                aria-label="Radius in miles" />
              <span style={{ fontSize: 10, color: MUTED }}>mi</span>
            </span>
          )}
        </div>

        {isPaid && (
          <span ref={exportRef} style={{ position: "relative", display: "inline-flex", marginLeft: "auto" }}>
            <button className="billBtn" style={{ ...S.billBtn, border: `1px solid ${LINE}`, borderRadius: 2 }}
              onClick={() => setExportMenu((v) => !v)} aria-haspopup="menu" aria-expanded={exportMenu}
              title="Send the current view to a CSV or your CRM">
              <Icon k="expand" size={11} /> Export{picks.size ? ` (${picks.size})` : ""}
            </button>
            {exportMenu && (
              <span style={S.acctMenu} role="menu">
                <button className="acctItem" style={S.acctItem} role="menuitem"
                  onClick={() => { const list = picks.size ? rows.filter((d) => picks.has(d.name)) : rows; exportCSV(list); setExportMenu(false); }}>
                  Export CSV{picks.size ? ` (${picks.size} selected)` : " (current view)"}
                </button>
                <button className="acctItem" style={S.acctItem} role="menuitem"
                  onClick={() => { flashGeo("Webhook fired: " + (picks.size || rows.length) + " leads pushed to your endpoint"); setExportMenu(false); }}>
                  Push to webhook
                </button>
                <button className="acctItem" style={S.acctItem} role="menuitem"
                  onClick={() => { flashGeo("Copied " + (picks.size || rows.length) + " leads to clipboard"); setExportMenu(false); }}>
                  Copy to clipboard
                </button>
              </span>
            )}
          </span>
        )}
        <div className="sysRead" style={{ ...S.sysRead, marginLeft: isPaid ? 0 : "auto" }} title="System status">
          <span style={S.sysK}>Credits</span>
          <span style={S.sysV}>{isUnlimited ? "Unlimited" : effTier === "starter" ? "40 / mo" : "0"}</span>
          <span style={S.vruleSm} />
          <span style={S.sysK}>API</span>
          <button className="sysBtn" style={{ ...S.sysV, color: GREEN, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: mono }}
            onClick={() => setApiInfo(true)} title="Click for API details">OK</button>
          <span style={S.vruleSm} />
          <span style={S.sysK}>Queue</span><span style={S.sysV}>0</span>
          <span style={S.vruleSm} />
          <span style={S.sysK}>Cache</span>
          <span style={{ ...S.sysV, ...(admin && (rtOn || fresh.length) ? { color: GREEN } : null) }}>
            {admin && rtOn ? "Live" : admin && fresh.length ? "Now" : "6d"}
          </span>
        </div>
      </div>

      {/* Count strip: locate, the paid-gated no-website toggle, sort, stats */}
      <div className="countStrip" style={S.countStrip}>
        <label style={{ ...S.fLabel, marginRight: -4 }} htmlFor="f-sort">Sort</label>
        <select id="f-sort" style={{ ...S.select, minWidth: 150 }} value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [k, dir] = e.target.value.split(":");
            if (k === "dist" && !geo) { flashGeo("Request your location first"); return; }
            setSort({ key: k, dir });
          }}>
          <option value="rev:desc">Featured</option>
          <option value="rev:asc">Reviews low to high</option>
          <option value="rating:desc">Stars high to low</option>
          <option value="rating:asc">Stars low to high</option>
          <option value="views:desc">Most popular</option>
          <option value="views:asc">Least popular (best odds)</option>
          <option value="listed:asc">Newest listed</option>
          <option value="dist:asc">Nearest first</option>
          <option value="name:asc">Name A to Z</option>
          {!["rev:desc","rev:asc","rating:desc","rating:asc","views:desc","views:asc","listed:asc","dist:asc","name:asc"].includes(`${sort.key}:${sort.dir}`) && (
            <option value={`${sort.key}:${sort.dir}`}>Column sort</option>
          )}
        </select>

        <span style={S.vruleSm} />

        <button ref={locRef} className={`locBtn${kPulse ? " kpulse" : ""}`} style={S.locBtn}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const vw = window.innerWidth || 1200;
            setLocPrompt({ x: Math.max(8, Math.min(r.left, vw - 288)), y: r.bottom + 6 });
          }}
          title="Find my city and sort businesses nearest first">
          <Icon k="target" size={12} />
          Request your location
        </button>
        {geoMsg && <span style={{ fontSize: 10, color: AMBER, whiteSpace: "nowrap" }}>{geoMsg}</span>}

        <span style={S.vruleSm} />

        <label style={S.check}>
          <span style={S.cbWrap}>
            <input type="checkbox" className="cbInput" checked={onlyLeads}
              onChange={(e) => {
                if (!isPaid) {
                  openUnlimited(e.target, { title: "No website only", body: "Strip everything that already has a site and work pure leads. This filter ships with the paid plans, alongside real-time data and no caps." });
                  return;
                }
                setOnlyLeads(e.target.checked);
              }}
              style={S.cbInput} aria-label="No website only" />
            <span style={{ ...S.cbBox, ...(onlyLeads ? S.cbBoxOn : null) }} aria-hidden="true">
              {onlyLeads && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff"
                  strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>
              )}
            </span>
          </span>
          No website only {showLocks && <Lock />}
        </label>

        <span style={S.vrule} />

        <div style={S.stat}>
          <span style={S.statK}>Showing</span>
          {admin && editRows ? (
            <input autoFocus type="number" min="1" style={S.rowInput}
              value={rowDraft}
              onChange={(e) => setRowDraft(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") { const v = parseInt(rowDraft, 10); setAdminRows(Number.isFinite(v) && v > 0 ? v : null); setEditRows(false); }
                if (e.key === "Escape") { setEditRows(false); }
              }}
              onBlur={() => { const v = parseInt(rowDraft, 10); setAdminRows(Number.isFinite(v) && v > 0 ? v : null); setEditRows(false); }}
              aria-label="Number of rows to generate" />
          ) : admin ? (
            <button className="statEdit" style={S.statEdit}
              onClick={() => { setRowDraft(String(rows.length)); setEditRows(true); }}
              title="Click to set how many rows to generate">
              {rows.length}<span style={{ color: FAINT, marginLeft: 4, fontFamily: mono, fontSize: 9 }}>edit</span>
            </button>
          ) : (
            <span style={S.statV}>{rows.length}</span>
          )}
        </div>

        {sort.key === "dist" && geo && (
          <>
            <span style={S.vruleSm} />
            <button className="hoodChip" style={S.hoodChip} onClick={() => setSort({ key: "rev", dir: "desc" })}
              title="Clear the nearest-first sort">
              Nearest to you: {geo.city} <span style={{ marginLeft: 5, color: MUTED }}>✕</span>
            </button>
          </>
        )}

        {hood && (
          <>
            <span style={S.vruleSm} />
            <button className="hoodChip" style={S.hoodChip} onClick={() => setHood(null)} title="Clear neighborhood filter">
              {hood} <span style={{ marginLeft: 5, color: MUTED }}>✕</span>
            </button>
          </>
        )}

        <span className="cacheWrap" style={S.cacheWrap}>
          <button className={`refreshBtn${refreshing ? " spin" : ""}`}
            style={{ ...S.refreshBtn, ...(admin && refreshLock > 0 ? { color: FAINT, cursor: "not-allowed" } : null) }}
            disabled={admin && refreshLock > 0}
            onClick={(e) => {
              if (admin) { refreshCache(); return; }
              openUnlimited(e.currentTarget, { title: "Real-time data", body: FEATURES["Real-time data"] });
            }}
            title={admin && refreshLock > 0 ? `Rate limited. Try again in ${rlFmt(refreshLock)}` : "Refresh: pull newly listed businesses"}
            aria-label="Refresh the cache">
            <Icon k="refresh" size={12} />
          </button>
          {admin && refreshLock > 0 && (
            <span style={{ fontFamily: mono, fontSize: 9.5, color: AMBER, whiteSpace: "nowrap" }}>{rlFmt(refreshLock)}</span>
          )}
          {busy !== "idle" && (
            <span style={S.busyChip} aria-live="polite">
              <span className="busyDot" /> {busy === "loading" ? "Loading cache" : "Indexing"}
            </span>
          )}
          <button className={`cacheTag`} style={{ ...S.cacheTag, ...(admin && (rtOn || fresh.length) ? { color: GREEN } : null) }} aria-describedby={admin ? undefined : "rt-pop"}
            onClick={(e) => {
              if (admin) { setRtOn(!rtOn); return; }
              openUnlimited(e.currentTarget, { title: "Real-time data", body: FEATURES["Real-time data"] });
            }}>
            {admin && rtOn ? `${cityTag} live, real-time`
              : admin && fresh.length ? `${cityTag} cache, updated just now`
              : live ? <>{cityTag} live ({live.source.includes("Google") ? "OSM + Google" : "OSM"}), checked {agoLabel(live.checkedAt)} {showLocks && <Lock />}</>
              : <>SF cache, updated 6d ago {showLocks && <Lock />}</>}
          </button>
          {!admin && (
          <span id="rt-pop" className="cachePop" style={S.cachePop} role="tooltip">
            <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
              Real-time data
            </span>
            {FEATURES["Real-time data"]}
          </span>
          )}
        </span>
      </div>

      {/* Far-left checkbox batch bar */}
      {isPaid && picks.size > 0 && (
        <div style={S.bulkStrip}>
          <span style={{ color: TEXT }}><strong>{picks.size}</strong> selected</span>
          <button className="btnO" style={{ ...S.outBtn, padding: "4px 10px" }}
            onClick={() => exportCSV(rows.filter((d) => picks.has(d.name)))}>Export CSV</button>
          <button className="btnO" style={{ ...S.outBtn, padding: "4px 10px" }}
            onClick={() => flashGeo("Added " + picks.size + " leads to a saved list")}>Add to list</button>
          <button className="btnO" style={{ ...S.outBtn, padding: "4px 10px" }}
            onClick={() => flashGeo("Spent " + picks.size + " credits to enrich " + picks.size + " leads")}>Enrich ({picks.size})</button>
          <button className="paneLink" style={{ ...S.paneLink, marginTop: 0 }} onClick={() => setPicks(new Set())}>Clear</button>
        </div>
      )}

      {/* Bulk-selection strip (shift+click) */}
      {multi.size > 0 && (
        <div style={S.bulkStrip}>
          <span style={{ color: TEXT }}><strong>{multi.size}</strong> selected</span>
          <button className="btnO" style={{ ...S.outBtn, padding: "4px 10px" }}
            onClick={(e) => {
              if (admin) { exportCSV(ALL_ROWS.filter((d) => multi.has(d.name))); return; }
              openUnlimited(e.currentTarget, { title: "Export CSV", body: FEATURES["Export CSV"] });
            }}>
            Export selection {showLocks && <Lock />}
          </button>
          <button className="lockedChip" style={{ ...S.lockedChip, border: "none" }} onClick={() => setMulti(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* ── Season contest banner: closed-deal leaderboard ── */}
      {(
        <div className="contest" style={S.contest} onClick={() => { setUp(null); setLeaderOpen(true); }} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setUp(null); setLeaderOpen(true); } }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={S.contestTag}>B2WEB S1</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Deal Race S1</span>
            <span style={{ fontSize: 11, color: MUTED }}>Sell the most websites from this cache and win a year of Pro. Report a close, climb the board.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ ...S.fLabel, letterSpacing: "0.6px" }}>Ends in</span>
              {[["11", "d"], [String(23 - now.getUTCHours()).padStart(2, "0"), "h"], [String(59 - now.getUTCMinutes()).padStart(2, "0"), "m"], [String(59 - now.getUTCSeconds()).padStart(2, "0"), "s"]].map(([v, u]) => (
                <span key={u} style={S.contestCell}>{v}<span style={{ color: FAINT, fontSize: 8 }}>{u}</span></span>
              ))}
            </span>
            <button className="btnP" style={{ ...S.priBtn, padding: "6px 18px" }}
              onClick={(e) => { e.stopPropagation(); setUp(null); setLeaderOpen(true); }}>
              Join now
            </button>
          </div>
        </div>
      )}

      {/* ── 70/30 split: table left, detail pane right ─────────────────────── */}
      <div className="split" style={S.split}>
        <main style={S.main}>
          <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
          <div className="tableWrap" style={{ flex: view === "split" ? "1 1 0" : "1 1 auto", minWidth: 0, display: view === "trending" ? "none" : "block" }}>
            <table style={S.table} className="tbl">
              <thead>
                <tr>
                  {isPaid && (
                    <th scope="col" className="mCol" style={{ ...S.th, width: 30, textAlign: "center", padding: "0 4px" }}>
                      <input type="checkbox" aria-label="Select all rows"
                        checked={rows.length > 0 && rows.every((d) => picks.has(d.name))}
                        onChange={(e) => { const all = e.target.checked; setPicks((pv) => { const n = new Set(pv); rows.forEach((d) => all ? n.add(d.name) : n.delete(d.name)); return n; }); }}
                        style={{ accentColor: BLUE_DEEP, cursor: "pointer", verticalAlign: "middle" }} />
                    </th>
                  )}
                  <Th k="name" label="Business" sort={sort} onSort={toggleSort} style={{ width: "26%" }} />
                  <Th k="rev" label="Reviews" sort={sort} onSort={toggleSort} className="mCol" style={{ textAlign: "right", width: 64 }} />
                  <Th k="rating" label="Stars" sort={sort} onSort={toggleSort} className="mCol" style={{ textAlign: "right", width: 60 }} />
                  <Th k="listed" label="Listed" sort={sort} onSort={toggleSort} className="mCol" style={{ textAlign: "right", width: 72 }} />
                  <Th k="addr" label="Address" sort={sort} onSort={toggleSort} className="mCol" style={{ width: "30%" }} />
                  <Th k="status" label="Website status" sort={sort} onSort={toggleSort} style={{ width: 124 }} />
                  <Th k="views" label="Viewing" sort={sort} onSort={toggleSort} className="mCol" style={{ textAlign: "right", width: 74 }} />
                  <th scope="col" className="mCol" style={{ ...S.th, width: 104 }}>Phone</th>
                </tr>
              </thead>
              <tbody>
                {busy !== "idle" && <SkeletonRows n={Math.min(Math.max(rows.length || 12, 8), 16)} />}
                {busy === "idle" && rows.length === 0 && (
                  <tr>
                    <td colSpan={isPaid ? 9 : 8} style={{ ...S.td, padding: "26px 14px", color: MUTED, whiteSpace: "normal" }}>
                      No matches in your free slice of {freeCap}. Clear a filter, or pull more rows from the cache below.
                    </td>
                  </tr>
                )}
                {busy === "idle" && rows.map((d, i) => {
                  const isSel = selected === d.name;
                  const isMulti = multi.has(d.name);
                  // Key on identity, never on index: a row landing on top shifts
                  // every index below it, and an index key would remount and
                  // re-animate the whole table each tick. name+addr is unique
                  // across the mock cache, the 5,000 synthetic rows, and fresh.
                  return (
                    <React.Fragment key={d.name + "|" + d.addr}>
                      <tr
                        ref={(el) => { el ? rowRefs.current.set(d.name, el) : rowRefs.current.delete(d.name); }}
                        className={`biz${isSel ? " sel" : ""}${isMulti ? " msel" : ""}${viewed.has(d.name) ? " seen" : ""}`}
                        style={{ animationDelay: `${Math.min(i * 8, 240)}ms` }}
                        onClick={(e) => rowClick(e, d)}
                        onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                      >
                        {isPaid && (
                          <td className="mCol" style={{ ...S.td, textAlign: "center", padding: "0 4px" }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={picks.has(d.name)}
                              onChange={() => setPicks((pv) => { const n = new Set(pv); n.has(d.name) ? n.delete(d.name) : n.add(d.name); return n; })}
                              style={{ accentColor: BLUE_DEEP, cursor: "pointer", verticalAlign: "middle" }}
                              aria-label={`Select ${d.name}`} />
                          </td>
                        )}
                        <td style={S.td}>
                          {cmpActive && (
                            <input type="checkbox" checked={compare.has(d.name)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleCmp(d.name)}
                              style={{ marginRight: 8, verticalAlign: "middle", accentColor: BLUE_DEEP, cursor: "pointer" }}
                              aria-label={`Compare ${d.name}`} />
                          )}
                          <button className="bizLink" style={S.bizNameBtn}
                            onClick={(e) => { e.stopPropagation(); selectRow(d); }}
                            title="Show details">{d.name}</button>
                          <button className="tagBtn mCat" style={S.tagBtn}
                            onClick={(e) => { e.stopPropagation(); setCat(d.cat); }}
                            title={`Filter category: ${d.cat}`}>
                            {d.cat}
                          </button>
                        </td>
                        <td className="mCol" style={{ ...S.td, textAlign: "right", color: d.rev ? TEXT : FAINT, fontFamily: mono }}>{d.rev ?? "—"}</td>
                        <td className="mCol" style={{ ...S.td, textAlign: "right", fontFamily: mono }}>
                          {ratingOf(d) == null
                            ? <span style={{ color: FAINT }}>—</span>
                            : <><span style={{ fontVariantNumeric: "tabular-nums", color: TEXT }}>{ratingOf(d).toFixed(1)}</span><span style={{ color: AMBER, marginLeft: 2 }}>★</span></>}
                        </td>
                        <td className="mCol" style={{ ...S.td, textAlign: "right", fontFamily: mono, fontSize: 10.5, fontVariantNumeric: "tabular-nums", color: d.listedAgoMin != null ? GREEN : MUTED }}>
                          {listedLabel(d)}
                        </td>
                        <td className="mCol" style={S.td}>
                          <span style={{ color: d.addr ? TEXT : FAINT }}>{d.addr || "—"}</span>
                          <span style={{ marginLeft: 8, fontSize: 10, color: MUTED }}>{d.hood}</span>
                          {geo && (
                            <span style={{ marginLeft: 8, fontSize: 10, color: FAINT, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                              {distMi(d).toFixed(1)} mi
                            </span>
                          )}
                        </td>
                        <td style={S.td}><Status d={d} /></td>
                        <td className="mCol" style={{ ...S.td, textAlign: "right", fontFamily: mono, fontSize: 10.5, fontVariantNumeric: "tabular-nums", color: viewersOf(d) <= 8 ? GREEN : viewersOf(d) >= 32 ? RED : MUTED }}
                          title={viewersOf(d) <= 8 ? "Few eyes on this lead right now" : viewersOf(d) >= 32 ? "Crowded: many agencies looking" : "Moderate attention"}>
                          {viewersOf(d)}
                        </td>
                        <td className="mCol" style={S.td}>
                          {d.phone ? (
                            <span className={copiedName === d.name ? "phoneHit" : ""} style={S.phoneSpan}
                              onClick={(e) => { e.stopPropagation(); copyPhone(d); }}
                              title="Click to copy">
                              {d.phone}
                            </span>
                          ) : <span style={{ color: FAINT }}>—</span>}
                        </td>
                      </tr>
                      {/* In-feed slot: the free tier cannot remove it. Cancel
                          (live after 5s) swaps the ad for an inline Go-unlimited
                          pitch; the pitch's Cancel swaps the ad back in. */}
                      {showAds && i === 11 && rows.length > 14 && (
                        <tr>
                          <td colSpan={isPaid ? 9 : 8} style={{ padding: "5px 12px", borderBottom: `1px solid ${LINE}` }}>
                            {inFeedMode === "ad" ? (
                              <div style={{ ...S.inFeedAd, position: "relative" }}>
                                advertisement
                                <button
                                  style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", fontFamily: ui, fontSize: 10, color: inFeedCountdown > 0 ? FAINT : MUTED, cursor: inFeedCountdown > 0 ? "default" : "pointer", padding: "2px 4px", lineHeight: 1 }}
                                  onClick={() => { if (inFeedCountdown <= 0) setInFeedMode("pitch"); }}
                                  title={inFeedCountdown > 0 ? `Close in ${inFeedCountdown}s` : "Close"}
                                  aria-label={inFeedCountdown > 0 ? `Close ad in ${inFeedCountdown} seconds` : "Close ad"}>
                                  {inFeedCountdown > 0 ? `${inFeedCountdown}` : "Cancel"}
                                </button>
                              </div>
                            ) : (
                              <div style={{ ...S.inFeedAd, position: "relative", textTransform: "none", letterSpacing: 0, gap: 12, fontSize: 11, color: MUTED }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT }}>Go unlimited</span>
                                <span>No ads, real-time data, no caps. From $20/mo with a 1-day free trial.</span>
                                <button className="btnP" style={{ ...S.priBtn, padding: "4px 12px", fontSize: 10.5 }}
                                  onClick={(e) => openUnlimited(e.currentTarget)}>
                                  See plans
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      {showAds && i === 27 && rows.length > 30 && (
                        <tr>
                          <td colSpan={isPaid ? 9 : 8} style={{ padding: "5px 12px", borderBottom: `1px solid ${LINE}` }}>
                            {inFeed2 === "ad" ? (
                              <div style={{ ...S.inFeedAd, position: "relative" }}>
                                advertisement
                                <button style={S.adCancel} onClick={() => setInFeed2("pitch")} title="Close" aria-label="Close ad">Cancel</button>
                              </div>
                            ) : (
                              <div style={{ ...S.inFeedAd, position: "relative", textTransform: "none", letterSpacing: 0, gap: 12, fontSize: 11, color: MUTED }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT }}>Go unlimited</span>
                                <span>Unlimited leads, no ads, live crawls. Starter is $20/mo.</span>
                                <button className="btnP" style={{ ...S.priBtn, padding: "4px 12px", fontSize: 10.5 }} onClick={(e) => openUnlimited(e.currentTarget)}>See plans</button>
                                <button style={S.adCancel} onClick={() => setInFeed2("ad")} title="Back to the ad" aria-label="Close and show the ad again">Cancel</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Split: the last business you clicked, pinned beside the table */}
          {view === "split" && (
            <div style={{ flex: "1 1 0", minWidth: 0, borderLeft: `1px solid ${LINE}` }}>
              <div style={S.mapPanel}>
                <div style={S.mapBar}>
                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: MUTED }}>Working lead</span>
                  {selBiz && <span style={{ marginLeft: "auto", ...S.viewPill }}>
                    <span style={{ fontFamily: mono, fontWeight: 700, color: TEXT }}>{viewersOf(selBiz)}</span>
                    <span style={{ color: MUTED }}>viewing</span><span style={S.livePip} />
                  </span>}
                </div>
                <div style={{ padding: "14px 16px" }}>
                  {!selBiz ? (
                    <div style={{ fontSize: 11.5, color: FAINT, padding: "40px 0", textAlign: "center" }}>
                      Click any row. It opens here, side by side with the screener.
                    </div>
                  ) : (() => {
                    const sb = statusBits(selBiz);
                    return (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{selBiz.name}</div>
                        <div style={{ fontSize: 11, color: MUTED, margin: "3px 0 10px" }}>{selBiz.cat}, {selBiz.hood}</div>
                        <div style={{ ...S.bizSec, borderColor: selBiz.status === "none" ? RED : AMBER, marginBottom: 10 }}>
                          <div style={S.bizSecT}>Website status</div>
                          <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: sb.c }}>{sb.label}</div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>{sb.tip}</div>
                          <VulnFlags d={selBiz} />
                        </div>
                        <div style={S.kvGrid}>
                          <span style={S.kvK}>Reviews</span><span style={{ ...S.kvV, fontFamily: mono }}>{selBiz.rev ?? "—"}</span>
                          <span style={S.kvK}>Rating</span><span style={{ ...S.kvV, fontFamily: mono }}>{ratingLabel(selBiz)}★</span>
                          <span style={S.kvK}>Address</span><span style={S.kvV}>{selBiz.addr || "—"}</span>
                          <span style={S.kvK}>Phone</span>
                          <span style={S.kvV}>
                            {selBiz.phone ? (
                              <span className={copiedName === selBiz.name ? "phoneHit" : ""} style={S.phoneSpan}
                                onClick={() => copyPhone(selBiz)} title="Click to copy">
                                {copiedName === selBiz.name ? "[COPIED]" : selBiz.phone}
                              </span>
                            ) : <span style={{ color: FAINT }}>—</span>}
                          </span>
                        </div>
                        <div style={S.mapBox}><iframe title={`Map: ${selBiz.addr}`} src={mapEmbed(selBiz)} style={S.mapFrame} loading="lazy" /></div>
                        <button className="btnO" style={{ ...S.outBtn, width: "100%", justifyContent: "center", marginTop: 8 }}
                          onClick={() => openBizPage(selBiz)}>Open full business page</button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Trending: the cache ranked by live viewers */}
          {view === "trending" && (
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={S.mapPanel}>
                <div style={S.mapBar}>
                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: MUTED }}>Trending now</span>
                  <span style={{ fontSize: 10, color: FAINT }}>Ranked by people viewing each lead. Fewer eyes means less competition.</span>
                </div>
                <div style={{ padding: "10px 14px 20px" }}>
                  {[...rows].sort((a, b) => viewersOf(b) - viewersOf(a)).slice(0, 30).map((d, i) => {
                    const sb = statusBits(d);
                    const v = viewersOf(d);
                    return (
                      <button key={d.name} className="qItem" style={{ ...S.qItem, padding: "9px 8px" }} onClick={() => openBizPage(d)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: i < 3 ? RED : FAINT, width: 22 }}>#{i + 1}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: TEXT }}>{d.name}</span>
                            <span style={{ display: "block", fontSize: 10, color: MUTED }}>{d.cat}, {d.hood}</span>
                          </span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                          <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: sb.c }}>{sb.label}</span>
                          <span style={{ ...S.viewPill, minWidth: 96, justifyContent: "center" }}>
                            <span style={{ fontFamily: mono, fontWeight: 700, color: TEXT }}>{v}</span>
                            <span style={{ color: MUTED }}>viewing</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          </div>

          {/* End-cap under the table: the pitch, always on. The free slice is
              spent by design; the copy states the shared-snapshot mechanics and
              sells the real-time cache as the edge over competitors. */}
          {!isPaid && (
          <div className="endCap" style={S.endCap}>
            <div style={{ fontSize: 12.5, color: TEXT, fontWeight: 700, marginBottom: 4 }}>
              No more businesses without a website?
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 12, maxWidth: 460, lineHeight: 1.55 }}>
              Get the real-time cache to edge out competitors working the same {snapLabel} snapshot.
            </div>
            <div style={{ ...S.edgeCompare, maxWidth: 460 }}>
              <span style={{ color: MUTED, fontWeight: 700 }}>FREE</span>
              <span style={{ color: MUTED }}>Same {snapLabel} rows for every visitor, picked over daily</span>
              <span style={{ color: GREEN, fontWeight: 700 }}>PAID</span>
              <span style={{ color: TEXT }}>Private crawl on demand, leads before they reach the cache</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {!extra && !admin ? (
                <button className="btnO" style={S.outBtn} onClick={openAd}>
                  <Icon k="play" size={11} /> Watch a 1-min ad for 20 more
                </button>
              ) : (
                <span style={{ fontSize: 11, color: FAINT }}>The demo cache slice ends at 40 rows.</span>
              )}
              <button className="btnP" style={S.priBtn} onClick={(e) => openUnlimited(e.currentTarget)}>
                Get the real-time cache
              </button>
            </div>
            <div style={{ fontSize: 10, color: FAINT, marginTop: 10 }}>
              {admin && rtOn
                ? "Real-time crawl mode is on (admin mock)."
                : `Results are a delayed cache, snapshotted ${snapLabel}. Real-time data is paid.`}
            </div>
          </div>
          )}

          <footer className="siteFooter" style={S.footer}>
            <span>b2web.site. Anonymous view shows the {cityTag} cache only.</span>
            <SiteFooter onHelp={() => setInfoPage("help")} />
          </footer>
        </main>

        {/* ── Right pane (30%): replaces all center modals ───────────────────── */}
        {pane.mode && (
          <aside style={S.aside} aria-label="Detail pane">
            <div style={S.asideInner}>
              <div style={S.paneHead}>
                <div style={S.paneTitle}>{paneTitle}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {pane.mode === "business" && selBiz && (
                    <button className="btnO" style={{ ...S.outBtn, padding: "4px 9px", fontSize: 10 }}
                      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setShareCopied(false); setShare({ x: Math.max(8, r.left - 120), y: r.bottom + 6, biz: selBiz }); }}
                      title="Share this business">
                      <Icon k="share" size={10} /> Share
                    </button>
                  )}
                  <button className="cancelBtn" style={{ ...S.cancelBtn, position: "static" }}
                    onClick={() => setPane({ mode: null })} aria-label="Close pane (Esc)">
                    Cancel
                  </button>
                </div>
              </div>

              {pane.mode === "business" && selBiz && (() => {
                const { c, label, tip } = statusBits(selBiz);
                const watchers = viewersOf(selBiz);
                return (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ ...S.status, fontSize: 11.5 }}>
                        <span style={{ color: selBiz.status === "site" ? MUTED : c, fontWeight: 700 }}>{label}</span>
                        <span style={{ ...S.viewPill, marginLeft: 10 }}>
                          <span style={{ fontFamily: mono, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{watchers}</span>
                          <span style={{ color: MUTED }}>viewing</span>
                          <span style={S.dotPlain} />
                        </span>
                      </span>
                      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.35 }}>{tip}</div>
                    </div>

                    <div style={S.kvGrid}>
                      <span style={S.kvK}>Category</span>
                      <span style={S.kvV}>
                        <button className="kvLink" style={S.kvLink} onClick={() => setCat(selBiz.cat)}
                          title="Filter the list by this category">{selBiz.cat}</button>
                      </span>
                      <span style={S.kvK}>Neighborhood</span>
                      <span style={S.kvV}>
                        <button className="kvLink" style={S.kvLink} onClick={() => setHood(selBiz.hood)}
                          title="Filter the list by this neighborhood">{selBiz.hood}</button>
                      </span>
                      <span style={S.kvK}>Reviews</span>
                      <span style={{ ...S.kvV, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{selBiz.rev ?? "—"}</span>
                      <span style={S.kvK}>Rating</span>
                      <span style={{ ...S.kvV, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{ratingLabel(selBiz)} <span style={{ color: AMBER }}>★</span></span>
                      <span style={S.kvK}>Business age</span>
                      <span style={S.kvV}>{ageOf(selBiz) != null
                        ? <>{ageOf(selBiz)} yrs <span style={{ color: MUTED }}>(listed since {sinceYearOf(selBiz)})</span></>
                        : <span style={{ color: FAINT }}>no registry match yet</span>}</span>
                      <span style={S.kvK}>Cache entry</span>
                      <span style={{ ...S.kvV, fontFamily: mono, color: selBiz.listedAgoMin != null ? GREEN : TEXT }}>Listed {listedLabel(selBiz)}</span>
                      <span style={S.kvK}>Address</span>
                      <span style={S.kvV}>{[selBiz.addr, cityOf(selBiz)].filter(Boolean).join(", ")}</span>
                      {geo && (
                        <>
                          <span style={S.kvK}>Distance</span>
                          <span style={{ ...S.kvV, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{distMi(selBiz).toFixed(1)} mi from you</span>
                        </>
                      )}
                      <span style={S.kvK}>Phone</span>
                      <span style={{ ...S.kvV }}>
                        {selBiz.phone ? (
                          <span className={copiedName === selBiz.name ? "phoneHit" : ""}
                            style={{ ...S.phoneSpan, ...(copiedName === selBiz.name ? { color: GREEN, fontWeight: 700, letterSpacing: "0.5px" } : null) }}
                            onClick={() => copyPhone(selBiz)} title="Click to copy">
                            {copiedName === selBiz.name ? "[COPIED]" : selBiz.phone}
                          </span>
                        ) : <span style={{ color: FAINT }}>not listed</span>}
                      </span>
                      <span style={S.kvK}>Source</span>
                      <span style={{ ...S.kvV, color: MUTED }}>{(selBiz.sources && selBiz.sources.join(", ")) || "Google listing, OSM, registry"}</span>
                    </div>

                    <div style={S.mapBox}>
                      <iframe title={`Map: ${selBiz.addr}`} src={mapEmbed(selBiz)} style={S.mapFrame} loading="lazy" />
                    </div>
                    <a className="bizLink" style={{ fontSize: 10.5 }} href={mapHref(selBiz)} target="_blank" rel="noreferrer">
                      Open full map
                    </a>
                    <button className="btnO" style={{ ...S.outBtn, width: "100%", marginTop: 10, justifyContent: "center" }}
                      onClick={() => openBizPage(selBiz)}>
                      Open full business page
                    </button>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={S.fLabel}>Google reviews</span>
                        <span style={{ fontSize: 9.5, color: FAINT, fontFamily: mono }}>
                          {reviewsOf(selBiz).total ?? "?"} total, {reviewsOf(selBiz).sampled} sampled
                        </span>
                      </div>
                      <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 6, justifyContent: "center", ...(copiedRev ? { background: GREEN, borderColor: GREEN } : null) }}
                        onClick={() => copyReviews(selBiz)}
                        title="Copy every review to the clipboard">
                        {copiedRev
                          ? <>Copied {reviewsOf(selBiz).sampled} reviews to clipboard</>
                          : <><Icon k="copy" size={12} /> Copy all reviews <span style={S.proTag}>PRO</span></>}
                      </button>
                      <div style={{ fontSize: 9.5, color: FAINT, marginTop: 4 }}>
                        Pastes as plain text: author, rating, date, and body.
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={S.fLabel}>Recommended AI prompt <span style={S.proTag}>PRO</span></div>
                      <div style={{ position: "relative", marginTop: 6 }}>
                        <div className={admin ? "" : "blurLock"} style={{ ...S.upFeature, marginBottom: 0, fontSize: 10, color: MUTED, lineHeight: 1.5, maxHeight: 96, overflow: "hidden" }}>
                          {aiPromptOf(selBiz)}
                        </div>
                        {!admin && (
                          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: TEXT, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 2, padding: "3px 7px" }}>
                              Paid plans unlock this prompt
                            </span>
                          </span>
                        )}
                      </div>
                      <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 8, justifyContent: "center", ...(copiedPrompt ? { background: GREEN, borderColor: GREEN } : null) }}
                        onClick={(e) => {
                          if (admin) { copyPrompt(selBiz); return; }
                          openUnlimited(e.currentTarget, { title: "AI build prompts", body: "A ready-to-paste prompt per business, written from its live data: the presence gap, reviews, category, and contact details. Drop it into Lovable, v0, or Bolt and scaffold their site in minutes." });
                        }}>
                        {copiedPrompt ? "Copied to clipboard" : "Copy to Lovable"}
                      </button>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={S.fLabel}>Lead notes</div>
                      <textarea ref={notesRef} style={S.notes} rows={4}
                        placeholder="Pitch angle, contact attempts, decision maker..."
                        value={notes[selBiz.name] || ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [selBiz.name]: e.target.value }))} />
                      <div style={{ fontSize: 9.5, color: FAINT, marginTop: 4 }}>
                        Saved in this session only.
                      </div>
                    </div>

                    {admin && (
                      <button className="btnO"
                        style={{ ...S.outBtn, width: "100%", marginTop: 12, justifyContent: "center", ...(contacted.has(selBiz.name) ? { color: GREEN, borderColor: GREEN } : null) }}
                        onClick={() => setContacted((s0) => { const n = new Set(s0); if (n.has(selBiz.name)) n.delete(selBiz.name); else n.add(selBiz.name); return n; })}>
                        {contacted.has(selBiz.name) ? "Un-mark contacted" : "Mark as contacted"}
                      </button>
                    )}

                    <div style={S.paneHint}>
                      <kbd>↑</kbd><kbd>↓</kbd> Rows | <kbd>Enter</kbd> Notes | <kbd>C</kbd> Copy phone | <kbd>R</kbd> Copy reviews | <kbd>W</kbd> Site | <kbd>M</kbd> Map
                    </div>
                  </>
                );
              })()}

            </div>
          </aside>
        )}
      </div>

      {/* ── Rewarded ad overlay (the one allowed overlay: ads require attention) ── */}
      {adOpen && (
        <div style={S.overlay} onClick={() => setAdOpen(false)} role="dialog" aria-modal="true">
          <div style={S.adModal} onClick={(e) => e.stopPropagation()}>
            <button className="cancelBtn" style={S.cancelBtn} onClick={() => setAdOpen(false)} aria-label="Cancel">
              Cancel
            </button>
            <div style={S.fakeAd}>
              <div style={{ fontSize: 10.5, color: MUTED, letterSpacing: 1, marginBottom: 10 }}>
                SPONSORED 0:0{adLeft} <span style={{ color: FAINT }}>(demo timer, 60s in production)</span>
              </div>
              <div style={{ fontSize: 14, color: TEXT, fontWeight: 700 }}>Ad plays here</div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>
                Finish it and rows 21 to 40 load from the cache below your current list.
              </div>
            </div>
            {adLeft <= 0 ? (
              <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 14, justifyContent: "center" }}
                onClick={claimRows}>
                Claim 20 more rows
              </button>
            ) : (
              <button className="btnO" style={{ ...S.outBtn, width: "100%", marginTop: 14, justifyContent: "center", color: MUTED }}
                disabled>
                Unlocks in 0:0{adLeft}
              </button>
            )}
            <button className="paneLink" style={{ ...S.paneLink, textAlign: "center", width: "100%" }}
              onClick={(e) => { const el = e.currentTarget; setAdOpen(false); openUnlimited(el); }}>
              Go unlimited instead
            </button>
          </div>
        </div>
      )}

      {/* ── "Go unlimited" popover: anchored under whatever upsell was clicked ── */}
      {up && (
        <div ref={upRef} className="upPop" style={{ ...S.upPop, left: up.x, top: up.y }} role="dialog" aria-label="Go unlimited">
          <div style={S.upHead}>
            <span style={{ fontWeight: 700, color: TEXT }}>Go unlimited</span>
            <span style={S.billSeg} role="tablist" aria-label="Billing period">
              <button role="tab" aria-selected={upBilling === "mo"}
                style={{ ...S.billBtn, ...(upBilling === "mo" ? S.billOn : null) }}
                onClick={() => setUpBilling("mo")}>Monthly</button>
              <button role="tab" aria-selected={upBilling === "yr"}
                style={{ ...S.billBtn, ...(upBilling === "yr" ? S.billOn : null) }}
                onClick={() => setUpBilling("yr")}>Yearly -20%</button>
            </span>
          </div>
          {up.feature && (
            <div style={S.upFeature}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: TEXT, marginBottom: 3 }}>{up.feature.title}</div>
              <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>{up.feature.body}</div>
            </div>
          )}
          <div className="tierGrid" style={S.tierGrid}>
            {PLANS.map((pl) => {
              const price = planPrice(pl, upBilling);
              const picked = upTier === pl.id;
              return (
                <div key={pl.id} style={{ ...S.tierCard, ...(picked ? S.tierOn : null) }}>
                  <div style={S.tierName}>{pl.name}</div>
                  <div style={S.tierPrice}>
                    ${price}<span style={{ fontSize: 10, color: MUTED, fontWeight: 400 }}>/mo</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: FAINT, fontFamily: mono }}>
                    {upBilling === "yr" ? `billed $${price * 12} yearly` : "billed monthly"}
                  </div>
                  <div style={S.tierCalls}>{pl.calls}</div>
                  {pl.feats.map((f) => (
                    <div key={f} style={{ ...S.planRow, fontSize: 10.5 }}>{f}</div>
                  ))}
                  <button className={pl.id === "unlimited" ? "btnP" : "btnO"}
                    style={{ ...(pl.id === "unlimited" ? S.priBtn : S.outBtn), width: "100%", marginTop: 9, justifyContent: "center", fontSize: 10.5, padding: "6px 8px" }}
                    onClick={() => { setUpTier(pl.id); setUpErr(false); }}>
                    Start 1-day free trial
                  </button>
                </div>
              );
            })}
          </div>
          {upTier && (() => {
            const pl = PLANS.find((x) => x.id === upTier);
            const price = planPrice(pl, upBilling);
            return (
              <div style={{ marginTop: 10 }}>
                <input placeholder="email or phone number" style={{ ...S.input, ...(upErr && !trialEmail.trim() ? { borderColor: RED } : null) }}
                  aria-label="Email address" value={trialEmail} onChange={(e) => setTrialEmail(e.target.value)} />
                {upErr && !trialEmail.trim() && (
                  <div style={{ color: RED, fontSize: 10.5, marginTop: 6 }}>Must fill in required fields.</div>
                )}
                <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 8, justifyContent: "center" }}
                  onClick={() => startTrial(pl.id)}>
                  {authed || admin ? "Continue to Stripe checkout" : "Continue to sign up"}
                </button>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                  {authed || admin
                    ? <>Free for 1 day. Payment details are collected securely on Stripe; cancel before the trial ends and you pay nothing, otherwise it converts to {pl.name} at ${price}/mo{upBilling === "yr" ? `, billed $${price * 12} yearly` : ""}.</>
                    : <>First create your free account, then you'll continue to Stripe to start the {pl.name} trial. Free for 1 day; cancel anytime before it converts.</>}
                </div>
              </div>
            );
          })()}
          {!upTier && (
            <div style={{ fontSize: 10, color: MUTED, marginTop: 9, lineHeight: 1.5 }}>
              Every plan starts with a 1-day free trial. Card required; cancel anytime before it converts.
            </div>
          )}
        </div>
      )}

      {/* ── Deal Race leaderboard ── */}
      {leaderOpen && (() => {
        // Deterministic mock board. Difficulty multiplier rewards harder sells
        // (low rating + no website). Points are weighted, volume breaks ties by
        // cumulative rating deficit, so helping the worst-off businesses wins.
        const board = [
          { u: "NORTHBEAM_WEB", sold: 15, vel: 2.1, deficit: 41.2, pipe: 6 },
          { u: "PIXELFORGE", sold: 15, vel: 3.4, deficit: 33.8, pipe: 4 },
          { u: "RANKLAB_SEO", sold: 12, vel: 1.8, deficit: 38.0, pipe: 9 },
          { u: "CASTRO_SITES", sold: 11, vel: 4.0, deficit: 22.5, pipe: 3 },
          { u: "YOU", sold: 8, vel: 2.6, deficit: 19.4, pipe: 5, me: true },
          { u: "SOMA_STUDIO", sold: 6, vel: 3.1, deficit: 14.1, pipe: 2 },
        ].sort((a, b) => b.sold - a.sold || b.deficit - a.deficit);
        const ticker = [
          ["14:02", "NORTHBEAM_WEB", "PORTOLA HARDWARE", 1],
          ["13:47", "RANKLAB_SEO", "SUNSET NAIL BAR", 1],
          ["13:31", "PIXELFORGE", "MISSION CYCLERY", 2],
          ["13:08", "CASTRO_SITES", "NOE VALLEY DENTAL", 1],
          ["12:55", "YOU", "GEARY BARBER CO", 1],
        ];
        return (
          <div style={S.overlay} onClick={() => setLeaderOpen(false)} role="dialog" aria-modal="true">
            <div style={{ ...S.adModal, width: 640, maxWidth: "94vw" }} onClick={(e) => e.stopPropagation()}>
              <button className="cancelBtn" style={S.cancelBtn} onClick={() => setLeaderOpen(false)} aria-label="Cancel">Cancel</button>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={S.contestTag}>B2WEB S1</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>Deal Race</span>
                <span style={{ fontSize: 11, color: MUTED }}>Grand prize: one year of Pro, free</span>
              </div>
              <div style={{ fontSize: 10.5, color: MUTED, margin: "6px 0 12px", lineHeight: 1.5 }}>
                Report a close, submit the site you built, and we verify it automatically. Volume wins; ties break toward whoever helped the worst-off businesses.
              </div>

              <div style={S.tickerWrap} aria-label="Recent verified closes">
                <div className="tickerRun" style={S.tickerRun}>
                  {ticker.concat(ticker).map(([t, u, biz, pts], i) => (
                    <span key={i} style={S.tickerItem}>
                      <span style={{ color: FAINT }}>{t} PST</span>
                      <span style={{ color: BLUE, fontWeight: 700 }}>{u}</span>
                      <span style={{ color: MUTED }}>closed</span>
                      <span style={{ color: TEXT, fontWeight: 700 }}>{biz}</span>
                      <span style={{ color: GREEN, fontWeight: 700 }}>+{pts}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ ...S.lbGrid, marginTop: 12 }}>
                <div style={{ ...S.lbRow, ...S.lbHead }}>
                  <span>Rank</span><span>Seller</span><span style={{ textAlign: "right" }}>Sold</span>
                  <span style={{ textAlign: "right" }}>Velocity</span><span style={{ textAlign: "right" }}>Pipeline</span>
                </div>
                {board.map((r, i) => (
                  <div key={r.u} style={{ ...S.lbRow, ...(r.me ? S.lbMe : null) }}>
                    <span style={{ fontWeight: 700, color: i < 3 ? RED : FAINT }}>#{i + 1}</span>
                    <span style={{ fontWeight: 700, color: r.me ? BLUE : TEXT }}>{r.u}</span>
                    <span style={{ textAlign: "right", fontWeight: 700 }}>{r.sold}</span>
                    <span style={{ textAlign: "right", color: MUTED }}>{r.vel.toFixed(1)}d</span>
                    <span style={{ textAlign: "right", color: MUTED }}>{r.pipe}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
                <div style={S.lbNote}>
                  <div style={S.lbNoteT}>Difficulty yield</div>
                  A 1.0 star no-website lead is a harder sell than a 4.5 star upgrade, so it pays more. Lower rating, higher yield.
                </div>
                <div style={S.lbNote}>
                  <div style={S.lbNoteT}>Verification</div>
                  Submit the new URL. We check the WHOIS creation date is after the Jun 5 snapshot and scan for your b2web-verify tag in the page head.
                </div>
              </div>

              <button className="btnP" style={{ ...S.priBtn, width: "100%", justifyContent: "center", marginTop: 14 }}
                onClick={() => { setLeaderOpen(false); flashGeo("Report a close from any business page once you have built their site"); }}>
                Report a close
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── API status detail ── */}
      {apiInfo && (
        <div style={S.overlay} onClick={() => setApiInfo(false)} role="dialog" aria-modal="true">
          <div style={{ ...S.adModal, width: 400 }} onClick={(e) => e.stopPropagation()}>
            <button className="cancelBtn" style={S.cancelBtn} onClick={() => setApiInfo(false)} aria-label="Cancel">Cancel</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>API status</div>
            <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 14 }}>All crawl and enrichment endpoints reporting healthy.</div>
            <div style={{ ...S.kvGrid, gridTemplateColumns: "132px 1fr", marginBottom: 12 }}>
              <span style={S.kvK}>Listing crawl</span><span style={{ ...S.kvV, fontFamily: mono, color: GREEN }}>OK, 210ms</span>
              <span style={S.kvK}>URL verifier</span><span style={{ ...S.kvV, fontFamily: mono, color: GREEN }}>OK, 340ms</span>
              <span style={S.kvK}>Registry lookup</span><span style={{ ...S.kvV, fontFamily: mono, color: GREEN }}>OK, 95ms</span>
              <span style={S.kvK}>Review scrape</span><span style={{ ...S.kvV, fontFamily: mono, color: GREEN }}>OK, 620ms</span>
              <span style={S.kvK}>Queue depth</span><span style={{ ...S.kvV, fontFamily: mono }}>0 jobs</span>
              <span style={S.kvK}>Cache age</span><span style={{ ...S.kvV, fontFamily: mono }}>{admin && rtOn ? "live" : "6 days"}</span>
            </div>
            <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
              Free plans read the shared cache, so API health does not affect your results.
              Paid plans dispatch live crawls against these endpoints; a credit is spent only
              when a crawl returns rows.
            </div>
          </div>
        </div>
      )}

      {/* ── Log out confirmation ── */}
      {logoutAsk && (
        <div style={S.overlay} onClick={() => setLogoutAsk(false)} role="dialog" aria-modal="true">
          <div style={{ ...S.adModal, width: 320, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Log out?</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 16 }}>You'll drop back to the anonymous San Francisco cache.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btnO" style={{ ...S.outBtn, flex: 1, justifyContent: "center" }} onClick={() => setLogoutAsk(false)} disabled={busyAuth === "logout"}>Stay</button>
              <button className="btnP" style={{ ...S.priBtn, flex: 1, justifyContent: "center", ...(busyAuth === "logout" ? { opacity: 0.75, cursor: "default" } : null) }} onClick={doLogOut} disabled={busyAuth === "logout"}>
                {busyAuth === "logout" ? (<><Spin /> Logging out</>) : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preferences modal: theme + keybinds ── */}
      {acctOpen2 && (
        <div style={S.overlay} onClick={() => setAcctOpen2(false)} role="dialog" aria-modal="true">
          <div style={{ ...S.adModal, width: 400 }} onClick={(e) => e.stopPropagation()}>
            <button className="cancelBtn" style={S.cancelBtn} onClick={() => setAcctOpen2(false)} aria-label="Cancel">Cancel</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Preferences</div>
            <div style={{ ...S.fLabel, marginBottom: 6 }}>Appearance</div>
            <div style={S.billSeg} role="tablist" aria-label="Theme">
              {[["light", "Light"], ["dark", "Dark"], ["pitch", "Pitch black"]].map(([k, lab]) => (
                <button key={k} role="tab" aria-selected={theme === k}
                  style={{ ...S.billBtn, ...(theme === k ? S.billOn : null) }}
                  onClick={() => setTheme(k)}>{lab}</button>
              ))}
            </div>
            <div style={{ ...S.fLabel, margin: "16px 0 6px" }}>Manage notifications</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[["newLeads", "New no-website leads in my area"], ["priceDrops", "Rating or review changes on saved leads"],
                ["weekly", "Weekly lead digest"], ["product", "Product news and offers"]].map(([k, label]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11, color: TEXT, cursor: "pointer" }}>
                  <span style={S.cbWrap}>
                    <input type="checkbox" className="cbInput" checked={!!notifPrefs[k]}
                      onChange={(e) => setNotifPrefs((n) => ({ ...n, [k]: e.target.checked }))}
                      style={S.cbInput} aria-label={label} />
                    <span style={{ ...S.cbBox, ...(notifPrefs[k] ? S.cbBoxOn : null) }} aria-hidden="true">
                      {notifPrefs[k] && (<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>)}
                    </span>
                  </span>
                  {label}
                </label>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "16px 0 6px" }}>
              <span style={S.fLabel}>Keybinds</span>
              <button className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 10 }}
                onClick={() => { setRebinding(null); setKeybinds({ ...KB_DEFAULT }); }}>Reset to defaults</button>
            </div>
            <div style={{ ...S.kvGrid, gridTemplateColumns: "1fr 64px", marginBottom: 0, rowGap: 5, alignItems: "center" }}>
              {[["phone", "Copy phone"], ["reviews", "Copy reviews"], ["web", "Web presence"], ["map", "Open map"]].map(([act, label]) => (
                <React.Fragment key={act}>
                  <span style={{ color: MUTED, fontSize: 11 }}>{label}</span>
                  <button className="kbBind" style={{ ...S.kbBind, ...(rebinding === act ? S.kbBindOn : null) }}
                    onClick={() => setRebinding((r) => (r === act ? null : act))}
                    title="Click, then press a key to rebind">
                    {rebinding === act ? "press key" : (keybinds[act] || "").toUpperCase()}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <div style={{ ...S.kvGrid, gridTemplateColumns: "1fr 64px", marginTop: 6, rowGap: 4, alignItems: "center" }}>
              {[["Move rows", "↑ ↓"], ["Lead notes", "Enter"], ["Search", "/"], ["Close", "Esc"]].map(([label, k]) => (
                <React.Fragment key={label}>
                  <span style={{ color: FAINT, fontSize: 10.5 }}>{label}</span>
                  <span style={{ ...S.kbBind, color: FAINT, borderStyle: "dashed", cursor: "default" }}>{k}</span>
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>
              Click a shortcut, then press any letter or number. Fixed keys cannot be changed.
            </div>
          </div>
        </div>
      )}

      {/* ── Manage account modal ── */}
      {acctOpen && (
        <div style={S.overlay} onClick={() => setAcctOpen(false)} role="dialog" aria-modal="true">
          <div style={{ ...S.adModal, width: 380 }} onClick={(e) => e.stopPropagation()}>
            <button className="cancelBtn" style={S.cancelBtn} onClick={() => setAcctOpen(false)} aria-label="Cancel">Cancel</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Manage account</div>
            <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 14 }}>
              Current plan: <strong style={{ color: TEXT }}>{admin ? "Unlimited (admin)" : tier === "free" ? "Free" : tier === "starter" ? "Starter" : "Unlimited"}</strong>
            </div>
            <div style={{ ...S.fLabel, marginBottom: 6 }}>Email or phone number</div>
            <input style={S.input} aria-label="Account email" placeholder="email or phone number"
              value={email} readOnly />
            <div style={{ ...S.fLabel, margin: "10px 0 6px" }}>New password</div>
            <input type="password" style={S.input} aria-label="New password" placeholder="••••••••"
              value={authPw} onChange={(e) => setAuthPw(e.target.value)} />
            <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 12, justifyContent: "center" }}
              onClick={() => setAcctOpen(false)}>
              Save changes
            </button>
            <a className="bizLink" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 11 }}
              href="https://billing.stripe.com" target="_blank" rel="noreferrer">
              Manage subscription on Stripe
            </a>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
              <div style={S.fLabel}>Refer a friend, get credits</div>
              <div style={{ fontSize: 10.5, color: MUTED, margin: "4px 0 8px", lineHeight: 1.5 }}>
                Share your code. Each friend who subscribes gives you <strong style={{ color: TEXT }}>+2 credits</strong>, free.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input readOnly style={{ ...S.input, fontFamily: mono, letterSpacing: "1px" }} value={"B2W-" + (email.trim() ? email.trim().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "X") : "REF7") + "-42"} aria-label="Your referral code" />
                <button className="btnO" style={{ ...S.outBtn, whiteSpace: "nowrap" }}
                  onClick={(e) => { const c = "B2W-" + (email.trim() ? email.trim().slice(0,4).toUpperCase().replace(/[^A-Z0-9]/g,"X") : "REF7") + "-42"; if (navigator.clipboard) navigator.clipboard.writeText(c).catch(()=>{}); }}>
                  Copy
                </button>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
              <div style={{ ...S.fLabel, color: RED }}>Danger zone</div>
              <div style={{ fontSize: 10.5, color: MUTED, margin: "4px 0 8px", lineHeight: 1.5 }}>
                Permanently delete your account, credits, and saved lists. This cannot be undone.
              </div>
              <button className="btnO" style={{ ...S.outBtn, width: "100%", justifyContent: "center", color: RED, borderColor: RED }}
                onClick={() => { setDeleteText(""); setDeleteAsk(true); }}>
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete account confirmation: type DELETE to proceed ── */}
      {deleteAsk && (
        <div style={{ ...S.overlay, zIndex: 92 }} onClick={() => setDeleteAsk(false)} role="dialog" aria-modal="true">
          <div style={{ ...S.adModal, width: 360 }} onClick={(e) => e.stopPropagation()}>
            <button className="cancelBtn" style={S.cancelBtn} onClick={() => setDeleteAsk(false)} aria-label="Cancel">Cancel</button>
            <div style={{ fontSize: 15, fontWeight: 700, color: RED, marginBottom: 6 }}>Delete your account?</div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, lineHeight: 1.55 }}>
              This permanently removes your account, credits, referral history, and any saved
              lists. Active subscriptions are not automatically canceled; cancel first on Stripe if
              you have a paid plan. This cannot be undone.
            </div>
            <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 6 }}>
              Type <strong style={{ color: TEXT, fontFamily: mono }}>DELETE</strong> to confirm.
            </div>
            <input style={{ ...S.input, fontFamily: mono, letterSpacing: "1px" }}
              aria-label="Type DELETE to confirm" value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && deleteText.trim().toUpperCase() === "DELETE") deleteAccount(); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btnO" style={{ ...S.outBtn, flex: 1, justifyContent: "center" }} onClick={() => setDeleteAsk(false)} disabled={!!busyAuth}>Keep account</button>
              <button className="btnP" style={{ ...S.priBtn, flex: 1, justifyContent: "center", ...(busyAuth === "delete" ? { background: RED, borderColor: RED, opacity: 0.8, cursor: "default" } : deleteText.trim().toUpperCase() !== "DELETE" ? { opacity: 0.5, cursor: "not-allowed" } : { background: RED, borderColor: RED }) }}
                disabled={deleteText.trim().toUpperCase() !== "DELETE" || !!busyAuth}
                onClick={deleteAccount}>
                {busyAuth === "delete" ? (<><Spin /> Deleting</>) : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Business page (full view, from search) ── */}
      {bizPage && (() => {
        const d = bizPage, sb = statusBits(d), rv = reviewsOf(d);
        return (
          <div style={S.bizPage} role="dialog" aria-modal="true" aria-label={`${d.name} page`}>
            <div className="bizBar" style={S.bizBar}>
              <button style={S.brandBtn} onClick={() => setBizPage(null)} title="Back to the screener">
                <span style={{ color: TEXT }}>B2Web</span><span style={{ color: RED, fontFamily: mono }}>.site</span>
              </button>
              <button className="btnO" style={{ ...S.outBtn, padding: "6px 12px" }} onClick={() => setBizPage(null)}>Back to results</button>
            </div>
            <div style={S.bizScroll}><div className="bizInner" style={S.bizInner}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <h1 style={{ fontFamily: ui, fontSize: 26, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.15 }}>{d.name}</h1>
                    <button className="btnO" style={{ ...S.outBtn, padding: "5px 11px", fontSize: 10.5 }}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setShareCopied(false);
                        setShare({ x: Math.max(8, r.left), y: r.bottom + 6, biz: d });
                      }}>
                      <Icon k="share" size={11} /> Share
                    </button>
                    <span style={S.viewPill}>
                      <span style={{ fontFamily: mono, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{viewersOf(d)}</span>
                      <span style={{ color: MUTED }}>viewing now</span>
                      <span style={S.livePip} />
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 5 }}>
                    <button className="kvLink" style={S.kvLink} onClick={() => { setBizPage(null); setCat(d.cat); }}>{d.cat}</button>
                    {", "}
                    <button className="kvLink" style={S.kvLink} onClick={() => { setBizPage(null); setHood(d.hood); }}>{d.hood}</button>
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 7 }}>{[d.addr, cityOf(d)].filter(Boolean).join(", ")}</div>
                </div>
                <div style={{ ...S.bizSec, minWidth: 220, maxWidth: 300, borderColor: d.status === "none" ? RED : d.status === "third" ? AMBER : LINE }}>
                  <div style={S.bizSecT}>Website status</div>
                  <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 700, color: d.status === "site" ? MUTED : sb.c }}>{sb.label}</div>
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 5, lineHeight: 1.4 }}>{sb.tip}</div>
                </div>
              </div>

              <div style={S.bizMetrics}>
                {[["Google rating", ratingOf(d) != null ? `${ratingOf(d).toFixed(1)}★` : "—", ratingOf(d) != null ? `top ${Math.max(2, 40 - Math.round((ratingOf(d) - 3.4) * 22))}% locally` : "no rating data yet"],
                  ["Reviews", d.rev ?? "—", d.rev == null ? "not fetched yet" : d.rev > 150 ? "high demand" : d.rev > 60 ? "steady traffic" : "emerging"],
                  ["Years listed", ageOf(d) ?? "—", ageOf(d) != null ? `since ${sinceYearOf(d)}` : "no registry match"],
                  ["In cache", listedLabel(d), d.listedAgoMin != null ? "just crawled" : d.real ? "OSM record age" : "Jun 5 snapshot"],
                  ...(geo ? [["Distance", `${distMi(d).toFixed(1)} mi`, `from ${geo.city}`]] : [])].map(([k, v, sub]) => (
                  <div key={k} style={{ ...S.bizSec, padding: "10px 12px" }}>
                    <div style={S.bizSecT}>{k}</div>
                    <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 700, color: TEXT, margin: "2px 0" }}>{v}</div>
                    <div style={{ fontSize: 10, color: FAINT }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div className="bizCols" style={S.bizCols}>
                <div style={S.bizSec}>
                  <div style={S.bizSecT}>Contact and location</div>
                  <div style={S.kvGrid}>
                    <span style={S.kvK}>Address</span><span style={S.kvV}>{[d.addr, cityOf(d)].filter(Boolean).join(", ")}</span>
                    <span style={S.kvK}>Phone</span>
                    <span style={S.kvV}>
                      {d.phone ? (
                        <span className={copiedName === d.name ? "phoneHit" : ""}
                          style={{ ...S.phoneSpan, ...(copiedName === d.name ? { color: GREEN, fontWeight: 700 } : null) }}
                          onClick={() => copyPhone(d)} title="Click to copy">
                          {copiedName === d.name ? "[COPIED]" : d.phone}
                        </span>
                      ) : <span style={{ color: FAINT }}>not listed</span>}
                    </span>
                    <span style={S.kvK}>Source</span><span style={{ ...S.kvV, color: MUTED }}>{(d.sources && d.sources.join(", ")) || "Google listing, OSM, registry"}</span>
                  </div>
                  <div style={S.mapBox}><iframe title={`Map: ${d.addr}`} src={mapEmbed(d)} style={S.mapFrame} loading="lazy" /></div>
                  <a className="bizLink" style={{ fontSize: 10.5 }} href={mapHref(d)} target="_blank" rel="noreferrer">Open full map</a>

                  <div style={{ ...S.bizSecT, marginTop: 14 }}>More leads in {d.hood}</div>
                  {(() => {
                    const near = pool.filter((x) => x.hood === d.hood && x.name !== d.name && x.status !== "site").slice(0, 4);
                    return near.length ? near.map((x) => (
                      <button key={x.name} className="qItem" style={S.qItem} onClick={() => openBizPage(x)}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                          <span style={{ display: "block", fontSize: 9.5, color: MUTED }}>{x.cat}, {x.rev ?? "—"} reviews</span>
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, color: statusBits(x).c, flexShrink: 0 }}>{statusBits(x).label}</span>
                      </button>
                    )) : (
                      <div style={{ fontSize: 10.5, color: FAINT }}>No other flagged leads cached in {d.hood}.</div>
                    );
                  })()}

                  {showAds && (<>
                  <div style={{ ...S.bizSecT, marginTop: 14 }}>Sponsored</div>
                  {pageAdMode === "ad" ? (
                    <div style={{ ...S.inFeedAd, position: "relative", height: 210 }}>
                      advertisement
                      <button style={S.adCancel} onClick={() => setPageAdMode("pitch")}
                        title="Close" aria-label="Close ad">Cancel</button>
                    </div>
                  ) : (
                    <div style={{ ...S.inFeedAd, position: "relative", height: 210, flexDirection: "column", gap: 10, textTransform: "none", letterSpacing: 0, fontSize: 11, color: MUTED, padding: "0 18px", textAlign: "center" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>Go unlimited</span>
                      <span>No ads, real-time data, no caps. From $20/mo with a 1-day free trial.</span>
                      <button className="btnP" style={{ ...S.priBtn, padding: "5px 14px", fontSize: 10.5 }}
                        onClick={(e) => openUnlimited(e.currentTarget)}>
                        See plans
                      </button>
                      <button style={S.adCancel} onClick={() => setPageAdMode("ad")}
                        title="Back to the ad" aria-label="Close and show the ad again">Cancel</button>
                    </div>
                  )}
                  </>)}
                </div>
                <div style={S.bizSec}>
                  <div style={S.bizSecT}>Web presence</div>
                  <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
                    {d.status === "none"
                      ? "No standalone website on any source. That is the pitch: demand and reputation with nowhere to send customers."
                      : d.status === "third"
                      ? `Only a ${d.thirdKind} page stands in for a site. A real website gives them search visibility they can own.`
                      : "Already has a standalone site. Lower priority for a build; a redesign or SEO angle may still fit."}
                  </div>
                  <a className="bizLink" style={{ fontSize: 11 }} href={webHref(d)} target="_blank" rel="noreferrer">Open web presence</a>

                  <div style={{ ...S.bizSecT, marginTop: 14 }}>Vulnerability flags</div>
                  <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.5, marginBottom: 2 }}>
                    What their current presence cannot do. Hover any flag for the pitch.
                  </div>
                  <VulnFlags d={d} />

                  <div style={{ ...S.bizSecT, marginTop: 14 }}>Recommended AI prompt <span style={S.proTag}>PRO</span></div>
                  <div style={{ position: "relative" }}>
                    <div className={admin ? "" : "blurLock"} style={{ ...S.upFeature, marginBottom: 0, fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
                      {aiPromptOf(d)}
                    </div>
                    {!admin && (
                      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: TEXT, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 2, padding: "3px 8px" }}>
                          Paid plans unlock this prompt
                        </span>
                      </span>
                    )}
                  </div>
                  <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 8, justifyContent: "center", ...(copiedPrompt ? { background: GREEN, borderColor: GREEN } : null) }}
                    onClick={(e) => {
                      if (admin) { copyPrompt(d); return; }
                      openUnlimited(e.currentTarget, { title: "AI build prompts", body: "A ready-to-paste prompt per business, written from its live data: the presence gap, reviews, category, and contact details. Drop it into Lovable, v0, or Bolt and scaffold their site in minutes." });
                    }}>
                    {copiedPrompt ? "Copied to clipboard" : "Copy to Lovable"}
                  </button>
                  <div style={{ fontSize: 9.5, color: FAINT, marginTop: 4 }}>Paste into Lovable, v0, or Bolt to scaffold their site.</div>

                  <div style={{ ...S.bizSecT, marginTop: 14 }}>Google reviews</div>
                  <div style={{ fontSize: 10, color: FAINT, fontFamily: mono, marginBottom: 6 }}>{rv.total ?? "?"} total, {rv.sampled} sampled</div>
                  <button className="btnP" style={{ ...S.priBtn, width: "100%", justifyContent: "center", ...(copiedRev ? { background: GREEN, borderColor: GREEN } : null) }}
                    onClick={() => copyReviews(d)}>
                    {copiedRev ? <>Copied {rv.sampled} reviews to clipboard</> : <><Icon k="copy" size={12} /> Copy all reviews <span style={S.proTag}>PRO</span></>}
                  </button>
                  {rv.list.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ ...S.upFeature, marginTop: 8, marginBottom: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{r.author}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: AMBER }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{r.body}</div>
                      <div style={{ fontSize: 9.5, color: FAINT, marginTop: 3 }}>{r.when}</div>
                    </div>
                  ))}
                </div>
              </div>

              <SiteFooter onHelp={() => { setBizPage(null); setInfoPage("help"); }} />
            </div></div>
          </div>
        );
      })()}

      {/* ── Location popover: request caching for your area ── */}
      {locPrompt && (
        <div ref={locPromptRef} style={{ ...S.locPop, left: locPrompt.x, top: locPrompt.y }} role="dialog" aria-label="Request your location for caching">
          <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginBottom: 10 }}>
            Your browser will ask for permission, then we detect your position, resolve your city,
            and crawl the real businesses around you (OpenStreetMap, Google listing checks, registry).
          </div>
          <button className="btnP" style={{ ...S.priBtn, width: "100%", justifyContent: "center" }}
            onClick={() => {
              setLocPrompt(null);
              if (!authed && !admin) { setPendingLoc(true); goToLogin(); return; }
              locate();
              flashGeo("Detecting your location and crawling the businesses around you.");
            }}>
            <Icon k="target" size={12} /> Request your location for caching
          </button>
          {!authed && !admin && (
            <div style={{ fontSize: 10, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>
              Only the San Francisco cache is public. Sign up free and we will notify you the moment your area's 40 mile cache is posted.
            </div>
          )}
          {isUnlimited && (
            <div style={{ fontSize: 10, color: GREEN, marginTop: 8, lineHeight: 1.5 }}>
              Ultra: search any location in the US and pull a fresh cache on demand, no waiting.
            </div>
          )}
        </div>
      )}

      {/* ── Sticky ad bar (bottom): the free tier never removes it. Collapse
             swaps the ad for a Go-unlimited pitch; Cancel restores the ad. ── */}
      {/* ── Share popover: copy link or post to X ── */}
      {share && (
        <div ref={shareRef} style={{ ...S.locPop, width: 210, zIndex: 74, left: share.x, top: share.y, padding: 4 }} role="menu" aria-label="Share">
          <button className="acctItem" style={S.acctItem} role="menuitem"
            onClick={() => {
              if (navigator.clipboard) navigator.clipboard.writeText(bizUrl(share.biz)).catch(() => {});
              setShareCopied(true);
              setTimeout(() => setShare(null), 900);
            }}>
            {shareCopied ? "Link copied" : "Copy link"}
          </button>
          <button className="acctItem" style={S.acctItem} role="menuitem"
            onClick={() => {
              const t = `${share.biz.name} has ${statusBits(share.biz).label.toLowerCase()} and ${share.biz.rev} Google reviews. Found on b2web.site`;
              window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(bizUrl(share.biz))}`, "_blank", "noopener");
              setShare(null);
            }}>
            Post to X
          </button>
        </div>
      )}

      {/* ── About / Help pages (full view) ── */}
      {infoPage && (
        <div style={S.bizPage} role="dialog" aria-modal="true" aria-label={infoPage === "about" ? "About b2web.site" : infoPage === "terms" ? "Terms of Service" : infoPage === "privacy" ? "Privacy Policy" : "Help"}>
          <div className="bizBar" style={S.bizBar}>
            <button style={S.brandBtn} onClick={() => setInfoPage(null)} title="Back to the screener">
              <span style={{ color: TEXT }}>B2Web</span><span style={{ color: RED, fontFamily: mono }}>.site</span>
            </button>
            <button className="btnO" style={{ ...S.outBtn, padding: "6px 12px" }} onClick={() => setInfoPage(null)}>Back to results</button>
          </div>
          <div style={S.bizScroll}><div className="bizInner" style={{ ...S.bizInner, maxWidth: 720 }}>
            {infoPage === "about" && (
              <>
                <h1 style={S.infoH1}>About B2Web.site</h1>
                <p style={S.infoP}>
                  B2Web.site is a screener for local businesses that are missing the one thing that
                  matters online: a working website. We fuse OpenStreetMap, state business registries,
                  and Google listing checks, verify every listed URL ourselves, and cache the result so
                  browsing stays fast. Red means no website at all; amber means a social page is
                  standing in for one.
                </p>
                <p style={S.infoP}>
                  Free shows the shared San Francisco snapshot, ad-supported. A free account unlocks
                  your own city's cached list, and the paid plans run live crawls of any city with no
                  caps. Built for web designers, SEO freelancers, and small agencies who sell websites
                  to the businesses that need them most.
                </p>
                <div style={S.bizSec}>
                  <div style={S.bizSecT}>Follow b2website</div>
                  <a className="bizLink" style={{ display: "block", marginBottom: 6 }} href="https://instagram.com/b2website" target="_blank" rel="noreferrer">instagram.com/b2website</a>
                  <a className="bizLink" style={{ display: "block" }} href="https://x.com/b2webs" target="_blank" rel="noreferrer">x.com/b2webs</a>
                </div>
              </>
            )}
            {infoPage === "help" && (
              <>
                <h1 style={S.infoH1}>How to use B2Web.site</h1>
                <p style={S.infoP}>
                  Every row is a checked San Francisco business, and the website status column is the
                  product: red rows have no website at all. Filter by category, reviews, and stars,
                  request your location to sort nearest first, and click any row for the quick pane or
                  search to open a full business page. Copy phones with one click, pull the full review
                  dump, and grab the AI build prompt to scaffold their site.
                </p>
                <div style={S.bizSec}>
                  <div style={S.bizSecT}>Keybinds</div>
                  <div style={{ fontSize: 10.5, color: FAINT, marginBottom: 6 }}>The first four can be changed in Preferences.</div>
                  <div style={{ ...S.kvGrid, gridTemplateColumns: "120px 1fr", marginBottom: 0 }}>
                    {[["↑ / ↓", "Move through rows"], ["Enter", "Focus lead notes"], [keybinds.phone.toUpperCase(), "Copy the selected phone"],
                      [keybinds.reviews.toUpperCase(), "Copy all reviews"], [keybinds.web.toUpperCase(), "Open web presence"], [keybinds.map.toUpperCase(), "Open the map"],
                      ["/", "Focus the search bar"], ["ArrowLeft", "Close the business page"],
                      ["Esc", "Close panels and popovers"], ["Cmd/Ctrl K", "Jump to Request your location"]].map(([k, v]) => (
                      <React.Fragment key={k}>
                        <span><kbd>{k}</kbd></span>
                        <span style={{ color: MUTED, fontSize: 11.5 }}>{v}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <p style={{ ...S.infoP, fontSize: 11 }}>
                  The free slice is 20 rows from the shared cache; an ad unlocks 20 more, and the paid
                  plans remove every cap with live crawls. The ADMIN switch in the corner simulates the
                  top paid tier for testing.
                </p>
              </>
            )}
            {infoPage === "terms" && (
              <>
                <h1 style={S.infoH1}>Terms of Service</h1>
                <p style={S.infoP}>
                  These terms are a plain-language summary for this prototype. B2Web.site provides
                  business listing data on an as-is basis for lead research. You agree to use the data
                  lawfully, to respect the privacy of the businesses and people it describes, and not to
                  resell the raw cache or use it for spam, harassment, or any purpose prohibited by
                  applicable law.
                </p>
                <p style={S.infoP}>
                  Listings are compiled from public sources and periodic crawls and may be incomplete or
                  out of date. We make no warranty that a business lacks a website at the moment you call
                  it. Paid plans are billed through Stripe; you can cancel any time before a trial
                  converts. We may suspend accounts that abuse the service or attempt to circumvent rate
                  limits or access controls.
                </p>
              </>
            )}
            {infoPage === "privacy" && (
              <>
                <h1 style={S.infoH1}>Privacy Policy</h1>
                <p style={S.infoP}>
                  This is a plain-language summary for this prototype. We collect the email or phone
                  number you sign up with, a hashed record that an account exists, and basic usage needed
                  to run the product and enforce rate limits. If you check the promotional emails box at
                  signup we may send you product updates; you can opt out at any time and it never affects
                  your access.
                </p>
                <p style={S.infoP}>
                  We do not sell your personal information. Business listing data shown in the screener is
                  drawn from public sources and our own checks, not from your account. Payment details are
                  handled by Stripe and never touch our servers. You can request deletion of your account
                  data through the Contact link in the footer.
                </p>
              </>
            )}
            <SiteFooter onHelp={() => setInfoPage("help")} />
          </div></div>
        </div>
      )}

      {/* ── Full-page sign up / log in. Also the 2-minute wall (not dismissable). ── */}
      {(wall || authModal) && !authed && !admin && (() => {
        const isWall = wall && !authModal;
        const su = isWall ? gateMode === "signup" : authModal === "signup";
        const flip = () => {
          const next = su ? "login" : "signup";
          if (isWall) setGateMode(next); else setAuthModal(next);
          setAuthStep("form"); setAuthErr("");
        };
        const close = () => { if (isWall) return; setAuthModal(null); setPendingCity(null); setPendingLoc(false); setAuthStep("form"); setAuthErr(""); };
        return (
        <div style={S.gate} role="dialog" aria-modal="true" aria-label={su ? "Create a free account" : "Log in"}>
          {!isWall && (
            <button className="cancelBtn" style={{ ...S.cancelBtn, top: 16, right: 20, zIndex: 2 }} onClick={close} aria-label="Cancel">Cancel</button>
          )}
          <div className="gateLeft" style={S.gateLeft}>
            <button style={{ ...S.brandBtn, fontSize: 16, alignSelf: "flex-start" }} onClick={close} title={isWall ? "b2web.site" : "Back to the screener"}>
              <span style={{ color: TEXT }}>B2Web</span><span style={{ color: RED, fontFamily: mono }}>.site</span>
            </button>
            <div style={{ maxWidth: 360, width: "100%", margin: "auto 0", alignSelf: "center" }}>
              {authStep === "code" ? (
                <>
                  <h1 style={{ fontFamily: ui, fontSize: 26, fontWeight: 700, color: TEXT, margin: "0 0 14px" }}>Check your email</h1>
                  <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.55, marginBottom: 10 }}>
                    We emailed a 6-digit code to <strong style={{ color: TEXT }}>{email.trim()}</strong>. Enter it to {su ? "finish signing up" : "log in"}.
                  </div>
                  <input style={{ ...S.input, fontFamily: mono, letterSpacing: "4px", textAlign: "center", ...(authErr ? { borderColor: RED } : null) }}
                    inputMode="numeric" maxLength={6} placeholder="000000" aria-label="Verification code"
                    value={authCode} onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ""))} />
                  {authErr && <div style={{ color: RED, fontSize: 10.5, marginTop: 6 }}>{authErr}</div>}
                  <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 12, justifyContent: "center", ...(busyAuth ? { opacity: 0.75, cursor: "default" } : null) }}
                    onClick={() => authConfirm(su)} disabled={authLock > 0 || !!busyAuth}>
                    {busyAuth ? (<><Spin /> {su ? "Creating account" : "Signing in"}</>) : authLock > 0 ? `Locked, ${rlFmt(authLock)}` : "Confirm code"}
                  </button>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 10 }}>
                    <button className="paneLink" style={{ ...S.paneLink, marginTop: 0 }}
                      onClick={() => { setAuthStep("form"); setAuthErr(""); }}>Use a different email</button>
                    <button className="paneLink" style={{ ...S.paneLink, marginTop: 0, ...(resendLeft > 0 ? { color: FAINT, cursor: "default", textDecoration: "none" } : null) }}
                      onClick={resendCode} disabled={resendLeft > 0}>
                      {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1 style={{ fontFamily: ui, fontSize: 26, fontWeight: 700, color: TEXT, margin: "0 0 18px" }}>
                    {su ? "Create a free account" : "Log in to b2web.site"}
                  </h1>
                  <button className="btnO" style={{ ...S.outBtn, width: "100%", justifyContent: "center", background: PANEL2 }}
                    onClick={() => signIn("free")}>
                    <span style={{ fontFamily: mono, fontWeight: 700 }}>G</span> {su ? "Sign up" : "Log in"} with Google
                  </button>
                  <div style={S.orRow}>
                    <span style={S.orLine} />
                    <span>Or continue with</span>
                    <span style={S.orLine} />
                  </div>
                  <div style={{ ...S.fLabel, marginBottom: 6 }}>Email or phone number</div>
                  <input placeholder="email or phone number" style={{ ...S.input, ...(authErr && !email.trim() ? { borderColor: RED } : null) }}
                    aria-label="Email or phone number" value={email} readOnly />
                  {needsPhone(email) && (
                    <>
                      <div style={{ ...S.fLabel, margin: "10px 0 6px" }}>Phone number</div>
                      <input placeholder="(415) 555-0100" inputMode="tel" style={{ ...S.input, ...(authErr && !authPhone.trim() ? { borderColor: RED } : null) }}
                        aria-label="Phone number" value={authPhone} onChange={(e) => setAuthPhone(e.target.value)} />
                      <div style={{ fontSize: 10, color: FAINT, marginTop: 4 }}>Required for emails outside Gmail and Outlook.</div>
                    </>
                  )}
                  <div style={{ ...S.fLabel, margin: "10px 0 6px" }}>Password</div>
                  <input type="password" placeholder="••••••••" className={pwShake ? "shake" : ""}
                    style={{ ...S.input, ...((authErr && !authPw.trim()) || pwShake ? { borderColor: RED } : null) }}
                    aria-label="Password" value={authPw} onChange={(e) => setAuthPw(e.target.value)} />
                  {su && (
                    <div style={{ fontSize: 10, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
                      At least 15 characters, or 4+ words as a passphrase. No numbers or symbols required.
                    </div>
                  )}
                  {authErr && <div style={{ color: RED, fontSize: 10.5, marginTop: 8 }}>{authErr}</div>}
                  <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 14, justifyContent: "center", ...(busyAuth === "sending" ? { opacity: 0.75, cursor: "default" } : null) }}
                    onClick={() => authContinue(su, false)} disabled={authLock > 0 || !!busyAuth}>
                    {busyAuth === "sending" ? (<><Spin /> Sending code</>) : authLock > 0 ? `Locked, ${rlFmt(authLock)}` : "Continue"}
                  </button>
                  {su && (
                    !refReveal ? (
                      <button className="paneLink" style={{ ...S.paneLink, marginTop: 10 }} onClick={() => setRefReveal(true)}>Referral code?</button>
                    ) : (
                      <input placeholder="Referral code" style={{ ...S.input, marginTop: 10, fontFamily: mono, letterSpacing: "1px" }}
                        aria-label="Referral code" value={authCode2} onChange={(e) => setAuthCode2(e.target.value.toUpperCase())} />
                    )
                  )}
                  {su ? (
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                      <label style={S.consentRow}>
                        <span style={S.cbWrap}>
                          <input type="checkbox" className="cbInput" checked={agreeTos}
                            onChange={(e) => { setAgreeTos(e.target.checked); if (e.target.checked) setAuthErr(""); }}
                            style={S.cbInput} aria-label="Agree to Terms of Service and Privacy Policy" />
                          <span style={{ ...S.cbBox, ...(agreeTos ? { background: BLUE_DEEP, borderColor: BLUE_DEEP } : (authErr.includes("Terms") ? { borderColor: RED } : null)) }} aria-hidden="true">
                            {agreeTos && (<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>)}
                          </span>
                        </span>
                        <span>I agree to the{" "}
                          <button type="button" className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 10.5, display: "inline" }} onClick={(e) => { e.preventDefault(); setInfoPage("terms"); }}>Terms of Service</button>
                          {" "}and{" "}
                          <button type="button" className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 10.5, display: "inline" }} onClick={(e) => { e.preventDefault(); setInfoPage("privacy"); }}>Privacy Policy</button>.
                        </span>
                      </label>
                      <label style={S.consentRow}>
                        <span style={S.cbWrap}>
                          <input type="checkbox" className="cbInput" checked={agreePromo}
                            onChange={(e) => setAgreePromo(e.target.checked)}
                            style={S.cbInput} aria-label="Consent to promotional emails" />
                          <span style={{ ...S.cbBox, ...(agreePromo ? { background: BLUE_DEEP, borderColor: BLUE_DEEP } : null) }} aria-hidden="true">
                            {agreePromo && (<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>)}
                          </span>
                        </span>
                        <span>I consent to receiving promotional emails and product updates. You can opt out any time.</span>
                      </label>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10.5, color: MUTED, marginTop: 14, textAlign: "center", lineHeight: 1.6 }}>
                      We confirm every login with a 6-digit code.
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, alignSelf: "center" }}>
              {su ? "Already have an account? " : "New here? "}
              <button className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 11.5 }} onClick={flip}>
                {su ? "Log in" : "Create a free account"}
              </button>
            </div>
          </div>
          <div className="gateRight" style={S.gateRight}>
            <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, alignSelf: "flex-start" }}>
              Live preview
            </div>
            <div style={S.snapWrap} aria-hidden="true">
              <div style={S.snapBar}>
                <span style={{ color: RED, fontWeight: 700 }}>b2web</span>
                <span style={{ marginLeft: "auto", color: FAINT }}>San Francisco, CA</span>
              </div>
              <div style={S.snapHead}>
                <span style={{ flex: 2 }}>Business</span><span style={{ flex: 1, textAlign: "right" }}>Reviews</span>
                <span style={{ flex: 1, textAlign: "right" }}>Stars</span><span style={{ flex: 1.4, textAlign: "right" }}>Website</span>
              </div>
              {[["Castro Classic Cuts", 34, "3.4", "none"], ["Balboa Hot Pot", 214, "2.2", "third"],
                ["Sunset Nails & Spa", 41, "3.5", "none"], ["Mission Cut House", 47, "4.6", "none"],
                ["Outer Sunset Fades", 8, "3.5", "third"], ["Hayes Valley Hair Studio", 64, "4.4", "none"],
                ["Clement Street Tailor", 16, "3.8", "none"], ["North Beach Locksmith", 87, "4.4", "third"],
                ["Portola Hardware", 51, "3.1", "none"], ["Richmond Auto Care", 188, "4.3", "none"]].map((r, i) => (
                <div key={i} style={{ ...S.snapRow, background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                  <span style={{ flex: 2, color: BLUE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r[0]}</span>
                  <span style={{ flex: 1, textAlign: "right", color: MUTED }}>{r[1]}</span>
                  <span style={{ flex: 1, textAlign: "right", color: MUTED }}>{r[2]}&#9733;</span>
                  <span style={{ flex: 1.4, textAlign: "right", color: r[3] === "none" ? RED : AMBER, fontWeight: 700 }}>{r[3] === "none" ? "No website" : "Social only"}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.55, maxWidth: 380 }}>
              Every row is a San Francisco business with no real website, verified and cached. {su ? "Create an account" : "Log in"} to unlock your own city and work the leads.
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Admin QA switch (fixed, bottom-right) ── */}
      <div className="adminDock" style={{ position: "fixed", right: 12, bottom: admin ? 10 : 100, zIndex: 95, display: "flex", gap: 6 }}>
        {admin && (
          <span style={S.simSeg} role="group" aria-label="Simulate tier">
            <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.6px", color: FAINT, padding: "0 6px", alignSelf: "center" }}>SIM</span>
            {[["free", "Free"], ["starter", "Pro"], ["unlimited", "Ultra"]].map(([t, lab]) => (
              <button key={t} className="simBtn" style={{ ...S.simBtn, ...(simTier === t ? S.simBtnOn : null) }}
                onClick={() => setSimTier(t)} aria-pressed={simTier === t}
                title={`Preview the app as a ${lab} user`}>
                {lab}
              </button>
            ))}
          </span>
        )}
        {admin && (
          <button className="adminBtn" style={{ ...S.adminBtn, position: "static", ...(viewersOn ? null : { color: RED, borderColor: RED }) }}
            onClick={() => setViewersOn((v) => !v)} aria-pressed={viewersOn}
            title="Show the viewing-now counter pinned bottom-left. Off keeps a recording clean and outlasts admin mode.">
            VIEWERS{viewersOn ? "" : ": OFF"}
          </button>
        )}
        {admin && (
          <button className="adminBtn" style={{ ...S.adminBtn, position: "static", ...(ultra ? { color: RED, borderColor: RED } : null) }}
            onClick={() => setUltra((u) => !u)} aria-pressed={ultra}
            title="ULTRA demo: hyper-live real-time cache, streaming new listings and fast-moving statistics">
            LIVE{ultra ? ": ON" : ""}
          </button>
        )}
        <button className="adminBtn" style={{ ...S.adminBtn, position: "static", ...(admin ? S.adminOn : null) }}
          onClick={() => {
            if (admin) { setAdmin(false); return; }
            setAdminPw(""); setAdminErr(false); setAdminAsk(true);
          }}
          aria-pressed={admin}
          title="Admin test mode (password protected): unlocks every paid gate for QA">
          ADMIN{admin ? ": ON" : ""}
        </button>
      </div>

      {/* ── Admin password modal (window.prompt is blocked in sandboxed frames) ── */}
      {adminAsk && (
        <div style={{ ...S.overlay, zIndex: 96 }} onClick={() => setAdminAsk(false)} role="dialog" aria-modal="true">
          <div style={{ ...S.adModal, width: 320 }} onClick={(e) => e.stopPropagation()}>
            <button className="cancelBtn" style={S.cancelBtn} onClick={() => setAdminAsk(false)} aria-label="Cancel">Cancel</button>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Admin mode</div>
            <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 12 }}>Unlocks every paid gate for testing.</div>
            <input type="password" autoFocus placeholder="Password" className={adminErr ? "shake" : ""}
              style={{ ...S.input, ...(adminErr ? { borderColor: RED } : null) }}
              aria-label="Admin password" value={adminPw}
              onChange={(e) => { setAdminPw(e.target.value); setAdminErr(false); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (adminPw === "123") { setAdmin(true); setAdminAsk(false); }
                else { setAdminErr(true); setTimeout(() => setAdminErr(false), 420); }
              }} />
            {adminErr && <div style={{ color: RED, fontSize: 10.5, marginTop: 6 }}>Incorrect password.</div>}
            <button className="btnP" style={{ ...S.priBtn, width: "100%", marginTop: 12, justifyContent: "center" }}
              onClick={() => {
                if (adminPw === "123") { setAdmin(true); setAdminAsk(false); }
                else { setAdminErr(true); setTimeout(() => setAdminErr(false), 420); }
              }}>
              Unlock
            </button>
          </div>
        </div>
      )}

      {/* ── Compare drawer: Pro side-by-side of selected businesses ── */}
      {cmpActive && compare.size > 0 && (() => {
        const picks = pool.filter((d) => compare.has(d.name)).slice(0, 4);
        return (
          <div style={S.cmpDrawer} role="region" aria-label="Compare businesses">
            <div style={S.cmpHead}>
              <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: TEXT }}>
                Comparing {picks.length}{compare.size > 4 ? " of " + compare.size + " (first 4)" : ""}
              </span>
              <button className="paneLink" style={{ ...S.paneLink, marginTop: 0 }} onClick={() => setCompare(new Set())}>Clear all</button>
            </div>
            <div style={S.cmpGrid}>
              {picks.map((d) => {
                const sb = statusBits(d);
                return (
                  <div key={d.name} style={S.cmpCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
                      <button className="bizLink" style={{ ...S.paneLink, marginTop: 0, fontWeight: 700, textAlign: "left" }} onClick={() => openBizPage(d)}>{d.name}</button>
                      <button className="cancelBtn" style={{ ...S.cancelBtn, position: "static", fontSize: 9 }} onClick={() => toggleCmp(d.name)} aria-label={`Remove ${d.name}`}>Cancel</button>
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>{d.cat}, {d.hood}</div>
                    <div style={{ ...S.kvGrid, gridTemplateColumns: "auto 1fr", rowGap: 2, marginBottom: 0, fontSize: 10.5 }}>
                      <span style={S.kvK}>Status</span><span style={{ fontFamily: mono, fontWeight: 700, color: sb.c }}>{sb.label}</span>
                      <span style={S.kvK}>Rating</span><span style={S.kvV}>{ratingLabel(d)}★</span>
                      <span style={S.kvK}>Reviews</span><span style={S.kvV}>{d.rev ?? "—"}</span>
                      <span style={S.kvK}>Phone</span><span style={{ ...S.kvV, fontFamily: mono }}>{d.phone || "—"}</span>
                      {geo && <><span style={S.kvK}>Distance</span><span style={S.kvV}>{distMi(d).toFixed(1)} mi</span></>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Current viewers (fixed, bottom-left): live social-proof tension ──
          Admin can switch this off from the dock (VIEWERS). ── */}
      {viewersOn && (
        <div className="viewersDock" style={S.viewersDock} title={`People viewing the ${cityTag} cache right now`}>
          <Icon k="user" size={12} />
          <span style={{ fontFamily: mono, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{viewers}</span>
          <span style={{ color: MUTED }}>viewing now</span>
          <span style={S.livePip} />
        </div>
      )}

      {/* ── Alert toast: drops from the top center, previews a new listing ── */}
      {alertToast && (
        <div className="alertToast" style={S.alertToast} role="status" aria-live="polite">
          <div style={S.alertHead}>
            <span>New no-website listing: {locCity}</span>
            <button className="adDockBtn" style={S.adDockBtn}
              onClick={() => setAlertToast(null)} title="Cancel" aria-label="Cancel alert">Cancel</button>
          </div>
          <div style={{ padding: "9px 10px 11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{alertToast.biz.name}</span>
              <span style={{ fontSize: 10, color: FAINT, whiteSpace: "nowrap" }}>listed {alertToast.ago}m ago</span>
            </div>
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3 }}>
              {alertToast.biz.cat}, {alertToast.biz.addr}, {alertToast.biz.hood}
            </div>
            <div style={{ fontSize: 10.5, marginTop: 5 }}>
              <span style={{ color: RED, fontWeight: 700, fontFamily: mono }}>No website</span>
              <span style={{ color: FAINT }}>, {alertToast.biz.rev ?? "—"} reviews, {ratingLabel(alertToast.biz)}★</span>
              {geo && <span style={{ color: FAINT }}>, {distMi(alertToast.biz).toFixed(1)} mi</span>}
            </div>
            <button className="btnP" style={{ ...S.priBtn, width: "100%", justifyContent: "center", marginTop: 10 }}
              onClick={() => { openBizPage(alertToast.biz); setAlertToast(null); }}>
              Open the full listing
            </button>
          </div>
        </div>
      )}

      {/* ── First-visit tour: 3 steps ── */}
      {tour != null && (
        <TourOverlay step={tour} onNext={nextTour} onBack={() => setTour((t) => Math.max(0, (t || 0) - 1))} onSkip={endTour}
          email={tourEmail} setEmail={setTourEmail}
          onLogin={() => { endTour(); goToLogin(); }}
          onSignup={() => { endTour(); goToLogin(); }} />
      )}
    </div>
  );
}

function Th({ k, label, sort, onSort, style, className }) {
  return (
    <th scope="col" className={className} style={{ ...S.th, cursor: "pointer", ...style }} onClick={() => onSort(k)}
      aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      {label} {sort.key === k && <Caret dir={sort.dir} />}
    </th>
  );
}

// ── First-visit tour: 4 slides (big visual, title, dots, Next; the last is
// a signup page). Sized like an app-launch modal; palette stays on the theme
// tokens. The overlay is not click-away dismissable: the only exits are the
// signup slide's two bottom buttons (Continue as guest left, Sign up right,
// with Sign up occupying the exact spot Next held on the slides before it).
function TourOverlay({ step, onNext, onBack, onSkip, email, setEmail, onLogin, onSignup }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(0);
  const trySignup = () => {
    if (!email.trim() || !pw.trim()) { setErr(true); setShake((n) => n + 1); return; }
    onSignup();
  };
  const steps = [
    {
      title: "Every red row is a lead",
      body: "This screener lists real San Francisco businesses from a checked cache. The website status column is the product: red means no website at all, amber means social only.",
      vis: (
        <div style={{ width: 380, maxWidth: "100%", border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL, overflow: "hidden" }}>
          {[["Castro Classic Cuts", "No website", RED], ["Mission Cut House", "Facebook only", AMBER], ["Geary Barber Co.", "No website", RED]].map(([n, st, c], i) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: i < 2 ? `1px solid ${LINE}` : "none", fontSize: 11.5 }}>
              <span style={{ color: TEXT }}>{n}</span>
              <span style={{ color: c, fontWeight: 700, fontFamily: mono, fontSize: 11 }}>{st}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Filter to your kind of lead",
      body: "Category, reviews, and stars are free presets. Pro unlocks the rest: real-time crawls of any city, no result caps, CSV and bulk export, saved lists, contact enrichment, alerts, and comparing several businesses at once. Starter is 40 credits a month; Ultra is 400.",
      vis: (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          {["Category: Barber shop", "Min reviews: 25+", "Min stars: 4.0★"].map((t) => (
            <span key={t} style={{ ...S.select, display: "inline-flex", alignItems: "center", minWidth: 0, pointerEvents: "none" }}>{t}</span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: TEXT }}>
            <span style={{ ...S.cbBox, ...S.cbBoxOn }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>
            </span>
            No website only
          </span>
        </div>
      ),
    },
    {
      title: "Work rows fast",
      body: "Click a row for detail and lead notes. Click a phone number to copy it silently. 20 rows are free, an ad unlocks 20 more, and the real-time cache removes every cap.",
      vis: (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontFamily: mono, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: TEXT }}>(415) 555-0184</span>
            <span style={{ color: GREEN, fontWeight: 700, marginLeft: 10 }}>[COPIED]</span>
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>
            <kbd>↑</kbd><kbd>↓</kbd> Rows | <kbd>Enter</kbd> Notes | <kbd>C</kbd> Copy phone | <kbd>W</kbd> Web presence
          </div>
        </div>
      ),
    },
  ];
  const isSignup = step === 3;
  const st = steps[step];
  const total = steps.length + 1;
  return (
    <div style={{ ...S.overlay, zIndex: 70 }} role="dialog" aria-modal="true" aria-label="Quick tour">
      <div style={S.tourCard}>
        {isSignup ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 26px", overflow: "hidden" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, textAlign: "center" }}>Create your free account</div>
            <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center", margin: "5px 0 12px" }}>
              Already have an account?{" "}
              <button className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 11.5 }} onClick={onLogin}>Log in</button>
            </div>
            <div key={shake} className={shake ? "shake" : ""} style={{ maxWidth: 360, margin: "0 auto", width: "100%" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...S.fLabel, marginBottom: 5 }}>Email or phone number</div>
                  <input style={{ ...S.input, ...(err && !email.trim() ? { borderColor: RED } : null) }}
                    placeholder="email or phone number" aria-label="Email or phone number"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...S.fLabel, marginBottom: 5 }}>Password</div>
                  <input type="password" style={{ ...S.input, ...(err && !pw.trim() ? { borderColor: RED } : null) }}
                    placeholder="••••••••" aria-label="Password"
                    value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
              </div>
              {err && (!email.trim() || !pw.trim()) && (
                <div style={{ color: RED, fontSize: 10.5, marginTop: 8, textAlign: "center" }}>Must fill in required fields.</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={S.tourVis}>{st.vis}</div>
            <div style={{ flex: 1, padding: "18px 26px 0", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{st.title}</div>
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, margin: "8px auto 0", maxWidth: 420 }}>{st.body}</p>
            </div>
          </>
        )}
        <div style={S.tourDots}>
          {Array.from({ length: total }).map((_, i) => <span key={i} style={S.tourDot(i === step)} />)}
        </div>
        <div style={S.tourFoot}>
          {isSignup ? (
            <>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btnO" style={S.outBtn} onClick={onBack}>Back</button>
                <button className="btnO" style={S.outBtn} onClick={onSkip}>Continue as guest</button>
              </span>
              <button className="btnP" style={S.priBtn} onClick={trySignup}>Sign up</button>
            </>
          ) : (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {step > 0 && <button className="btnO" style={{ ...S.outBtn, padding: "5px 12px" }} onClick={onBack}>Back</button>}
                <span style={{ fontSize: 10.5, color: MUTED, textTransform: "uppercase", letterSpacing: "0.5px" }}>b2web.site | quick tour | {step + 1}/{total}</span>
              </span>
              <button className="btnP" style={S.priBtn} onClick={onNext}>Next</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Rate limiting ───────────────────────────────────────────────────────────
// Sliding-window counter per action, persisted to localStorage so a reload
// does not hand out a fresh quota. Production enforces this server side too:
// a client-side limiter only shapes honest traffic, it does not stop an
// attacker. Timestamps outside the window are dropped on every read.
const RL = {
  refresh: { max: 5, windowMs: 60000, label: "refreshes" },
  auth:    { max: 5, windowMs: 300000, label: "sign in attempts" },
  code:    { max: 5, windowMs: 300000, label: "code attempts" },
};
const rlRead = (name) => {
  try {
    const raw = JSON.parse(localStorage.getItem("b2w-rl-" + name) || "[]");
    const cut = Date.now() - RL[name].windowMs;
    return raw.filter((t) => t > cut);
  } catch { return []; }
};
const rlWrite = (name, arr) => { try { localStorage.setItem("b2w-rl-" + name, JSON.stringify(arr)); } catch {} };
// Returns 0 when allowed, else the seconds until the oldest hit ages out.
const rlRetryIn = (name) => {
  const hits = rlRead(name);
  if (hits.length < RL[name].max) return 0;
  const oldest = Math.min(...hits);
  return Math.max(1, Math.ceil((oldest + RL[name].windowMs - Date.now()) / 1000));
};
const rlHit = (name) => { const h = rlRead(name); h.push(Date.now()); rlWrite(name, h); };
const rlClear = (name) => { try { localStorage.removeItem("b2w-rl-" + name); } catch {} };
const rlFmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`);

// ── Loading skeleton ────────────────────────────────────────────────────────
// Placeholder rows shown while the cache is being fetched or re-indexed. In
// production these states are real: the first paint waits on the cache read,
// and every filter change is an index lookup, not an in-memory array filter.
function SkeletonRows({ n = 12 }) {
  // Per-column bar widths (%) mimic the real content rhythm. Every column
  // except name (0) and website status (5) hides on mobile like the real ones.
  const cols = [[62, 34], [48], [40], [46], [70, 30], [58], [40], [72]];
  const mHidden = new Set([1, 2, 3, 4, 6, 7]);
  return (
    <>
      {Array.from({ length: n }).map((_, r) => (
        <tr key={r} className="skelRow" aria-hidden="true">
          {cols.map((bars, c) => (
            <td key={c} className={mHidden.has(c) ? "mCol" : undefined} style={{ ...S.td, verticalAlign: "middle" }}>
              <span style={{ display: "inline-flex", gap: 6, width: "100%" }}>
                {bars.map((w, b) => (
                  <span key={b} className="skel" style={{ width: w + "%", height: 9, borderRadius: 2 }} />
                ))}
              </span>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Vulnerability flags ─────────────────────────────────────────────────────
// For social-only leads, name exactly what the platform cannot do. This is the
// technical ammo an agency uses the moment the owner picks up the phone.
const VULN = {
  NO_SEO_INDEX: "Their page barely ranks. Link aggregators and social profiles are thin, near-duplicate pages that Google will not surface for local searches like \"barber near me\".",
  NO_CUSTOM_DOMAIN: "They do not own their address. The URL belongs to the platform, so the brand, the traffic, and the SEO equity are rented, not owned.",
  NO_PIXEL_FOUND: "No ad-tracking pixel detected. They cannot retarget visitors, measure a campaign, or build a lookalike audience from the people who already found them.",
  NO_BOOKING_FLOW: "No way to book or quote on the page. Every lead has to call during business hours or walk in.",
};
const vulnsOf = (d) => {
  if (d.status === "none") return ["NO_SEO_INDEX", "NO_CUSTOM_DOMAIN", "NO_PIXEL_FOUND", "NO_BOOKING_FLOW"];
  if (d.status !== "third") return [];
  const k = d.thirdKind;
  if (k === "Linktree") return ["NO_SEO_INDEX", "NO_CUSTOM_DOMAIN", "NO_PIXEL_FOUND", "NO_BOOKING_FLOW"];
  if (k === "Instagram") return ["NO_SEO_INDEX", "NO_CUSTOM_DOMAIN", "NO_BOOKING_FLOW"];
  return ["NO_CUSTOM_DOMAIN", "NO_PIXEL_FOUND"]; // Facebook indexes, but rents the domain
};
function Spin() {
  return (
    <svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" style={{ verticalAlign: "-2px" }} aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function VulnFlags({ d }) {
  const v = vulnsOf(d);
  if (!v.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
      {v.map((k) => (
        <span key={k} style={S.vuln} title={VULN[k]}>[{k}]</span>
      ))}
    </div>
  );
}

// ── Site footer: link row, data credit, copyright ────────────────────────────
function SiteFooter({ onHelp }) {
  const links = [
    ["Affiliate", "https://b2web.site/affiliate"], ["Advertise", "https://b2web.site/advertise"],
    ["Careers", "https://b2web.site/careers"], ["Contact", "https://b2web.site/contact"],
    ["Blog", "https://b2web.site/blog"],
  ];
  return (
    <div style={S.siteFoot}>
      <div style={S.siteFootRow}>
        {links.map(([t, h]) => (
          <React.Fragment key={t}>
            <a className="footLink" style={S.footLink} href={h} target="_blank" rel="noreferrer">{t}</a>
            <span style={{ color: FAINT }}> • </span>
          </React.Fragment>
        ))}
        <button className="footLink" style={{ ...S.footLink, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: ui }} onClick={onHelp}>Help</button>
        <span style={{ color: FAINT }}> • </span>
        <a className="footLink" style={S.footLink} href="https://b2web.site/privacy" target="_blank" rel="noreferrer">Privacy</a>
        <span style={{ color: FAINT }}> • </span>
        <a className="footLink" style={S.footLink} href="https://x.com/b2webs" target="_blank" rel="noreferrer">Follow us on X</a>
        <span style={{ color: FAINT }}> • </span>
        <a className="footLink" style={S.footLink} href="https://b2web.site/privacy" target="_blank" rel="noreferrer">Do Not Sell My Personal Information</a>
      </div>
      <div style={S.siteFootLine}>Business data provided by OpenStreetMap contributors, public registries, and our own listed-URL checks.</div>
      <div style={S.siteFootLine}>Copyright ©2026 b2web.site All Rights Reserved.</div>
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────
// One family, terminal-style: differentiate with size, weight, case, and color.
const ui = "'IBM Plex Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";
const mono = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const S = {
  root: { background: BG, color: TEXT, minHeight: "100vh", fontFamily: ui, fontSize: 12 },

  topbar: { position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${LINE}`, flexWrap: "wrap" },
  brandWrap: { display: "flex", alignItems: "center", gap: 14, minWidth: 0 },
  brandBtn: { fontFamily: ui, fontSize: 14, fontWeight: 700, letterSpacing: "-0.3px", whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" },
  bizNameBtn: { background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", textAlign: "left" },
  topMeta: { display: "flex", alignItems: "center", gap: 10 },
  centerUnit: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "stretch", gap: 0, zIndex: 5, maxWidth: "52vw" },
  searchWrapInner: { position: "relative", width: "min(360px, 30vw)", minWidth: 150 },
  cityBtn: { display: "inline-flex", alignItems: "center", gap: 6, marginLeft: -1, padding: "0 12px", background: PANEL2, border: `1px solid ${RULE}`, borderLeft: "none", borderRadius: "0 2px 2px 0", color: MUTED, fontFamily: ui, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" },
  searchWrap: { position: "relative" },
  viewersDock: { position: "fixed", left: 12, bottom: 12, zIndex: 46, display: "inline-flex", alignItems: "center", gap: 7, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, padding: "6px 11px", fontFamily: ui, fontSize: 11, color: MUTED, boxShadow: "0 8px 24px var(--shadow-strong)" },
  viewPill: { display: "inline-flex", alignItems: "center", gap: 6, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, padding: "4px 9px", fontFamily: ui, fontSize: 10.5, color: MUTED },
  livePip: { width: 6, height: 6, borderRadius: 9, background: GREEN, boxShadow: `0 0 6px ${GREEN}` },
  dotPlain: { width: 6, height: 6, borderRadius: 9, background: GREEN },
  searchInput: { width: "100%", boxSizing: "border-box", background: PANEL2, border: `1px solid ${RULE}`, borderRadius: "2px 0 0 2px", color: TEXT, fontFamily: ui, fontSize: 11.5, padding: "6px 10px 6px 29px", outline: "none" },
  searchIcon: { position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, display: "inline-flex", pointerEvents: "none" },
  utcClock: { fontFamily: mono, fontSize: 10.5, color: TEXT, letterSpacing: "0.5px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  adCancel: { position: "absolute", top: 4, right: 6, background: "none", border: "none", fontFamily: ui, fontSize: 10, color: MUTED, cursor: "pointer", padding: "2px 4px", lineHeight: 1 },
  guardNote: { position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  guardBadge: { fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: TEXT, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 2, padding: "8px 14px", boxShadow: "0 14px 38px var(--shadow-strong)" },
  hdrLink: { background: "none", border: "none", padding: "2px 4px", fontFamily: ui, fontSize: 11, fontWeight: 600, color: MUTED, cursor: "pointer", whiteSpace: "nowrap" },
  tierChip: { fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.8px", padding: "4px 8px", borderRadius: 2, border: `1px solid ${RULE}`, color: GREEN, whiteSpace: "nowrap", background: "none", cursor: "pointer" },
  acctMenu: { position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 172, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 14px 38px var(--shadow-strong)", zIndex: 60, padding: 4, display: "block" },
  acctItem: { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 2, padding: "8px 10px", fontFamily: ui, fontSize: 11.5, color: TEXT, cursor: "pointer" },
  sysRead: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: mono, whiteSpace: "nowrap" },
  sysK: { fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.7px", color: MUTED, fontWeight: 700 },
  sysV: { fontSize: 10.5, color: TEXT, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  siteFoot: { marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, fontSize: 10.5, color: MUTED, lineHeight: 1.7 },
  siteFootRow: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 4 },
  footLink: { color: MUTED, textDecoration: "none", fontSize: 10.5 },
  siteFootLine: { color: FAINT, fontSize: 10, marginTop: 6 },
  infoH1: { fontFamily: ui, fontSize: 24, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 },
  infoP: { fontSize: 12.5, color: MUTED, lineHeight: 1.65, margin: 0 },
  gate: { position: "fixed", inset: 0, zIndex: 80, background: BG, display: "flex" },
  gateLeft: { flex: "1 1 50%", minWidth: 0, display: "flex", flexDirection: "column", gap: 24, padding: "30px 48px 34px", overflowY: "auto" },
  snapWrap: { width: "100%", maxWidth: 460, border: `1px solid ${RULE}`, borderRadius: 3, overflow: "hidden", background: BG, fontFamily: mono, fontSize: 10.5, boxShadow: "0 14px 40px var(--shadow-strong)" },
  snapBar: { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${LINE}`, fontSize: 10 },
  snapHead: { display: "flex", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${LINE}`, color: MUTED, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 },
  snapRow: { display: "flex", gap: 8, padding: "5px 10px", fontVariantNumeric: "tabular-nums" },
  gateRight: { flex: "1 1 45%", background: PANEL, borderLeft: `1px solid ${LINE}`, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "40px 48px", textAlign: "center", gap: 22 },
  searchDrop: { position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 14px 38px var(--shadow-strong)", zIndex: 55, overflow: "hidden" },
  qItem: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${LINE}`, padding: "7px 11px", cursor: "pointer", fontFamily: ui },
  locBtn: { display: "flex", alignItems: "center", gap: 7, background: PANEL2, border: `1px solid ${RULE}`, borderRadius: 2, padding: "6px 10px", fontFamily: ui, fontSize: 11, fontWeight: 700, cursor: "pointer", color: TEXT, whiteSpace: "nowrap" },
  themeBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, background: "transparent", border: "none", borderRadius: 2, color: MUTED, cursor: "pointer", flexShrink: 0, padding: 0 },

  upPop: { position: "fixed", width: 440, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 14px 38px var(--shadow-strong)", zIndex: 72, padding: "12px 13px" },
  billSeg: { display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 2, overflow: "hidden" },
  billBtn: { fontFamily: ui, fontSize: 10, fontWeight: 700, padding: "4px 9px", background: "transparent", color: MUTED, border: "none", cursor: "pointer", whiteSpace: "nowrap" },
  billOn: { background: BLUE_DEEP, color: "#fff" },
  tierGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 },
  tierCard: { border: `1px solid ${LINE}`, borderRadius: 2, background: PANEL2, padding: "10px 11px" },
  tierOn: { borderColor: BLUE },
  tierName: { fontFamily: ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: MUTED },
  tierPrice: { fontFamily: mono, fontSize: 19, fontWeight: 700, color: TEXT, marginTop: 3, fontVariantNumeric: "tabular-nums" },
  tierCalls: { fontSize: 11, fontWeight: 700, color: TEXT, margin: "7px 0 5px" },
  upHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${LINE}` },
  upFeature: { padding: "8px 10px", background: PANEL2, border: `1px solid ${LINE}`, borderRadius: 2, marginBottom: 8 },

  // auth modal furniture
  orRow: { display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", fontSize: 9.5, color: MUTED, letterSpacing: "0.6px", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" },
  orLine: { flex: 1, height: 1, background: LINE },
  provWrap: { display: "flex", gap: 30, justifyContent: "center", margin: "14px 0 2px" },
  provBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: ui },
  provCircle: { width: 44, height: 44, borderRadius: "50%", background: PANEL2, border: `1px solid ${RULE}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 14, fontWeight: 700, color: TEXT },

  priBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: BLUE_DEEP, color: "#fff", border: `1px solid ${BLUE_DEEP}`, borderRadius: 2, padding: "7px 13px", fontWeight: 700, fontSize: 11.5, cursor: "pointer", fontFamily: ui },
  outBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: TEXT, border: `1px solid ${RULE}`, borderRadius: 2, padding: "7px 13px", fontWeight: 700, fontSize: 11.5, cursor: "pointer", fontFamily: ui },

  filters: { display: "flex", alignItems: "center", gap: 12, padding: "8px 20px", borderBottom: `1px solid ${LINE}`, flexWrap: "wrap", background: PANEL },
  fGroup: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  vrule: { width: 1, height: 24, background: RULE, flexShrink: 0 },
  vruleSm: { width: 1, height: 15, background: RULE, flexShrink: 0, opacity: 0.7 },
  fLabel: { fontFamily: mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.7px", color: MUTED, fontWeight: 700, whiteSpace: "nowrap" },
  select: { fontFamily: ui, fontSize: 11.5, height: 28, padding: "0 9px", border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, color: TEXT, minWidth: 150, boxSizing: "border-box" },

  lockedRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "7px 20px", borderBottom: `1px solid ${LINE}`, background: PANEL },
  lockedHead: { display: "inline-flex", alignItems: "center", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.7px", color: MUTED, fontWeight: 700, whiteSpace: "nowrap" },
  lockedChips: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  lockedChip: { display: "inline-flex", alignItems: "center", height: 28, boxSizing: "border-box", padding: "0 10px", fontFamily: ui, fontSize: 10.5, border: `1px solid ${LINE}`, borderRadius: 2, background: "var(--chip-bg)", color: MUTED, cursor: "pointer", whiteSpace: "nowrap" },

  countStrip: { display: "flex", gap: 12, alignItems: "center", padding: "8px 20px", fontSize: 11.5, color: TEXT, borderBottom: `1px solid ${LINE}`, flexWrap: "wrap", background: PANEL, fontVariantNumeric: "tabular-nums" },
  check: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: TEXT, cursor: "pointer", userSelect: "none", fontWeight: 400 },
  consentRow: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45, cursor: "pointer" },
  cbWrap: { position: "relative", width: 15, height: 15, flexShrink: 0, display: "inline-flex" },
  cbInput: { position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "pointer" },
  cbBox: { width: 15, height: 15, boxSizing: "border-box", border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, display: "inline-flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  cbBoxOn: { background: RED, borderColor: RED },
  hoodChip: { display: "inline-flex", alignItems: "center", height: 22, boxSizing: "border-box", padding: "0 8px", fontFamily: ui, fontSize: 10.5, border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, color: TEXT, cursor: "pointer" },
  leadMacro: { background: "none", border: "none", padding: 0, fontFamily: ui, fontSize: 11.5, fontWeight: 700, color: RED, cursor: "pointer", fontVariantNumeric: "tabular-nums" },
  stat: { display: "inline-flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap" },
  statK: { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.8px", color: MUTED, fontWeight: 700 },
  statV: { fontSize: 11.5, color: TEXT, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: mono },
  cacheTag: { display: "inline-flex", alignItems: "center", fontFamily: ui, fontSize: 9.5, letterSpacing: "0.6px", color: MUTED, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" },
  cacheWrap: { marginLeft: "auto", position: "relative", display: "inline-flex", alignItems: "center", gap: 6 },
  refreshBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "transparent", border: `1px solid ${LINE}`, borderRadius: 2, color: MUTED, cursor: "pointer", padding: 0, flexShrink: 0 },
  proTag: { fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.8px", padding: "1px 4px", marginLeft: 6, borderRadius: 2, background: "rgba(255,255,255,0.14)", color: "#fff" },
  cachePop: { position: "absolute", top: "calc(100% + 6px)", right: 0, width: 264, maxWidth: "80vw", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, padding: "9px 11px", boxShadow: "0 14px 38px var(--shadow-strong)", fontFamily: ui, fontSize: 10.5, lineHeight: 1.5, letterSpacing: "normal", fontWeight: 400, textTransform: "none", fontVariantNumeric: "normal", color: MUTED, zIndex: 40, whiteSpace: "normal", textAlign: "left" },

  bulkStrip: { display: "flex", gap: 12, alignItems: "center", padding: "6px 20px", fontSize: 11.5, borderBottom: `1px solid ${LINE}`, background: "var(--bulk-bg)" },

  split: { display: "flex", alignItems: "stretch", minHeight: 0 },
  main: { flex: 1, minWidth: 0 },
  mapPanel: { display: "flex", flexDirection: "column", height: "100%", minHeight: 460, background: PANEL },
  kbBind: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44, padding: "4px 8px", background: PANEL2, border: `1px solid ${RULE}`, borderRadius: 2, fontFamily: mono, fontSize: 11, fontWeight: 700, color: TEXT, cursor: "pointer", textTransform: "uppercase" },
  kbBindOn: { borderColor: BLUE_DEEP, color: BLUE, background: "rgba(91,150,214,0.10)", textTransform: "none" },
  simSeg: { display: "inline-flex", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, overflow: "hidden", height: 26 },
  simBtn: { background: "none", border: "none", padding: "0 9px", fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.4px", color: MUTED, cursor: "pointer" },
  simBtnOn: { background: BLUE_DEEP, color: "#fff" },
  tickerWrap: { overflow: "hidden", border: `1px solid ${LINE}`, borderRadius: 2, background: BG, padding: "6px 0" },
  tickerRun: { display: "inline-flex", gap: 26, whiteSpace: "nowrap", fontFamily: mono, fontSize: 10.5 },
  tickerItem: { display: "inline-flex", gap: 6, alignItems: "center" },
  lbGrid: { border: `1px solid ${LINE}`, borderRadius: 2, overflow: "hidden" },
  lbRow: { display: "grid", gridTemplateColumns: "50px 1fr 60px 74px 74px", gap: 8, padding: "7px 11px", fontFamily: mono, fontSize: 11, borderBottom: `1px solid ${LINE}`, alignItems: "center" },
  lbHead: { background: PANEL2, color: MUTED, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 },
  lbMe: { background: "rgba(91,150,214,0.10)" },
  lbNote: { flex: "1 1 240px", fontSize: 10.5, color: MUTED, lineHeight: 1.5, border: `1px solid ${LINE}`, borderRadius: 2, padding: "9px 11px", background: PANEL2 },
  lbNoteT: { fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: TEXT, marginBottom: 4 },
  busyChip: { display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: MUTED, whiteSpace: "nowrap" },
  vuln: { fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.4px", color: AMBER, border: `1px solid ${RULE}`, background: PANEL2, borderRadius: 2, padding: "2px 6px", cursor: "help", whiteSpace: "nowrap" },
  notifDot: { position: "absolute", top: 4, right: 5, width: 7, height: 7, borderRadius: 9, background: RED, border: `1.5px solid ${PANEL}` },
  notifPop: { position: "absolute", top: "calc(100% + 6px)", right: 0, width: 320, maxWidth: "86vw", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 14px 38px var(--shadow-strong)", zIndex: 62, padding: 4, display: "block", maxHeight: 380, overflowY: "auto" },
  notifHead: { display: "flex", justifyContent: "space-between", padding: "7px 8px", fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: MUTED, borderBottom: `1px solid ${LINE}` },
  contest: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "11px 20px", background: PANEL2, borderBottom: `1px solid ${RULE}` },
  contestTag: { fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "1px", color: "#fff", background: BLUE_DEEP, borderRadius: 2, padding: "3px 7px" },
  contestCell: { fontFamily: mono, fontSize: 12, fontWeight: 700, color: TEXT, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 2, padding: "3px 6px", fontVariantNumeric: "tabular-nums", display: "inline-flex", alignItems: "baseline", gap: 1 },
  cmpDrawer: { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 47, background: PANEL, borderTop: `1px solid ${RULE}`, boxShadow: "0 -12px 34px var(--shadow-strong)", padding: "10px 14px 14px", maxHeight: "44vh", overflowY: "auto" },
  cmpHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cmpGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 },
  cmpCard: { border: `1px solid ${LINE}`, borderRadius: 2, background: PANEL2, padding: "9px 11px" },
  mapBar: { display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: `1px solid ${LINE}`, flexWrap: "wrap" },
  aside: { width: "30%", minWidth: 300, maxWidth: 440, borderLeft: `1px solid ${LINE}`, background: PANEL },
  asideInner: { position: "sticky", top: 0, maxHeight: "100vh", overflowY: "auto", padding: "14px 16px 24px" },
  paneHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${LINE}` },
  paneTitle: { fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.3 },
  paneClose: { position: "relative", width: 24, height: 24, background: "none", border: "none", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cancelBtn: { position: "absolute", top: 10, right: 12, background: "none", border: "none", fontFamily: ui, fontSize: 11, fontWeight: 600, color: MUTED, cursor: "pointer", padding: "2px 5px", lineHeight: 1 },
  statEdit: { background: "none", border: "none", padding: 0, font: "inherit", color: TEXT, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", fontVariantNumeric: "tabular-nums" },
  rowInput: { width: 76, background: PANEL2, border: `1px solid ${BLUE}`, borderRadius: 2, color: TEXT, fontFamily: mono, fontSize: 12, fontWeight: 700, padding: "2px 6px", fontVariantNumeric: "tabular-nums" },
  paneBody: { fontSize: 12, color: MUTED, lineHeight: 1.55, margin: "0 0 14px" },
  paneFoot: { fontSize: 10.5, color: MUTED, marginTop: 10, lineHeight: 1.6 },
  paneLink: { background: "none", border: "none", padding: 0, marginTop: 12, fontFamily: ui, fontSize: 11, color: BLUE, cursor: "pointer", textAlign: "left" },
  paneHint: { marginTop: 14, paddingTop: 10, borderTop: `1px solid ${LINE}`, fontSize: 10, color: FAINT },

  kvGrid: { display: "grid", gridTemplateColumns: "92px 1fr", rowGap: 3, columnGap: 10, fontSize: 11.5, marginBottom: 10, lineHeight: 1.25 },
  bizPage: { position: "fixed", inset: 0, zIndex: 68, background: BG, display: "flex", flexDirection: "column" },
  bizBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${LINE}`, flexShrink: 0 },
  bizScroll: { flex: 1, overflowY: "auto" },
  bizInner: { maxWidth: 940, margin: "0 auto", padding: "24px 20px 60px", display: "flex", flexDirection: "column", gap: 16 },
  bizSec: { border: `1px solid ${LINE}`, borderRadius: 2, background: PANEL, padding: "13px 15px" },
  bizSecT: { fontSize: 9.5, letterSpacing: "0.7px", textTransform: "uppercase", color: MUTED, fontWeight: 700, marginBottom: 6 },
  bizMetrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },
  bizCols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" },
  kvK: { fontFamily: mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.6px", color: MUTED, fontWeight: 700, paddingTop: 0 },
  kvV: { color: TEXT, lineHeight: 1.25 },
  kvLink: { background: "none", border: "none", padding: 0, margin: 0, fontFamily: ui, fontSize: 11.5, color: TEXT, cursor: "pointer", textAlign: "left", lineHeight: 1.25 },

  mapBox: { border: `1px solid ${RULE}`, borderRadius: 2, overflow: "hidden", marginBottom: 6, background: PANEL2 },
  mapFrame: { display: "block", width: "100%", height: 180, border: "none" },

  notes: { width: "100%", fontFamily: ui, fontSize: 11.5, padding: "8px 10px", border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, color: TEXT, boxSizing: "border-box", resize: "vertical", marginTop: 5, lineHeight: 1.5 },

  planRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: TEXT, padding: "3px 0" },

  table: { width: "100%", borderCollapse: "collapse", fontFamily: ui, fontSize: 11.5, fontVariantNumeric: "tabular-nums" },
  th: { textAlign: "left", padding: "5px 12px", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.7px", color: MUTED, fontWeight: 700, borderBottom: `1.5px solid ${RULE}`, whiteSpace: "nowrap", userSelect: "none", position: "sticky", top: 0, background: BG, zIndex: 2 },
  td: { padding: "4px 12px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap", verticalAlign: "middle" },

  tagBtn: { background: "none", border: "none", padding: 0, marginLeft: 8, fontFamily: ui, fontSize: 10, color: MUTED, cursor: "pointer" },

  status: { display: "inline-flex", alignItems: "center", fontSize: 11, whiteSpace: "nowrap", fontFamily: mono, fontVariantNumeric: "tabular-nums" },

  phoneSpan: { display: "inline-block", padding: "1px 5px", margin: "-1px -5px", borderRadius: 2, cursor: "copy", fontFamily: mono, fontVariantNumeric: "tabular-nums" },

  inFeedAd: { height: 44, border: `1px solid ${LINE}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: FAINT, fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", background: PANEL },

  endCap: { padding: "18px 20px 4px", borderTop: `1.5px solid ${RULE}` },
  locPop: { position: "fixed", width: 280, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 14px 38px var(--shadow-strong)", zIndex: 60, padding: "12px 13px" },
  adDockBtn: { background: "none", border: "none", color: FAINT, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", padding: "0 3px", lineHeight: 1, flexShrink: 0, whiteSpace: "nowrap" },
  alertToast: { position: "fixed", top: 10, left: "50%", transform: "translate(-50%, 0)", width: 340, maxWidth: "94vw", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 14px 38px var(--shadow-strong)", zIndex: 69, overflow: "hidden", animation: "alertDrop 260ms ease-out" },
  alertHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px 6px 10px", borderBottom: `1px solid ${LINE}`, fontSize: 9, letterSpacing: "0.8px", textTransform: "uppercase", color: MUTED, fontWeight: 700 },

  footer: { padding: "16px 20px 36px", fontSize: 10.5, color: MUTED, lineHeight: 1.6 },

  overlay: { position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 },
  adModal: { position: "relative", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, padding: "20px 20px 16px", width: 380, maxWidth: "100%", boxShadow: "0 16px 48px var(--shadow-strong)" },
  fakeAd: { background: PANEL2, border: `1px solid ${LINE}`, borderRadius: 2, padding: "30px 20px", textAlign: "center", marginTop: 8 },
  edgeCompare: { display: "grid", gridTemplateColumns: "36px 1fr", rowGap: 5, columnGap: 9, border: `1px solid ${LINE}`, borderRadius: 2, background: PANEL2, padding: "9px 11px", margin: "0 0 14px", fontFamily: mono, fontSize: 10, lineHeight: 1.45 },

  chipOn: { color: TEXT, borderColor: BLUE, background: SEL },
  adminBtn: { position: "fixed", right: 10, bottom: 10, zIndex: 45, fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.8px", padding: "5px 9px", background: PANEL, color: FAINT, border: `1px solid ${LINE}`, borderRadius: 2, cursor: "pointer" },
  adminOn: { color: AMBER, borderColor: AMBER },

  // first-visit tour (GMGN-style launch card: big visual, centered copy, dots)
  tourCard: { position: "relative", width: 560, maxWidth: "94vw", height: 460, display: "flex", flexDirection: "column", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: "0 16px 48px var(--shadow-strong)", overflow: "hidden", paddingBottom: 16 },
  tourVis: { height: 210, flexShrink: 0, background: PANEL2, borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" },
  tourDots: { display: "flex", gap: 8, justifyContent: "center", margin: "16px 0 14px" },
  tourDot: (on) => ({ width: 7, height: 7, borderRadius: "50%", background: on ? BLUE : RULE }),
  tourFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 20px" },
  input: { width: "100%", fontFamily: ui, fontSize: 12, padding: "9px 11px", border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, color: TEXT, boxSizing: "border-box" },

};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
  :root, html[data-theme="dark"] {
    --bg:#15181d; --panel:#1d2128; --panel-2:#232833; --sel:#272f3d;
    --line:#2c313c; --rule:#3e4554; --text:#d6dae2; --muted:#8a91a3; --faint:#586070;
    --red:#d64b42; --amber:#d6a243; --green:#57a85f; --blue:#5b96d6; --blue-deep:#2c66a8;
    --bulk-bg:#20283a; --row-msel:rgba(91,150,214,0.08); --scrim:rgba(8,10,13,0.62);
    --shadow-strong:rgba(0,0,0,0.5); --border-hover:#4a5263; --btn-p-hover:#3372ba; --chip-bg:rgba(255,255,255,0.022);
    color-scheme: dark;
  }
  html[data-theme="pitch"] {
    --bg:#000000; --panel:#07080c; --panel-2:#0d0f16; --sel:#141a26;
    --line:#14171f; --rule:#232936; --text:#d6dae2; --muted:#838a9c; --faint:#4d5566;
    --red:#d64b42; --amber:#d6a243; --green:#57a85f; --blue:#5b96d6; --blue-deep:#2c66a8;
    --bulk-bg:#0a0f1c; --row-msel:rgba(91,150,214,0.07); --scrim:rgba(0,0,0,0.8);
    --shadow-strong:rgba(0,0,0,0.78); --border-hover:#2e3645; --btn-p-hover:#3372ba; --chip-bg:rgba(255,255,255,0.016);
    color-scheme: dark;
  }
  html[data-theme="light"] {
    --bg:#eef0f4; --panel:#ffffff; --panel-2:#e6e9ef; --sel:#d6e4f6;
    --line:#e2e5eb; --rule:#c6ccd6; --text:#1a1d23; --muted:#606873; --faint:#9aa1ad;
    --red:#c43d30; --amber:#9a6400; --green:#2a7d3a; --blue:#2f6fc0; --blue-deep:#2c66a8;
    --bulk-bg:#e3edfb; --row-msel:rgba(47,111,192,0.10); --scrim:rgba(20,22,28,0.45);
    --shadow-strong:rgba(15,23,42,0.18); --border-hover:#aeb5c2; --btn-p-hover:#255f9e; --chip-bg:rgba(15,23,42,0.03);
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${BG}; }
  button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 1px; }
  .cbInput:focus-visible { outline: none; }
  .cbInput:focus-visible + span { outline: 2px solid ${BLUE}; outline-offset: 1px; }
  a.bizLink { color: ${BLUE}; text-decoration: none; font-weight: 700; font-size: 11.5px; }
  a.bizLink:hover { text-decoration: underline; }
  .btnP:hover:not(:disabled) { background: var(--btn-p-hover); border-color: var(--btn-p-hover); }
  .btnP:disabled, .refreshBtn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btnO:hover:not(:disabled) { background: ${PANEL2}; }
  .themeBtn:hover { color: ${TEXT}; border-color: var(--border-hover); }
  .locBtn:hover { border-color: var(--border-hover); background: ${PANEL}; }
  .adDockBtn:hover { color: ${TEXT}; }
  .cancelBtn:hover { color: ${TEXT}; }
  .statEdit:hover { text-decoration: underline; }
  .searchInput:focus, input:focus { border-color: var(--blue-deep, ${BLUE}); }
  .qItem:last-of-type { border-bottom: none; }
  .blurLock { filter: blur(5px); user-select: none; pointer-events: none; }
  .snapguard > *:not(.guardNote):not(.adminDock) { filter: blur(18px); pointer-events: none; user-select: none; }
  .hdrLink:hover { color: ${TEXT}; }
  .tierChipBtn:hover { border-color: ${MUTED}; color: ${TEXT}; }
  .kbBind:hover { border-color: ${MUTED}; }
  button.bizLink { color: ${BLUE}; }
  button.bizLink:hover { text-decoration: underline; }
  .cityBtn:hover { border-color: ${MUTED}; color: ${TEXT}; }
  .acctItem:hover { background: ${PANEL2}; }
  .footLink:hover { color: ${TEXT}; text-decoration: underline; }
  .sysBtn:hover { text-decoration: underline; }
  .refreshBtn:hover { color: ${TEXT}; border-color: var(--border-hover); }
  .refreshBtn.spin svg { animation: spin 700ms linear infinite; }
  svg.spin { animation: spin 700ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .skel { background: linear-gradient(90deg, var(--panel-2) 0%, var(--rule) 50%, var(--panel-2) 100%); background-size: 200% 100%; animation: shimmer 1.15s ease-in-out infinite; }
  .skelRow td { border-bottom: 1px solid var(--line); }
  tbody tr.biz.seen td { color: var(--muted); }
  tbody tr.biz.seen td a.bizLink { color: var(--muted); }
  tbody tr.biz.seen { background: color-mix(in srgb, var(--panel) 55%, transparent); }
  .tickerRun { animation: ticker 26s linear infinite; }
  @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .contest { cursor: pointer; }
  .contest:hover { background: var(--panel); }
  .simBtn:hover { color: var(--text); }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .busyDot { width: 6px; height: 6px; border-radius: 9px; background: var(--amber); animation: busyPulse 0.9s ease-in-out infinite; }
  @keyframes busyPulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
  .provBtn:hover span:first-child { border-color: var(--border-hover); background: ${PANEL}; }
  .lockedChip:hover { color: ${TEXT}; border-color: var(--border-hover); background: var(--panel-2); }
  .adminBtn:hover { color: ${TEXT}; border-color: var(--border-hover); }
  .hoodChip:hover { border-color: var(--border-hover); }
  .cacheTag:hover { color: ${TEXT}; }
  .cachePop { opacity: 0; visibility: hidden; transform: translateY(-3px); transition: opacity 90ms ease, transform 90ms ease, visibility 90ms; pointer-events: none; }
  .cacheWrap:hover .cachePop, .cacheWrap:focus-within .cachePop { opacity: 1; visibility: visible; transform: none; pointer-events: auto; }
  .kvLink:hover { text-decoration: underline; }
  .paneLink:hover { text-decoration: underline; }
  .tagBtn:hover { color: ${TEXT}; text-decoration: underline; }
  .leadMacro:hover { text-decoration: underline; }
  input::placeholder, textarea::placeholder { color: ${FAINT}; }
  kbd { font-family: ${ui}; font-size: 9px; border: 1px solid ${RULE}; border-radius: 2; padding: 0 4px; background: ${PANEL2}; color: ${MUTED}; }

  tbody tr.biz { animation: rowIn 140ms ease-out both; }
  tbody tr.biz td { transition: background 60ms linear; cursor: default; }
  tbody tr.biz:hover td { background: ${PANEL2}; }
  tbody tr.biz.msel td { background: var(--row-msel); }
  tbody tr.biz.sel td { background: ${SEL}; }
  tbody tr.biz.sel td:first-child { box-shadow: inset 2px 0 0 ${BLUE}; }

  @keyframes rowIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
  @keyframes alertDrop { from { transform: translate(-50%, -16px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  .shake { animation: shakeX 380ms cubic-bezier(.36,.07,.19,.97); }
  @keyframes shakeX {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-7px); }
    40%, 60% { transform: translateX(7px); }
  }
  @keyframes phoneFlash {
    0% { box-shadow: inset 0 0 0 1px ${GREEN}; color: ${GREEN}; }
    100% { box-shadow: inset 0 0 0 1px transparent; }
  }
  .phoneHit { animation: phoneFlash 0.85s ease-out; }
  @keyframes kpulse {
    0% { outline: 2px solid ${BLUE}; outline-offset: 2px; }
    100% { outline: 2px solid transparent; outline-offset: 2px; }
  }
  .kpulse { animation: kpulse 1.1s ease-out; }

  .tableWrap { overflow-x: auto; }
  .tbl { min-width: 700px; }

  @media (max-width: 900px) {
    aside[aria-label="Detail pane"] {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 40;
      width: min(92vw, 380px); min-width: 0;
      box-shadow: -16px 0 40px var(--shadow-strong);
    }
    .bizCols { grid-template-columns: 1fr; }
  }
  @media (max-width: 860px) {
    /* !important: the pane carries display:flex inline, which would
       otherwise win and overlay the form on phones */
    .gateRight { display: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    tbody tr.biz { animation: none; }
    tbody tr.biz td { transition: none; }
    .phoneHit, .kpulse { animation: none; }
    .cachePop { transition: none; }
  }

  /* ── Mobile-first responsive layer ─────────────────────────────────────
     ≤768px the page stacks vertically: brand row, full-width search row,
     control strips, table, end-cap. Density stays finviz-tight — gutters
     shrink rather than grow — and the desktop header cluster hands off to
     the hamburger menu (m/MobileScreener.jsx). !important is load-bearing
     here: it is the only way a stylesheet rule outranks the inline
     S-object styles. */
  html, body { overflow-x: hidden; max-width: 100%; }
  .tableWrap { -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }

  /* "Use desktop" strip: desktop never sees it; ≤768px it sits right under
     the top bar and explains why the mobile view is slimmer. */
  .mobileNotice {
    display: none; align-items: flex-start; gap: 10px;
    padding: 9px 12px; font-size: 11px; line-height: 1.5; color: ${MUTED};
    background: color-mix(in srgb, var(--amber) 7%, ${PANEL});
    border-bottom: 1px solid ${LINE};
  }
  .mobileNoticeX {
    margin-left: auto; flex-shrink: 0; padding: 2px 8px;
    background: none; border: none; color: ${MUTED}; font-size: 12px;
    line-height: 1; cursor: pointer;
  }
  .mobileNoticeX:hover { color: ${TEXT}; }

  @media (max-width: 768px) {
    .mobileNotice { display: flex; }

    /* Strip the clunk: power filters + credits/API strip, the Deal Race
       banner, and the Grid/Split/Trending cluster are desktop features.
       The notice strip above points people there. */
    .lockedRow, .contest, .viewGroup { display: none !important; }

    /* The table shows only the business name and website status, so every
       row fits the viewport with no horizontal scrolling. The rest
       (reviews, stars, address, phone, listed, viewing) lives in the
       row's detail pane, one tap away. The category tag next to the name
       (.mCat) goes too — it reads as clutter at phone width. */
    .mCol, .mCat { display: none !important; }
    .tbl { min-width: 0 !important; }

    /* Bigger type: with two columns there is room to read comfortably.
       !important outranks the inline S-object sizes. */
    .brandBtn { font-size: 22px !important; }
    .tbl { font-size: 15px !important; }
    .tbl th { font-size: 11.5px !important; }
    tbody tr.biz td button, tbody tr.biz td span { font-size: 15px !important; }
    .mobileNotice { font-size: 13px; }
    .searchWrapInner input { font-size: 15px !important; }
    .filtersDeck label, .countStrip label { font-size: 12.5px !important; }
    .filtersDeck select, .countStrip select { font-size: 15px !important; }
    .countStrip { font-size: 13.5px !important; }
    .countStrip span { font-size: 13px !important; }
    .locBtn { font-size: 13.5px !important; }
    .cacheTag { font-size: 12.5px !important; }

    /* Admin QA dock: wrap instead of pushing the viewport wide, and keep
       clear of the home indicator. */
    .adminDock { flex-wrap: wrap; justify-content: flex-end; max-width: calc(100vw - 20px); bottom: calc(10px + env(safe-area-inset-bottom)) !important; }
    .topbar { padding: 4px 10px !important; row-gap: 4px !important; }
    /* Search leaves the absolute center for a full-width second line —
       static flow, so it can never overlap the brand or push the page wide */
    .centerUnit { position: static !important; transform: none !important; order: 3; flex: 1 1 100%; max-width: none !important; }
    .searchWrapInner { flex: 1 1 auto; width: auto !important; min-width: 0 !important; }
    .topMeta { display: none !important; } /* lives in the mobile menu */

    /* Control strips: same dense rows, tighter gutters, selects stretch */
    .filtersDeck, .lockedRow, .countStrip, .bulkStrip { padding-left: 10px !important; padding-right: 10px !important; gap: 8px !important; }
    .filtersDeck select { flex: 1 1 130px; min-width: 0 !important; }
    .countStrip select { flex: 1 1 130px; min-width: 0 !important; }
    .sysRead { margin-left: 0 !important; flex: 1 1 100%; overflow-x: auto; }
    .contest { padding: 8px 10px !important; gap: 8px !important; }
    .contest > div:last-child { margin-left: 0 !important; }

    /* Stack the 70/30 split. The detail pane is already a fixed right-hand
       drawer at ≤900px, so only the table column remains in flow. */
    .split { flex-direction: column; }

    .endCap { padding: 12px 10px 4px !important; }
    /* Extra bottom room so the fixed admin dock never sits on the links */
    .siteFooter { padding: 12px 10px 96px !important; }
    .bizBar { padding: 8px 10px !important; }
    .bizInner { padding: 14px 10px 46px !important; }
    .gateLeft { padding: 16px 14px 20px !important; }

    /* The Go-unlimited popover becomes a bottom sheet: full width, pinned
       above the home indicator, scrolling internally. The anchored x/y from
       the click would otherwise push it half off-screen. */
    .upPop {
      left: 8px !important; right: 8px !important; width: auto !important;
      top: auto !important; bottom: calc(8px + env(safe-area-inset-bottom)) !important;
      max-height: min(78vh, 560px); overflow-y: auto;
    }

    /* Fluid type: big headings scale down instead of wrapping awkwardly.
       clamp() keeps them proportional between 320px and 768px viewports. */
    h1, .infoH1 { font-size: clamp(17px, 5.2vw, 24px) !important; line-height: 1.25 !important; }
    h2 { font-size: clamp(14px, 4.4vw, 18px) !important; }

    /* The fixed social-proof dock would sit on top of table rows */
    .viewersDock { display: none !important; }
  }

  /* Narrow phones: the two side-by-side tier cards would squeeze prices and
     feature lists into ~140px columns — stack them instead. */
  @media (max-width: 480px) {
    .tierGrid { grid-template-columns: 1fr !important; }
  }

  /* Touch targets: 44x44 minimum on touch screens. min-* constraints clamp
     the inline width/height pairs (22-30px icon buttons) without any layout
     rewrite, and without inflating fine-pointer desktop layouts. */
  @media (max-width: 768px), (pointer: coarse) {
    .topbar button, .filtersDeck button, .filtersDeck select, .lockedRow button,
    .countStrip button, .countStrip select, .lockedChip, .hoodChip, .locBtn,
    .cityBtn, .themeBtn, .refreshBtn, .btnP, .btnO, .acctItem, .qItem,
    .billBtn, .kbBind, .paneClose, .adminBtn, .simBtn, .hdrLink, .tierChipBtn,
    .cancelBtn {
      min-height: 44px; min-width: 44px;
    }
    /* Text fields and selects flex to their row; height is the tap target */
    select, textarea, input:not([type="checkbox"]):not(.cbInput) { min-height: 44px; }

    /* Rows are the tap target in the table: ~44px tall, still 12+ rows per
       screen. Compact, not cramped. */
    tbody tr.biz td, .skelRow td { padding-top: 13px !important; padding-bottom: 13px !important; }
    td input[type="checkbox"], th input[type="checkbox"] { width: 22px; height: 22px; }

    /* Inline targets grow their hit area, not their visual box */
    .phoneSpan { padding: 12px 6px !important; margin: -12px -6px !important; }
    .tagBtn, .leadMacro, .statEdit, .cacheTag { padding: 14px 6px !important; margin: -14px -6px !important; }
    .footLink { display: inline-block; padding: 12px 4px; }

    /* The 15px checkbox visual keeps its size; the invisible input that
       takes the tap grows to 44px, centred on it */
    .cbInput {
      width: 44px !important; height: 44px !important;
      left: 50% !important; top: 50% !important; right: auto !important; bottom: auto !important;
      transform: translate(-50%, -50%);
    }
  }
`;
