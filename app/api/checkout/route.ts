import { NextRequest, NextResponse } from "next/server";

// Stripe Checkout for the paid tiers, no SDK required (plain REST).
//
// POST { plan: "starter"|"unlimited", billing: "mo"|"yr", email? }
//   -> creates a subscription Checkout Session (1-day trial, card required)
//      and returns { ok, url } to redirect the visitor to Stripe.
//      Prices are created inline via price_data, so no dashboard setup is
//      needed beyond STRIPE_SECRET_KEY. To pin dashboard-managed prices
//      instead, set STRIPE_PRICE_<PLAN>_<MO|YR> to a price id.
//
// GET ?session_id=cs_...
//   -> verifies a returning session server-side and reports whether it is
//      paid/trialing and for which plan, so the client can activate the tier
//      without trusting URL params.

export const dynamic = "force-dynamic";

const PLANS: Record<string, { name: string; mo: number }> = {
  starter: { name: "B2Web Starter", mo: 2000 },      // cents
  unlimited: { name: "B2Web Unlimited", mo: 20000 },
};

async function stripe(path: string, form?: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const key = process.env.STRIPE_SECRET_KEY!;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      // A retried create (double click, flaky network) reuses the session
      // instead of minting duplicates.
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, body: await r.json() };
}

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: "stripe-not-configured" }, { status: 501 });
  }
  let plan = "", billing = "mo", email = "", userId = "";
  try {
    const j = await req.json();
    plan = String(j.plan || "");
    billing = j.billing === "yr" ? "yr" : "mo";
    email = String(j.email || "").slice(0, 200);
    userId = String(j.userId || "").slice(0, 64);
  } catch {}
  const p = PLANS[plan];
  if (!p) return NextResponse.json({ ok: false, error: "unknown plan" }, { status: 400 });

  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()}`];
  // Yearly bills 12 months at 20% off the monthly rate.
  const unitAmount = billing === "yr" ? Math.round(p.mo * 0.8) * 12 : p.mo;

  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "1",
    "metadata[plan]": plan,
    "metadata[billing]": billing,
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancel`,
    allow_promotion_codes: "true",
  };
  if (priceId) {
    form["line_items[0][price]"] = priceId;
  } else {
    form["line_items[0][price_data][currency]"] = "usd";
    form["line_items[0][price_data][unit_amount]"] = String(unitAmount);
    form["line_items[0][price_data][recurring][interval]"] = billing === "yr" ? "year" : "month";
    form["line_items[0][price_data][product_data][name]"] =
      `${p.name} (${billing === "yr" ? "yearly" : "monthly"})`;
  }
  if (email) form.customer_email = email;
  if (userId) form.client_reference_id = userId; // ties the session to the account

  try {
    const { status, body } = await stripe("checkout/sessions", form);
    if (status >= 400 || !body.url) {
      const msg = (body.error as { message?: string } | undefined)?.message || `Stripe ${status}`;
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    return NextResponse.json({ ok: true, url: body.url, id: body.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Stripe unreachable" },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: "stripe-not-configured" }, { status: 501 });
  }
  const id = req.nextUrl.searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "bad session id" }, { status: 400 });
  }
  try {
    const { status, body } = await stripe(`checkout/sessions/${id}`);
    if (status >= 400) return NextResponse.json({ ok: false, error: `Stripe ${status}` }, { status: 502 });
    const paid = body.status === "complete" &&
      (body.payment_status === "paid" || body.payment_status === "no_payment_required");
    const meta = (body.metadata || {}) as { plan?: string; billing?: string };
    return NextResponse.json({
      ok: true,
      paid,
      plan: meta.plan && PLANS[meta.plan] ? meta.plan : null,
      billing: meta.billing === "yr" ? "yr" : "mo",
      customerEmail: (body.customer_details as { email?: string } | undefined)?.email || null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Stripe unreachable" },
      { status: 502 },
    );
  }
}
