// Shared helpers for Jarvis HUD backend functions.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

export const MAX_BODY_BYTES = 100 * 1024;

export function method405(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed, use POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

export async function readBody(req) {
  let raw;
  try {
    raw = await req.text();
  } catch (e) {
    return { ok: false, status: 400, error: 'invalid request body' };
  }
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'request body too large' };
  }
  if (!raw) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, status: 400, error: 'invalid JSON' };
  }
}

export function normalizeKey(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function taskKey(title) {
  return normalizeKey(title);
}

export function leadKey(businessName, suburb) {
  return normalizeKey(businessName) + '|' + normalizeKey(suburb);
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Current calendar date in Australia/Brisbane (UTC+10, no DST) as a UTC-midnight Date.
function brisbaneBase() {
  const now = new Date();
  const t = new Date(now.getTime() + 10 * 3600 * 1000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function isoFromUTC(base) {
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function validDate(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function normalizeDate(input) {
  if (typeof input !== 'string') return { ok: false, error: 'due_date must be a string' };
  const s = input.trim().toLowerCase();
  if (!s) return { ok: false, error: 'due_date is empty' };

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (!validDate(y, mo, d)) return { ok: false, error: 'invalid date' };
    return { ok: true, iso: `${m[1]}-${m[2]}-${m[3]}` };
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (!validDate(y, mo, d)) return { ok: false, error: 'invalid date' };
    return { ok: true, iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }

  const base = brisbaneBase();
  if (s === 'today') return { ok: true, iso: isoFromUTC(base) };
  if (s === 'tomorrow') return { ok: true, iso: isoFromUTC(new Date(base.getTime() + 86400000)) };
  if (s === 'next week') return { ok: true, iso: isoFromUTC(new Date(base.getTime() + 7 * 86400000)) };

  m = s.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]);
    const today = base.getUTCDay();
    let diff = (target - today + 7) % 7;
    if (diff === 0) diff = 7;
    return { ok: true, iso: isoFromUTC(new Date(base.getTime() + diff * 86400000)) };
  }

  return { ok: false, error: 'due_date must be YYYY-MM-DD, DD/MM/YYYY, today, tomorrow, next <weekday> or next week' };
}

// Normalise a reported deal amount to a number of dollars.
// Accepts a number, or text such as '$2,000', '2000', '2k', '2.5k', '$1,250.50'.
export function parseDealValue(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? { ok: true, value: input } : { ok: false };
  }
  if (typeof input !== 'string') return { ok: false };
  const s = input.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return { ok: false };
  const m = s.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!m) return { ok: false };
  const n = parseFloat(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n >= 0 ? { ok: true, value: n } : { ok: false };
}

export function validateEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    return { ok: false, error: `${label} must be one of: ${allowed.join('|')}` };
  }
  return { ok: true };
}

// Find all records whose normalized key matches, oldest first.
export async function findMatches(entityColl, keyFn, key) {
  const all = await entityColl.list('-created_date', 500);
  return all
    .filter((r) => keyFn(r) === key)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
}

// Keep the oldest match, delete the rest. Swallows delete errors.
export async function dedupeMatches(entityColl, matches) {
  for (const r of matches.slice(1)) {
    try { await entityColl.delete(r.id); } catch (e) {}
  }
}

// Brisbane today as YYYY-MM-DD (UTC+10, no DST).
export function brisbaneTodayISO() {
  const now = new Date();
  const t = new Date(now.getTime() + 10 * 3600 * 1000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Authorize a write: either a valid x-hud-key (external caller) OR a
// server-verified Base44 admin/owner session. Never trusts browser-supplied
// identity. Returns { ok, base44, user } on success, { ok:false, status } otherwise.
export async function authorizeWrite(req) {
  const expected = secrets.get("HUD_KEY");
  const provided = req.headers.get("x-hud-key");
  const hudAuthed = !!(expected && provided && provided === expected);

  const base44 = createClientFromRequest(req);
  if (hudAuthed) return { ok: true, base44, user: null };

  try {
    const me = await base44.auth.me();
    if (me) {
      if (me.role === 'admin') return { ok: true, base44, user: me };
      const ownerEmail = secrets.get("OWNER_EMAIL");
      if (ownerEmail && me.email && String(me.email).toLowerCase() === String(ownerEmail).toLowerCase()) {
        return { ok: true, base44, user: me };
      }
    }
  } catch (e) { /* not authenticated */ }
  return { ok: false, status: 401 };
}
