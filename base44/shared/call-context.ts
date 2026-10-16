// Pre-call context lines shared by callMe and callMeRetell.
//
// The revenue definition deliberately matches the HUD dashboard's
// "Revenue This Month" tile: leads with status won whose won_at falls in the
// current Australia/Brisbane calendar month, summed by deal_value. Brisbane is
// UTC+10 with no daylight saving, so the month boundary is a fixed offset.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Brisbane calendar day key for a Lead date field. Date-only business fields
// are taken as written; timestamps are converted to Brisbane.
export function brisbaneDayKey(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const raw = value.trim();
  if (DATE_ONLY.test(raw)) return raw;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? raw + 'Z' : raw);
  if (!Number.isFinite(parsed)) return '';
  const shifted = new Date(parsed + 10 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function brisbaneMonthKey(now = Date.now()) {
  return brisbaneDayKey(new Date(now).toISOString()).slice(0, 7);
}

function money(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return '$' + n.toLocaleString('en-AU');
}

// Two short lines for the pre-call summary:
//   1. this month's revenue total
//   2. the wins behind it — business name and amount, most recent three
// A lead counts as a win behind the total only when it is this month's won
// deal and has an amount, so the named wins always reconcile with the total
// minus any amountless wins, which are reported separately as a count.
export async function buildRevenueLines(leads, now = Date.now()) {
  const month = brisbaneMonthKey(now);
  // filter() returns a page object ({items, ...}); unwrap it before use.
  const wonPage = await leads.filter(
    { status: 'won', won_at: { $gte: month + '-01', $lt: nextMonthStart(month) } },
    { sort: '-won_at', limit: 50 },
  );
  const won = Array.isArray(wonPage) ? wonPage : (Array.isArray(wonPage?.items) ? wonPage.items : []);

  const total = won.reduce((sum, lead) => sum + (typeof lead.deal_value === 'number' && Number.isFinite(lead.deal_value) ? lead.deal_value : 0), 0);
  const priced = won.filter((lead) => typeof lead.deal_value === 'number' && Number.isFinite(lead.deal_value) && typeof lead.business_name === 'string' && lead.business_name.trim());
  const amountless = won.length - priced.length;

  const revenueLine = 'Revenue this month: ' + money(total) + '.';
  let winsLine;
  if (!won.length) {
    winsLine = 'Wins behind it: none recorded this month.';
  } else if (!priced.length) {
    winsLine = 'Wins behind it: ' + won.length + ' won with no amount recorded.';
  } else {
    const named = priced.slice(0, 3).map((lead) => lead.business_name.trim() + ' ' + money(lead.deal_value)).join(', ');
    winsLine = 'Wins behind it (most recent three): ' + named + '.';
    if (amountless) winsLine = winsLine.replace(/\.$/, '') + '. ' + amountless + ' further win' + (amountless === 1 ? '' : 's') + ' had no amount recorded.';
  }
  return revenueLine + '\n' + winsLine;
}

function nextMonthStart(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? (y + 1) + '-01-01' : y + '-' + String(m + 1).padStart(2, '0') + '-01';
}
