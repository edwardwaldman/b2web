import { NextRequest, NextResponse } from "next/server";
import { getNotifications, markNotificationsRead } from "@/lib/store";

// GET  /api/notifications?email=...      -> the user's notifications
// POST /api/notifications?email=...      -> mark all as read
//
// In-website side of "notify me when my requested area loads". The email is
// the signed-in user's own address (also sent by the client). Not sensitive:
// notifications only say an area is ready.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").slice(0, 200);
  if (!email) return NextResponse.json({ ok: true, notifications: [], unread: 0 });
  const notifications = await getNotifications(email);
  return NextResponse.json({
    ok: true,
    unread: notifications.filter((n) => !n.read).length,
    notifications: notifications.map((n) => ({
      id: n.id, title: n.title, body: n.body, areaKey: n.area_key,
      read: n.read, createdAt: n.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").slice(0, 200);
  if (email) await markNotificationsRead(email);
  return NextResponse.json({ ok: true });
}
