/* ============================================================
   Shared booking backend helpers (NOT a route — the leading "_" tells
   Vercel to skip it). Zero-dependency: talks to Vercel KV (Upstash) and
   Resend over their REST APIs with native fetch. Reads secrets from
   process.env only — nothing is ever hardcoded.
   ============================================================ */
import crypto from "node:crypto";
import { config } from "../booking.config.js";

export { config };

/* ---------- HTTP helpers ---------- */
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://roshworldwide.com";

export function applyCors(req, res) {
  const origin = req.headers.origin;
  // Same-origin in production; allow the configured site origin (and localhost for `vercel dev`).
  const allowed = [SITE_ORIGIN, "http://localhost:3000", "http://localhost:8080"];
  if (origin && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}
export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/* ---------- Vercel KV (Upstash REST) — atomic primitives ---------- */
async function kv(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) { const e = new Error("KV_NOT_CONFIGURED"); e.code = "KV_NOT_CONFIGURED"; throw e; }
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error("KV_ERROR_" + r.status);
  const data = await r.json();
  return data.result;
}
export const kvSetNX = (key, value, ttlSec) => kv(ttlSec ? ["SET", key, value, "NX", "EX", ttlSec] : ["SET", key, value, "NX"]); // -> "OK" if claimed, null if taken
export const kvSet = (key, value, ttlSec) => kv(ttlSec ? ["SET", key, value, "EX", ttlSec] : ["SET", key, value]);
export const kvGet = (key) => kv(["GET", key]);
export const kvDel = (key) => kv(["DEL", key]);
export const kvMget = (keys) => (keys.length ? kv(["MGET", ...keys]) : []);
export async function kvIncrWithTtl(key, ttlSec) {
  const n = await kv(["INCR", key]);
  if (n === 1) await kv(["EXPIRE", key, ttlSec]);
  return n;
}
export const kvConfigured = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

/* ---------- crypto ---------- */
export const randomToken = () => crypto.randomBytes(24).toString("base64url");
export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

/* ---------- timezone math (no library; offset-probe trick) ---------- */
function tzOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}
// Wall-clock time in `tz` -> the corresponding UTC Date (one DST-safe correction step).
export function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off = tzOffsetMinutes(tz, new Date(guess));
  return new Date(guess - off * 60000);
}

/* ---------- slot generation (canonical UTC) ---------- */
export const slotKey = (utcIso) => "slot:" + utcIso;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Candidate slots for an owner-local date, already filtered for working day / window / lead time.
export function candidateSlots(dateStr, nowMs = Date.now()) {
  if (!DATE_RE.test(dateStr)) return [];
  if (config.blockedDates.includes(dateStr)) return [];
  const [y, mo, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // date's weekday is tz-independent
  if (!config.workingDays.includes(weekday)) return [];

  const minTime = nowMs + (config.minHoursNotice || 0) * 3600000;
  const maxTime = nowMs + (config.maxDaysAhead || 30) * 86400000;
  const out = [];
  for (let h = config.startHour; h < config.endHour; h++) {
    for (let m = 0; m < 60; m += config.slotMinutes) {
      const start = zonedToUtc(y, mo, d, h, m, config.timezone);
      const t = start.getTime();
      if (t < minTime || t > maxTime) continue;     // never past / outside window
      out.push({ start: start.toISOString(), end: new Date(t + config.slotMinutes * 60000).toISOString() });
    }
  }
  return out;
}
export function isValidSlot(dateStr, startIso, nowMs = Date.now()) {
  return candidateSlots(dateStr, nowMs).some((s) => s.start === startIso);
}
// Human label of a UTC instant in a viewer timezone, e.g. "Thu, Jul 2 · 3:00 PM".
export function labelInTz(utcIso, tz) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
    }).format(new Date(utcIso));
  } catch (_) {
    return new Date(utcIso).toUTCString();
  }
}

/* ---------- validation / sanitising ---------- */
export const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
export const clean = (s, max = 2000) => String(s == null ? "" : s).replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, max);
export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const clientIp = (req) =>
  req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] ||
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

/* ---------- iCalendar (.ics) ---------- */
const icsDate = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export function buildICS({ uid, start, end, summary, description, organizerName, organizerEmail, attendeeName, attendeeEmail, stampIso }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//roshworldwide//booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + icsDate(stampIso || new Date().toISOString()),
    "DTSTART:" + icsDate(start),
    "DTEND:" + icsDate(end),
    "SUMMARY:" + icsEsc(summary),
    "DESCRIPTION:" + icsEsc(description),
    "ORGANIZER;CN=" + icsEsc(organizerName) + ":mailto:" + String(organizerEmail).replace(/[\r\n]/g, ""),
    "ATTENDEE;CN=" + icsEsc(attendeeName) + ";RSVP=TRUE:mailto:" + String(attendeeEmail).replace(/[\r\n]/g, ""),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/* ---------- email (Resend REST) ---------- */
export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export async function sendEmail({ to, subject, html, replyTo, ics, icsName }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_NOT_CONFIGURED");
  const from = process.env.MAIL_FROM || ("Roshan Raj <" + (process.env.OWNER_EMAIL || "roshan@roshworldwide.com") + ">");
  const body = { from, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) body.reply_to = replyTo;
  if (ics) body.attachments = [{ filename: icsName || "invite.ics", content: Buffer.from(ics, "utf8").toString("base64") }];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("RESEND_ERROR_" + r.status);
  return true;
}

export const OWNER_EMAIL = process.env.OWNER_EMAIL || "roshan@roshworldwide.com";
export { SITE_ORIGIN };
