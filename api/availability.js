/* GET /api/availability?date=YYYY-MM-DD&tz=Area/City
   Real free slots for an owner-local date: candidate slots from config minus the
   ones already booked in KV. Never returns past / out-of-window slots. */
import { applyCors, json, config, candidateSlots, kvMget, slotKey, kvConfigured } from "./_lib.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });

  const url = new URL(req.url, "http://localhost");
  const date = url.searchParams.get("date") || "";
  const tz = url.searchParams.get("tz") || config.timezone;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: "bad_date" });

  const candidates = candidateSlots(date);
  if (!candidates.length) return json(res, 200, { date, slots: [] });
  if (!kvConfigured()) return json(res, 503, { error: "not_configured", slots: [] });

  let taken;
  try { taken = await kvMget(candidates.map((s) => slotKey(s.start))); }
  catch (_) { return json(res, 502, { error: "storage_unavailable", slots: [] }); }

  const fmtTime = (iso) => {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)); }
    catch (_) { return new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)); }
  };

  const slots = candidates
    .filter((_s, i) => !taken[i])
    .map((s) => ({ start: s.start, end: s.end, time: fmtTime(s.start) }));

  return json(res, 200, { date, tz, slots });
}
