// Transactional email via Resend's REST API (no SDK). Used to tell a visitor
// their requested area has been loaded. Entirely optional: without
// RESEND_API_KEY set, sendEmail is a no-op and the in-app notification still
// works. Set NOTIFY_FROM_EMAIL to a verified sender (e.g. "B2Web
// <alerts@b2web.site>").

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.NOTIFY_FROM_EMAIL || "B2Web <onboarding@resend.dev>";
export const emailConfigured = !!RESEND_KEY;

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

// Fire-and-forget notify to many recipients; failures are swallowed so a
// crawl never blocks on email delivery.
export async function notifyByEmail(emails: string[], areaLabel: string, siteUrl: string): Promise<void> {
  if (!RESEND_KEY || !emails.length) return;
  const subject = `Your requested area is ready: ${areaLabel}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">`
    + `<p>Good news — <strong>${escapeHtml(areaLabel)}</strong> has been loaded on B2Web and is ready to work.</p>`
    + `<p><a href="${siteUrl}" style="color:#2563eb">Open B2Web</a> to see the no-website businesses in that area.</p>`
    + `<p style="color:#888;font-size:12px">You're getting this because you requested this area. </p></div>`;
  await Promise.all(emails.map((to) => sendEmail(to, subject, html)));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
