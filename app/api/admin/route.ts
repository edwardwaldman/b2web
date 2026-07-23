import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, adminGateEnabled } from "@/lib/store";

// GET /api/admin  (header: x-admin-key)
// Validates the admin key so the client can confirm the operator's password
// server-side before enabling admin mode. Reports whether the gate is even
// configured (ADMIN_SECRET set) so the UI can explain an open deployment.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    gateEnabled: adminGateEnabled,
    admin: isAdminRequest(req),
  });
}
