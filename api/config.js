/* GET /api/config — public booking rules (no secrets). Lets the client render the
   calendar correctly and decide calendar-vs-email-only gracefully when the backend
   isn't wired up yet. */
import { applyCors, json, config, kvConfigured, mailConfigured } from "./_lib.js";

export default function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  return json(res, 200, {
    timezone: config.timezone,
    workingDays: config.workingDays,
    slotMinutes: config.slotMinutes,
    minHoursNotice: config.minHoursNotice,
    maxDaysAhead: config.maxDaysAhead,
    blockedDates: config.blockedDates,
    // booking goes live only when BOTH storage + email are configured in Vercel.
    live: kvConfigured() && mailConfigured(),
  });
}
