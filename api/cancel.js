/* GET /api/cancel?token=… — free the slot, notify the owner, show a friendly page.
   Tokenized link from the confirmation email; no PII in the URL. */
import { kvGet, kvDel, sha256, sendEmail, mailConfigured, OWNER_EMAIL, escapeHtml } from "./_lib.js";

function page(title, body, status) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>html,body{margin:0}body{min-height:100vh;display:grid;place-items:center;background:#0E0E10;color:#F5F5F2;
font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-align:center;padding:2rem}
.card{max-width:44ch}h1{font-size:1.7rem;letter-spacing:-.02em;margin:0 0 .6rem}p{color:#C7C5C0;line-height:1.5}
a{color:#C9A876;text-decoration:none}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p><p><a href="/">← Back to roshworldwide.com</a></p></div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token") || "";

  if (!token || token.length > 200) { res.statusCode = 400; return res.end(page("Invalid link", "This cancellation link is missing or malformed.")); }

  const mapKey = "cancel:" + sha256(token);
  let slotKeyRef;
  try { slotKeyRef = await kvGet(mapKey); }
  catch (_) { res.statusCode = 502; return res.end(page("One moment", "Storage is briefly unavailable — please try the link again shortly.")); }
  if (!slotKeyRef) { res.statusCode = 404; return res.end(page("Already cancelled", "This booking was already cancelled, or the link has expired.")); }

  let detail = null;
  try { detail = JSON.parse(await kvGet(slotKeyRef)); } catch (_) {}
  // defense-in-depth: the token must match the hash stored on the booking record itself
  if (detail && detail.ct && detail.ct !== sha256(token)) {
    res.statusCode = 404; return res.end(page("Already cancelled", "This booking was already cancelled, or the link has expired."));
  }
  try { await kvDel(slotKeyRef); await kvDel(mapKey); } catch (_) {}

  if (mailConfigured() && detail) {
    try {
      await sendEmail({
        to: OWNER_EMAIL, subject: "Demo booking cancelled",
        html: `<div style="font-family:-apple-system,system-ui,sans-serif;color:#1a1a1a"><p><strong>A demo booking was cancelled.</strong></p><p>${escapeHtml(detail.name || "")} &lt;${escapeHtml(detail.email || "")}&gt;<br>${escapeHtml(detail.project || "")}<br>${escapeHtml(detail.start || "")}</p></div>`,
      });
    } catch (_) {}
  }

  res.statusCode = 200;
  return res.end(page("Booking cancelled", "That slot is free again — thanks for letting me know. Want a different time? Just book again."));
}
