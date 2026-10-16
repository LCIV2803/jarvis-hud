export const HUD = {
  bg: '#051838',
  panel: '#071A3A',
  border: '#14356B',
  text: '#EAF4FF',
  text2: '#7FB2E8',
  faint: '#3E6AA8',
  accent: '#52B5FF',
  green: '#3DDC84',
  amber: '#E8B45A',
  red: '#E5533D'
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const validCalendarDate = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
};

// Base44 has emitted both date-only business fields and UTC-naive timestamps.
// Date-only values must not be shifted; naive datetimes are explicitly UTC.
export const parseBase44Date = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (DATE_ONLY.test(raw)) return validCalendarDate(raw) ? { kind: 'date', dateKey: raw, epochMs: Date.parse(`${raw}T00:00:00Z`) } : null;
  const datePrefix = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || !validCalendarDate(datePrefix)) return null;
  const normalizedRaw = NAIVE_DATETIME.test(raw) ? `${raw}Z` : raw;
  // JavaScript Date accepts milliseconds, while Base44 can return six-digit fractions.
  const normalized = normalizedRaw.replace(/(\.\d{3})\d+(?=Z|[+-]\d\d:\d\d$)/, '$1');
  const epochMs = Date.parse(normalized);
  return Number.isFinite(epochMs) ? { kind: 'instant', epochMs } : null;
};

const partsFor = (epochMs, timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(epochMs));
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const y = get('year'); const m = get('month'); const d = get('day');
    return y && m && d ? `${y}-${m}-${d}` : '';
  } catch { return ''; }
};

export const fmtClock = (value, timeZone = 'Australia/Brisbane') => {
  const parsed = value instanceof Date ? { epochMs: value.getTime() } : parseBase44Date(value);
  if (!parsed || !Number.isFinite(parsed.epochMs)) return 'unknown';
  try { return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(parsed.epochMs)); } catch { return 'unknown'; }
};

export const isToday = (dateStr, now = Date.now(), timeZone = 'Australia/Brisbane') => {
  const parsed = parseBase44Date(dateStr);
  if (!parsed) return false;
  return (parsed.kind === 'date' ? parsed.dateKey : partsFor(parsed.epochMs, timeZone)) === partsFor(now, timeZone);
};

export const isThisWeek = (dateStr, now = Date.now(), timeZone = 'Australia/Brisbane') => {
  const parsed = parseBase44Date(dateStr);
  if (!parsed) return false;
  const key = parsed.kind === 'date' ? parsed.dateKey : partsFor(parsed.epochMs, timeZone);
  const today = partsFor(now, timeZone);
  if (!key || !today) return false;
  const day = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  const end = new Date(day); end.setUTCDate(end.getUTCDate() + 7);
  const candidate = new Date(`${key}T00:00:00Z`);
  return candidate >= day && candidate < end;
};

export const isOverdue = (dueDateStr, now = Date.now(), timeZone = 'Australia/Brisbane') => {
  const parsed = parseBase44Date(dueDateStr);
  if (!parsed) return false;
  const due = parsed.kind === 'date' ? parsed.dateKey : partsFor(parsed.epochMs, timeZone);
  const today = partsFor(now, timeZone);
  return Boolean(due && today && due < today);
};

export const brisbaneTodayISO = (now = Date.now()) => partsFor(now, 'Australia/Brisbane');

// Epoch-ms range [start, end) covering the current Brisbane calendar month.
export const brisbaneMonthRange = (now = Date.now()) => {
  const today = brisbaneTodayISO(now);
  const [y, m] = today.split('-').map(Number);
  return { start: Date.UTC(y, m - 1, 1) - 10 * 3600 * 1000, end: Date.UTC(y, m, 1) - 10 * 3600 * 1000 };
};

export const inBrisbaneMonth = (isoStr, range) => {
  const parsed = parseBase44Date(isoStr);
  if (!parsed) return false;
  if (parsed.kind === 'date') {
    const monthStart = brisbaneDayKey(new Date(range.start).toISOString()).slice(0, 7);
    return parsed.dateKey.slice(0, 7) === monthStart;
  }
  return parsed.epochMs >= range.start && parsed.epochMs < range.end;
};

// Brisbane calendar day key (YYYY-MM-DD) for a given ISO instant/date string.
export const brisbaneDayKey = (isoStr) => {
  const parsed = parseBase44Date(isoStr);
  return !parsed ? '' : parsed.kind === 'date' ? parsed.dateKey : partsFor(parsed.epochMs, 'Australia/Brisbane');
};

export const dayKeyInTimezone = (value, timeZone = 'Australia/Brisbane') => {
  const parsed = parseBase44Date(value);
  return !parsed ? '' : parsed.kind === 'date' ? parsed.dateKey : partsFor(parsed.epochMs, timeZone);
};

// Last n Brisbane day keys, oldest first.
export const lastBrisbaneDays = (n, now = Date.now()) => {
  const base = new Date(`${brisbaneTodayISO(now)}T00:00:00Z`);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(base.getTime() - i * 86400000);
    const y = t.getUTCFullYear();
    const m = String(t.getUTCMonth() + 1).padStart(2, '0');
    const d = String(t.getUTCDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
  }
  return days;
};

// Short relative-time label: 'just now', 'Nm', 'Nh', 'Nd'. Future/invalid is unknown.
export const relTime = (isoStr, now = Date.now()) => {
  const parsed = parseBase44Date(isoStr);
  if (!parsed || parsed.kind === 'date') return 'unknown';
  const diff = now - parsed.epochMs;
  if (!Number.isFinite(diff) || diff < 0) return 'unknown';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
};

export const isFreshJarvisProgress = (task, now = Date.now(), maxAgeMs = 15 * 60 * 1000) => {
  if (task?.status !== 'doing' || task?.execution_owner !== 'jarvis') return false;
  const parsed = parseBase44Date(task.progress_updated_at);
  if (!parsed || parsed.kind === 'date') return false;
  const age = now - parsed.epochMs;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
};

export const syncIsStale = (lastSyncAt, now = Date.now(), maxAgeMs = 45 * 1000) => {
  if (!Number.isFinite(lastSyncAt)) return true;
  return lastSyncAt > now || now - lastSyncAt > maxAgeMs;
};

const parsedActivityPayload = (message) => {
  if (typeof message !== 'string') return null;
  const match = message.match(/^After-call bridge:\s*(\{[\s\S]*\})\s*$/i);
  const candidate = match ? match[1] : message.trim();
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
};

export const formatActivityLog = (log) => {
  if (typeof log?.message === 'string' && /^diag:/.test(log.message.trim())) return { hidden: true, message: '' };
  const structuredDryRun = log?.dry_run === true || log?.mode === 'dry_run' || log?.event_type === 'dry_run' || log?.type === 'dry_run';
  const payload = parsedActivityPayload(log?.message);
  if (structuredDryRun || payload?.dry_run === true) return { hidden: true, message: '' };
  if (payload && (/after.?call/i.test(log?.type || '') || /after.?call/i.test(log?.event_type || '') || /^After-call bridge:/i.test(log?.message || '') || payload.source === 'after_call')) {
    if (payload.processed > 0) return { hidden: false, message: 'Call requests sent for processing' };
    if (payload.enabled === false) return { hidden: false, message: 'After-call processing is disabled' };
    if (payload.reason === 'ok' || payload.reason === 'poll_lock_busy') return { hidden: true, message: '' };
    return { hidden: false, message: 'After-call processing needs attention' };
  }
  if (payload) return { hidden: false, message: 'System update' };
  return { hidden: false, message: typeof log?.message === 'string' && log.message.trim() ? log.message : 'System update' };
};
