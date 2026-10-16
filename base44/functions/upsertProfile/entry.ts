import { method405, readBody, authorizeWrite } from '../../shared/hud.ts';

function txt(res, status) {
  return new Response(res, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Authorized settings write: phone plus the voice-call, Jarvis-agent and
// WhatsApp fields the agent needs. superagent_id is the Base44 Superagent id
// (the 24-hex id after /agents/ in the agent's Base URL); hud_app_id is filled
// automatically by the Settings page from the app context.
const STRING_FIELDS = ['phone', 'retell_agent_id', 'retell_from_number', 'owner_phone', 'superagent_id', 'whatsapp_url', 'hud_app_id', 'owner_name'];
const VOICE_PROVIDERS = ['base44', 'retell'];

export default async function(req) {
  try {
    const m405 = method405(req);
    if (m405) return m405;

    const auth = await authorizeWrite(req);
    if (!auth.ok) return txt('unauthorized', 401);
    const base44 = auth.base44;

    const parsed = await readBody(req);
    if (!parsed.ok) return txt(parsed.error, parsed.status);
    const body = parsed.body;

    const update = {};
    for (const field of STRING_FIELDS) {
      if (Object.hasOwn(body, field)) {
        if (typeof body[field] !== 'string') return txt(field + ' must be text', 400);
        update[field] = body[field].trim();
      }
    }
    if (Object.hasOwn(body, 'voice_provider')) {
      if (!VOICE_PROVIDERS.includes(body.voice_provider)) return txt('voice_provider must be one of: base44|retell', 400);
      update.voice_provider = body.voice_provider;
    }
    if (!Object.keys(update).length) return txt('no recognized fields to set', 400);
    update.updated_at = new Date().toISOString().slice(0, 10);

    const Profile = base44.asServiceRole.entities.Profile;
    const profiles = await Profile.list('-updated_date', 5);
    const target = profiles[0];
    if (target) {
      await Profile.update(target.id, update);
      return txt('profile updated', 200);
    }
    await Profile.create(update);
    return txt('profile created', 200);
  } catch (error) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
}