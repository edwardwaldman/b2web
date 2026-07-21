import { NextResponse } from "next/server";

// Serves /ads.txt for Google AdSense verification, derived from the same
// env var that loads the AdSense script. Without it, an empty 404 keeps
// crawlers happy enough until AdSense is configured.
export const dynamic = "force-static";

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
  const pub = client.replace(/^ca-/, "");
  if (!pub) return new NextResponse("", { status: 404 });
  return new NextResponse(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain" },
  });
}
