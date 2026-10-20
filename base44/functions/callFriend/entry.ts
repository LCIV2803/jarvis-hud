import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { json, mask, retellCall, latestProfile } from '../../shared/retell.ts';

// One reusable "courier" agent: delivers Luis's exact message, captures the
// reply, and hangs up. The message is injected per call as a dynamic variable.
const COURIER_PROMPT = `You are Jarvis, Luis's AI assistant, making one brief, friendly outbound call to a friend of Luis named Sami.
When the call connects, open with EXACTLY this message, word for word: "{{call_message}}"
Then stop talking and listen.
If Sami shares a reply or a message for Luis, thank him and confirm you will pass it along. Do not add anything of your own, do not answer questions on Luis's behalf.
Keep the whole call under two minutes. Speak warm, natural English at a relaxed pace.
Once you have delivered the message and heard Sami's reply — or if Sami is busy, unavailable, or asks you to call later — say a brief goodbye and immediately use the end_call tool.`;



// Prefer the owner agent's own voice; fall back to the first male English voice.
async function pickVoice(apiKey, ownerAgentId) {
  if (ownerAgentId) {
    const agent = await retellCall(apiKey, '/get-agent/' + ownerAgentId, { method: 'GET' });
    const voiceId = agent.body?.voice_id;
    if (agent.ok && typeof voiceId === 'string' && voiceId) return voiceId;
  }
  const voices = await retellCall(apiKey, '/list-voices', { method: 'GET' });
  const list = Array.isArray(voices.body) ? voices.body : [];
  const englishMale = list.filter((v) => v.gender === 'male' && String(v.language || '').startsWith('en'));
  const preferred = englishMale.find((v) => /george|daniel/i.test(v.voice_id)) || englishMale[0] || list[0];
  return preferred?.voice_id || '';
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

    let input = {};
    try {
      const raw = await req.text();
      if (raw && raw.trim()) input = JSON.parse(raw);
    } catch { return json({ error: 'invalid_json' }, 400); }
    const dryRun = input?.dry_run === true;
    const toNumber = typeof input?.to_number === 'string' ? input.to_number.trim() : '';
    const message = typeof input?.message === 'string' ? input.message.trim().slice(0, 600) : '';

    if (!/^\+[1-9]\d{6,14}$/.test(toNumber)) {
      return json({ error: 'invalid_to_number', message: 'Give the number in international format, e.g. +19172274812.' }, 400);
    }
    if (message.length < 10) {
      return json({ error: 'invalid_message', message: 'Give the message Jarvis should say.' }, 400);
    }

    const apiKey = secrets.get('RETELL_API_KEY');
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return json({ error: 'missing_secret', message: 'Retell is not set up yet. Open Settings and pick Retell Jarvis to finish setup.' }, 503);
    }

    const profile = await latestProfile(base44);
    if (!profile || !String(profile.retell_from_number || '').trim()) {
      return json({ error: 'missing_profile_field', message: 'Finish Retell setup in Settings first.' }, 400);
    }
    const fromNumber = profile.retell_from_number.trim();
    const ownerAgentId = String(profile.retell_agent_id || '').trim();

    // Reuse the courier agent across calls; create it once on first use.
    let courierAgentId = String(profile.courier_agent_id || '').trim();
    if (!courierAgentId) {
      const voiceId = await pickVoice(apiKey, ownerAgentId);
      if (!voiceId) return json({ error: 'no_voice', message: 'Could not pick a voice for the courier agent.' }, 502);
      const llm = await retellCall(apiKey, '/create-retell-llm', {
        method: 'POST',
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          system_prompt: COURIER_PROMPT,
          dynamic_variables: ['call_message'],
          general_tools: [{ type: 'end_call', name: 'end_call' }],
        }),
      });
      if (!llm.ok || !llm.body?.llm_id) return json({ error: 'llm_create_failed', message: 'Could not create the courier voice.' }, 502);
      const agent = await retellCall(apiKey, '/create-agent', {
        method: 'POST',
        body: JSON.stringify({
          response_engine: { type: 'retell-llm', llm_id: llm.body.llm_id, version: 0 },
          voice_id: voiceId,
          agent_name: 'Jarvis Courier',
          language: 'en-US',
        }),
      });
      if (!agent.ok || !agent.body?.agent_id) return json({ error: 'agent_create_failed', message: 'Could not create the courier agent.' }, 502);
      courierAgentId = agent.body.agent_id;
      await base44.asServiceRole.entities.Profile.update(profile.id, { courier_agent_id: courierAgentId });
    }

    if (dryRun) {
      return json({
        dry_run: true, dialed: false,
        from_number: mask(fromNumber), to_number: mask(toNumber),
        courier_agent_id: courierAgentId,
        call_message: message,
      }, 200);
    }

    const dial = await retellCall(apiKey, '/v2/create-phone-call', {
      method: 'POST',
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: toNumber,
        override_agent_id: courierAgentId,
        retell_llm_dynamic_variables: { call_message: message },
      }),
    });
    if (!dial.ok || !dial.body?.call_id) {
      return json({ error: 'retell_rejected', message: 'Retell could not start the call. Check the number and try again.' }, 502);
    }
    return json({ ok: true, call_id: dial.body.call_id, to_number: mask(toNumber) }, 202);
  } catch {
    return json({ error: 'call_failed', message: 'The call could not be started. Try again.' }, 500);
  }
}