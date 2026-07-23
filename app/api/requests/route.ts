import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, listRequests } from "@/lib/store";

// GET /api/requests  (admin only, header: x-admin-key)
// Lists areas non-admins have requested but that aren't cached yet, with a
// running count so the admin sees demand and can crawl each one for everyone.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
  }
  const requests = await listRequests();
  return NextResponse.json({
    ok: true,
    count: requests.length,
    totalRequesters: requests.reduce((n, r) => n + r.requests, 0),
    requests: requests.map((r) => ({
      key: r.key, label: r.label, lat: r.lat, lon: r.lon, radius: r.radius,
      requests: r.requests, firstRequested: r.first_requested, lastRequested: r.last_requested,
    })),
  });
}
