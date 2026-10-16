import { method405, readBody, leadKey, validateEnum, findMatches, dedupeMatches, todayISO, normalizeDate, authorizeWrite, brisbaneTodayISO, parseDealValue } from '../../shared/hud.ts';

function txt(res, status) {
  return new Response(res, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const LEAD_STATUS = ['new', 'demo_built', 'contacted', 'replied', 'won', 'lost'];

// A won deal with no amount cannot count toward revenue: surface it to the owner.
async function flagMissingAmount(base44, businessName, status, dealValue) {
  if (status !== 'won') return;
  if (typeof dealValue === 'number' && dealValue > 0) return;
  try {
    await base44.asServiceRole.entities.ActivityLog.create({
      message: `${businessName} win recorded with no amount, tell Jarvis the deal value so revenue updates`,
      type: 'note',
      task_title: 'Revenue',
    });
  } catch (e) {}
}

function normalizedString(body, canonical, alias) {
  const hasCanonical = Object.hasOwn(body, canonical);
  const hasAlias = Object.hasOwn(body, alias);
  if (hasCanonical && typeof body[canonical] !== 'string') throw new Error(`${canonical} must be text`);
  if (hasAlias && typeof body[alias] !== 'string') throw new Error(`${alias} must be text`);
  return hasCanonical ? body[canonical] : hasAlias ? body[alias] : undefined;
}

export default async function(req) {
  try {
    const m405 = method405(req);
    if (m405) return m405;

    const auth = await authorizeWrite(req);
    if (!auth.ok) return txt("unauthorized", 401);
    const base44 = auth.base44;

    const parsed = await readBody(req);
    if (!parsed.ok) return txt(parsed.error, parsed.status);
    const body = parsed.body;

    const businessNameValue = normalizedString(body, 'business_name', 'name');
    const tradeValue = normalizedString(body, 'trade', 'business_type');
    const sourceUrlValue = normalizedString(body, 'source_url', 'source');
    const businessName = typeof businessNameValue === 'string' ? businessNameValue.trim() : null;
    if (!businessName) {
      return txt("business_name is required", 400);
    }
    const suburbRaw = typeof body?.suburb === 'string' ? body.suburb.trim() : '';
    if (!suburbRaw) {
      return txt("business_name and suburb are required", 400);
    }

    if (typeof body?.status === 'string') {
      const v = validateEnum(body.status, LEAD_STATUS, 'status');
      if (!v.ok) return txt(v.error, 400);
    }

    let wonAtISO;
    if (typeof body?.won_at === 'string' && body.won_at.trim()) {
      const d = normalizeDate(body.won_at);
      if (!d.ok) return txt(d.error, 400);
      wonAtISO = d.iso;
    }

    // Accept a number, or text such as '$2,000' or '2k', normalised to a number.
    let dealValue;
    let unparsedAmount;
    if (Object.hasOwn(body, 'deal_value') && body.deal_value !== null && body.deal_value !== '' && body.deal_value !== undefined) {
      const parsedDeal = parseDealValue(body.deal_value);
      if (parsedDeal.ok) dealValue = parsedDeal.value;
      else if (typeof body.deal_value === 'number' || typeof body.deal_value === 'string') {
        unparsedAmount = String(body.deal_value).slice(0, 60);
      } else {
        return txt("deal_value must be a number or an amount like $2,000", 400);
      }
    }

    const Lead = base44.asServiceRole.entities.Lead;
    const key = leadKey(businessName, suburbRaw);
    const matches = await findMatches(Lead, (r) => leadKey(r.business_name, r.suburb), key);

    if (matches.length > 0) {
      const existing = matches[0];
      const update = {};
      if (tradeValue !== undefined) update.trade = tradeValue;
      if (typeof body?.suburb === 'string') update.suburb = body.suburb;
      if (typeof body?.phone === 'string') update.phone = body.phone;
      if (typeof body?.website === 'string') update.website = body.website;
      if (typeof body?.google_rating === 'number') update.google_rating = body.google_rating;
      if (typeof body?.review_count === 'number') update.review_count = body.review_count;
      if (sourceUrlValue !== undefined) update.source_url = sourceUrlValue;
      if (typeof body?.status === 'string') update.status = body.status;
      if (typeof body?.demo_url === 'string') update.demo_url = body.demo_url;
      if (typeof body?.pitch === 'string') update.pitch = body.pitch;
      if (typeof body?.notes === 'string') update.notes = body.notes;
      if (dealValue !== undefined) update.deal_value = dealValue;
      else if (unparsedAmount) {
        // Keep the unreadable amount visible instead of dropping it silently.
        const prior = typeof body?.notes === 'string' ? body.notes : (typeof existing.notes === 'string' ? existing.notes : '');
        update.notes = `[reported deal_value unparsed: ${unparsedAmount}] ${prior}`.trim();
      }
      // won_at: on transition to won, set Brisbane today if not provided and not already set.
      const newStatus = typeof body?.status === 'string' ? body.status : existing.status;
      if (newStatus === 'won') {
        if (wonAtISO !== undefined) {
          update.won_at = wonAtISO;
        } else if (existing.status !== 'won' || !existing.won_at) {
          // A reported win always gets a date, so it can count toward revenue now.
          update.won_at = brisbaneTodayISO();
        }
      } else if (wonAtISO !== undefined) {
        update.won_at = wonAtISO;
      }
      await Lead.update(existing.id, update);
      await dedupeMatches(Lead, matches);
      const finalStatus = update.status || existing.status || 'new';
      const finalDeal = update.deal_value !== undefined ? update.deal_value : existing.deal_value;
      await flagMissingAmount(base44, businessName, finalStatus, finalDeal);
      return txt(`lead updated: ${businessName} (${finalStatus})`, 200);
    }

    const trade = typeof tradeValue === 'string' ? tradeValue : '';
    const phone = typeof body?.phone === 'string' ? body.phone : undefined;
    const website = typeof body?.website === 'string' ? body.website : undefined;
    const googleRating = typeof body?.google_rating === 'number' ? body.google_rating : undefined;
    const reviewCount = typeof body?.review_count === 'number' ? body.review_count : undefined;
    const sourceUrl = typeof sourceUrlValue === 'string' ? sourceUrlValue : '';
    const status = typeof body?.status === 'string' ? body.status : 'new';
    const demoUrl = typeof body?.demo_url === 'string' ? body.demo_url : undefined;
    const pitch = typeof body?.pitch === 'string' ? body.pitch : undefined;
    const notes = typeof body?.notes === 'string' ? body.notes : undefined;
    const finalWonAt = status === 'won'
      ? (wonAtISO !== undefined ? wonAtISO : brisbaneTodayISO())
      : (wonAtISO !== undefined ? wonAtISO : undefined);

    const data = {
      business_name: businessName,
      trade,
      suburb: suburbRaw,
      phone,
      website,
      google_rating: googleRating,
      review_count: reviewCount,
      source_url: sourceUrl,
      status,
      demo_url: demoUrl,
      pitch,
      notes,
      deal_value: dealValue,
      won_at: finalWonAt
    };

    await Lead.create(data);
    const rematches = await findMatches(Lead, (r) => leadKey(r.business_name, r.suburb), key);
    await dedupeMatches(Lead, rematches);
    await flagMissingAmount(base44, businessName, status, dealValue);

    try {
      await base44.asServiceRole.entities.Memory.create({
        text: `New lead found: ${businessName} — ${trade} — ${suburbRaw}`,
        kind: 'event',
        created_at: todayISO()
      });
    } catch (e) {}

    return txt(`lead created: ${businessName} (${status})`, 200);
  } catch (error) {
    return txt("bad request", 400);
  }
}
