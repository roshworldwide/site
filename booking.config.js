/* ============================================================
   Booking configuration — scheduling rules only. NO SECRETS here.
   (Secrets live in Vercel env vars; see BOOKING_SETUP.md.)
   Times below are interpreted in the OWNER timezone (`timezone`).
   The owner edits this file to change availability.
   ============================================================ */
export const config = {
  // Owner timezone (IANA). Env BOOKING_TZ overrides so it can change without a redeploy of code.
  timezone: process.env.BOOKING_TZ || "Asia/Kolkata",

  // Days the owner takes demos. 0=Sun, 1=Mon … 6=Sat.
  workingDays: [1, 2, 3, 4, 5],

  // Working window in owner-local 24h time. Slots are generated in [startHour, endHour).
  startHour: 10,
  endHour: 18,

  // Slot length (minutes). Availability + the calendar both read this.
  slotMinutes: 30,

  // Minimum lead time before a slot can be booked (hours) and how far ahead bookings open (days).
  minHoursNotice: 6,
  maxDaysAhead: 30,

  // Specific dates to block (owner-local, "YYYY-MM-DD"), e.g. holidays / travel.
  blockedDates: [],

  // Per-IP abuse guard: at most `rateMax` booking attempts per `rateWindowSec`.
  rateMax: 8,
  rateWindowSec: 3600,
};
