import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, adminGateEnabled, durableConfigured } from "@/lib/store";
import { emailConfigured } from "@/lib/email";

// GET /api/admin  (header: x-admin-key)
// Validates the admin key server-side and reports what's configured, so the
// Owner panel can show whether the owner-only gate, the durable shared cache,
// and email notifications are actually active on this deployment.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    gateEnabled: adminGateEnabled,   // ADMIN_SECRET set -> only owner can crawl
    durable: durableConfigured,      // Supabase set -> cache persists for everyone
    email: emailConfigured,          // Resend set -> requesters emailed on load
    googleConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
    admin: isAdminRequest(req),
  });
}
