import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

function json(body, status) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// findLeads — Jarvis researches real dental clinics in CDMX and saves them as Lead records.
export default async function(req) {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let base44, user;
    try {
      base44 = createClientFromRequest(req);
      user = await base44.auth.me();
    } catch { return json({ error: 'unauthorized' }, 401); }
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (user.role !== 'admin') return json({ error: 'forbidden' }, 403);

    let body = {};
    try { body = await req.json(); } catch { /* defaults below */ }
    const trade = String(body.trade || 'dental clinic').trim();
    const city = String(body.city || 'Mexico City').trim();
    const neighborhoods = String(body.neighborhoods || 'Condesa, Roma Norte, Roma Sur, Polanco, Del Valle, Narvarte').trim();
    const count = Math.min(Math.max(parseInt(body.count, 10) || 12, 1), 30);

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You have web search. Find REAL, currently operating ${trade} businesses in ${city}, in these neighborhoods: ${neighborhoods}.
Use Google Maps listings, clinic websites, and local directories. Prioritize small independent businesses (not hospital chains) with weak online presence: no online booking, basic or no website, or very few reviews.
Return exactly ${count} businesses as JSON. For each: business_name, suburb (neighborhood), phone (with +52 country code, or empty string), website (or empty string), google_rating (number, 0 if unknown), review_count (number, 0 if unknown), source_url (the Google Maps or website URL where you found it).`,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          businesses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                business_name: { type: 'string' },
                suburb: { type: 'string' },
                phone: { type: 'string' },
                website: { type: 'string' },
                google_rating: { type: 'number' },
                review_count: { type: 'number' },
                source_url: { type: 'string' },
              },
              required: ['business_name', 'suburb', 'source_url'],
            },
          },
        },
        required: ['businesses'],
      },
    });

    const found = Array.isArray(result?.businesses) ? result.businesses : [];
    const seen = new Set();
    const fresh = found.filter((b) => {
      const name = String(b?.business_name || '').trim();
      const key = name.toLowerCase() + '|' + String(b?.suburb || '').trim().toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const Lead = base44.asServiceRole.entities.Lead;
    const existingPage = await Lead.filter({ trade }, { limit: 500, fields: ['business_name', 'suburb'] });
    const existing = existingPage.items || existingPage || [];
    const existingKeys = new Set(existing.map((l) =>
      String(l.business_name || '').toLowerCase() + '|' + String(l.suburb || '').toLowerCase()));

    const toCreate = fresh
      .filter((b) => !existingKeys.has(String(b.business_name || '').toLowerCase() + '|' + String(b.suburb || '').toLowerCase()))
      .slice(0, count);

    const today = new Date().toISOString().slice(0, 10);
    let saved = [];
    if (toCreate.length) {
      saved = await Lead.bulkCreate(toCreate.map((b) => ({
        business_name: String(b.business_name || '').trim(),
        trade,
        suburb: String(b.suburb || city).trim(),
        phone: String(b.phone || '').trim(),
        website: String(b.website || '').trim(),
        google_rating: Number(b.google_rating) || 0,
        review_count: Number(b.review_count) || 0,
        source_url: String(b.source_url || '').trim(),
        status: 'new',
      })));
    }

    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Jarvis researched ${trade} in ${city} — found ${found.length}, saved ${saved.length} new leads.`,
      type: 'update',
      task_title: 'Lead research',
    });

    return json({ found: found.length, saved: saved.length, leads: saved }, 200);
  } catch (error) {
    return json({ error: 'research_failed', message: 'Lead research failed. Try again in a moment.', detail: String(error?.message || error) }, 500);
  }
}