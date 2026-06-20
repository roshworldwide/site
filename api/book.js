/* POST /api/book — validate (server-side), atomically reserve the slot (SET NX),
   email both parties + attach a real .ics, return success or a "slot taken" conflict.
   Body: { date, slot(UTC ISO), name, email, project, message, botcheck, tz } */
import {
  applyCors, json, config, isValidSlot, slotKey, kvSetNX, kvSet, kvDel, kvIncrWithTtl, kvConfigured,
  mailConfigured, sendEmail, buildICS, labelInTz, randomToken, sha256, isEmail, clean,
  escapeHtml, clientIp, OWNER_EMAIL, SITE_ORIGIN,
} from "./_lib.js";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  let body = req.body;
  if (body == null || typeof body === "string") {
    try { body = typeof body === "string" ? JSON.parse(body || "{}") : await readJson(req); }
    catch (_) { return json(res, 400, { error: "bad_json" }); }
  }
  const { date, slot, name, email, project, message, botcheck, tz } = body || {};

  // honeypot — pretend success, persist nothing
  if (botcheck) return json(res, 200, { ok: true });

  // ---- server-side validation (never trust the client) ----
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json(res, 400, { error: "bad_date" });
  if (typeof slot !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(slot)) return json(res, 400, { error: "bad_slot" });
  const nm = clean(name, 120);
  const em = String(email || "").trim();
  if (!nm) return json(res, 400, { error: "name_required" });
  if (!isEmail(em)) return json(res, 400, { error: "bad_email" });
  if (!isValidSlot(date, slot)) return json(res, 409, { error: "slot_unavailable" }); // past / out-of-window / not a real slot

  if (!kvConfigured()) return json(res, 503, { error: "not_configured" });

  // ---- per-IP rate limit (best-effort; never blocks on KV hiccup) ----
  try {
    const n = await kvIncrWithTtl("rl:book:" + sha256(clientIp(req)), config.rateWindowSec);
    if (n > config.rateMax) return json(res, 429, { error: "rate_limited" });
  } catch (_) {}

  const proj = clean(project, 80) || "a project";
  const msg = clean(message, 1000);
  const start = slot;
  const end = new Date(new Date(start).getTime() + config.slotMinutes * 60000).toISOString();
  const key = slotKey(start);
  const token = randomToken();
  const cancelUrl = SITE_ORIGIN + "/api/cancel?token=" + token;

  const record = JSON.stringify({ name: nm, email: em, project: proj, message: msg, start, end, ct: sha256(token), at: new Date().toISOString() });

  // expire reservation keys ~a week past the slot so completed/abandoned bookings self-clean
  const ttl = Math.max(3600, Math.ceil((new Date(end).getTime() - Date.now()) / 1000) + 7 * 86400);

  // ---- ATOMIC double-booking guard: only the first writer wins ----
  let claimed;
  try { claimed = await kvSetNX(key, record, ttl); }
  catch (_) { return json(res, 502, { error: "storage_unavailable" }); }
  if (claimed !== "OK") return json(res, 409, { error: "slot_taken" });

  // cancel token -> slot key. If this write fails the cancel link would be dead AND the slot
  // would be stuck reserved, so unwind the just-claimed slot and report a clean failure.
  try { await kvSet("cancel:" + sha256(token), key, ttl); }
  catch (_) { try { await kvDel(key); } catch (__) {} return json(res, 502, { error: "storage_unavailable" }); }

  // ---- labels + invite ----
  const ownerTz = config.timezone;
  const visTz = (typeof tz === "string" && tz) ? tz : ownerTz;
  const visLabel = labelInTz(start, visTz);
  const ownerLabel = labelInTz(start, ownerTz);
  const summary = "Live demo — " + proj + " with Roshan";
  const description = "Live walkthrough of " + proj + " with Roshan Raj.\nNeed to cancel or reschedule? " + cancelUrl;
  const ics = buildICS({
    uid: "rosh-" + sha256(start + em).slice(0, 24) + "@roshworldwide.com",
    start, end, summary, description,
    organizerName: "Roshan Raj", organizerEmail: OWNER_EMAIL,
    attendeeName: nm, attendeeEmail: em,
  });

  // ---- emails (slot is already reserved; don't unwind it if mail hiccups). Track each send
  //      independently so `mailed` honestly reflects whether the VISITOR got their invite. ----
  let mailed = false;
  if (mailConfigured()) {
    try { await sendEmail({ to: em, replyTo: OWNER_EMAIL, subject: "You're booked: live demo with Roshan", html: visitorHtml(nm, proj, visLabel, cancelUrl), ics, icsName: "demo.ics" }); mailed = true; }
    catch (e) { console.error("visitor email failed:", String(e)); }
    try { await sendEmail({ to: OWNER_EMAIL, replyTo: em, subject: "New demo booking — " + proj, html: ownerHtml(nm, em, proj, ownerLabel, msg), ics, icsName: "demo.ics" }); }
    catch (e) { console.error("owner notify failed for reserved booking", start, ":", String(e)); }
  }

  return json(res, 200, { ok: true, start, end, label: visLabel, ics, mailed });
}

function visitorHtml(nm, proj, visLabel, cancelUrl) {
  const first = escapeHtml(nm.split(" ")[0] || nm);
  return `<div style="font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#1a1a1a;line-height:1.55;font-size:15px">
  <p>Hi ${first},</p>
  <p>You're booked for a live demo of <strong>${escapeHtml(proj)}</strong> with Roshan.</p>
  <p style="font-size:17px"><strong>${escapeHtml(visLabel)}</strong></p>
  <p>The calendar invite is attached — it'll drop straight into your calendar. I'll send a call link before we meet.</p>
  <p>Can't make it? <a href="${cancelUrl}">Cancel or reschedule here</a>.</p>
  <p>— Roshan<br><span style="color:#888">roshworldwide.com</span></p>
  </div>`;
}
function ownerHtml(nm, em, proj, ownerLabel, msg) {
  return `<div style="font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#1a1a1a;line-height:1.55;font-size:15px">
  <p><strong>New demo booking.</strong></p>
  <p>${escapeHtml(nm)} &lt;${escapeHtml(em)}&gt;<br>Project: ${escapeHtml(proj)}<br>When: <strong>${escapeHtml(ownerLabel)}</strong></p>
  ${msg ? `<p>Message:<br>${escapeHtml(msg)}</p>` : ""}
  <p>Invite attached.</p>
  </div>`;
}
