import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

const LIST_AGENTS_URL = 'https://api.retellai.com/list-agents';
const LIST_PHONE_NUMBERS_URL = 'https://api.retellai.com/list-phone-numbers';

function json(body, status) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function fetchList(url, apiKey) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
  });
  let data = null;
  try { data = await response.json(); } catch { /* handled as an error below */ }
  return { ok: response.ok, status: response.status, data };
}

// Dedupe by agent id; carry a human-readable name for the Settings picker.
function collectAgents(data) {
  const list = Array.isArray(data) ? data : (Array.isArray(data?.agents) ? data.agents : []);
  const map = new Map();
  for (const a of list) {
    const id = a?.agent_id;
    if (typeof id !== 'string' || !id || map.has(id)) continue;
    map.set(id, { id, name: a?.agent_name || a?.name || id });
  }
  return Array.from(map.values());
}

function collectPhoneNumbers(data) {
  const list = Array.isArray(data) ? data : (Array.isArray(data?.phone_numbers) ? data.phone_numbers : []);
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const v = p?.phone_number ?? p?.number;
    if (typeof v !== 'string' || !v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

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

    const apiKey = secrets.get('RETELL_API_KEY');
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return json({ missing_secret: true, message: 'Add your Retell API key in the app secrets first, then Publish' }, 503);
    }

    const [agentsResponse, numbersResponse] = await Promise.all([
      fetchList(LIST_AGENTS_URL, apiKey),
      fetchList(LIST_PHONE_NUMBERS_URL, apiKey),
    ]);
    if (!agentsResponse.ok || !numbersResponse.ok) {
      return json({ error: 'retell_unreachable', message: 'Could not reach Retell. Try again in a moment.' }, 502);
    }

    const agents = collectAgents(agentsResponse.data);
    const phoneNumbers = collectPhoneNumbers(numbersResponse.data);

    const Profile = base44.asServiceRole.entities.Profile;
    const profile = (await Profile.list('-updated_date', 1))[0];
    const update = {};

    // Auto-fill only when Retell returns exactly one of each and the field is empty.
    if (!String(profile?.retell_agent_id || '').trim() && agents.length === 1) {
      update.retell_agent_id = agents[0].id;
    }
    if (!String(profile?.retell_from_number || '').trim() && phoneNumbers.length === 1) {
      update.retell_from_number = phoneNumbers[0];
    }
    // Prefill owner_phone from the Profile phone when present.
    if (!String(profile?.owner_phone || '').trim() && String(profile?.phone || '').trim()) {
      update.owner_phone = profile.phone.trim();
    }

    let created = false;
    if (Object.keys(update).length) {
      update.updated_at = new Date().toISOString().slice(0, 10);
      if (profile) await Profile.update(profile.id, update);
      else { await Profile.create(update); created = true; }
    }

    const saved = (await Profile.list('-updated_date', 1))[0] || profile || {};

    return json({
      agents,
      phone_numbers: phoneNumbers,
      filled: update,
      profile_created: created,
      profile_ready: {
        retell_agent_id: !!String(saved.retell_agent_id || '').trim(),
        retell_from_number: !!String(saved.retell_from_number || '').trim(),
        owner_phone: !!String(saved.owner_phone || '').trim(),
      },
    }, 200);
  } catch {
    return json({ error: 'discover_failed', message: 'Could not reach Retell. Try again in a moment.' }, 500);
  }
}
