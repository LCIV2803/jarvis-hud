import { createClientFromRequest } from 'npm:@base44/sdk';
import { secrets, waitUntil } from 'base44:runtime';
import { hudBaseUrl, postWithDeliveryConfirmation } from '../../shared/after-call-bridge.ts';
import { buildRevenueLines } from '../../shared/call-context.ts';

const CONTROL_NAME = 'owner_native_call';
const IN_FLIGHT_MS = 10_000;
const UNKNOWN_HOLD_MS = 600_000;
const REVISION = 'native-report-first-2026-09-24-preferences';

// Build the call-brief prompt from the owner's profile: first name comes from
// owner_name, and the HUD app id for getContext from hud_app_id. No account
// ids or person names are hard-coded.
function buildPrompt(firstName, hudAppId) {
  const greeting = firstName ? "Hey " + firstName + ", it's Jarvis." : "Hey there, it's Jarvis.";
  return (
  'Call only the registered owner once using the native make_phone_call tool. ' +
  'Do not call another person or automatically redial. First read the latest HUD context ' +
  'using the native authenticated backend-function tool: getContext for HUD app ' +
  hudAppId + ' with empty payload. Its verified admin-session access is supported. ' +
  'Never print credentials or present old chat snapshots as current. ' +
  'Put the following conversation rules explicitly in the native phone tool purpose/goal, ' +
  'with only the concise verified facts needed for this call, not a backlog dump: ' +
  'Your first words are "' + greeting + '" Give ONE brief factual report of work ' +
  'actually completed today in Australia/Brisbane and any blocker needing the owner. ' +
  'Immediately after the greeting, SAY the actual report in two or three short sentences. ' +
  'Do not merely announce that you have an update, ask permission to give it, or jump ' +
  'to the closing question before delivering the report. Include at most one useful ' +
  'idea if it follows from the verified facts, clearly labeled as a suggestion. ' +
  'Profile.call_hours is a preferred outreach window, not a prohibition on working or ' +
  'calling at other appropriate times. Do not tell the owner to wait until tomorrow ' +
  'merely because that preferred window has passed. Never invent an availability rule. ' +
  'Do not describe old work as today\'s work; if nothing is verified, say so briefly. ' +
  'Then ask "Is there anything else you\'d like me to do or talk through?" ' +
  'The report is only the opening, never a recurring agenda. From then on, follow the ' +
  'owner\'s current conversation naturally: answer questions, discuss ideas, and take requests. ' +
  'If interrupted, yield and follow the new topic immediately. Do not resume or repeat ' +
  'the report or bring back old tasks unless the owner explicitly asks for the report ' +
  'again or for clarification about it. Ordinary conversation does not authorize tasks. ' +
  'Keep spoken turns short and ask only one necessary clarifying question at a time. ' +
  'For an actual task request, confirm unclear names, locations, counts or deadlines; ' +
  'the owner\'s latest correction replaces the earlier version. Do not start lengthy ' +
  'research during the call or claim unverified live results or board writes. Explain ' +
  'that agreed research and execution happen AFTER hang-up. Do not end the call because ' +
  'the report or one request is finished. When the owner indicates they are ready to ' +
  'finish, briefly confirm any agreed actions, let them finish or correct you, then say ' +
  'goodbye. If they continue speaking, continue the conversation instead of hanging up. ' +
  'End of spoken-call rules. The following is post-call routing, not a spoken briefing: ' +
  'After hang-up the HUD afterCall background bridge checks every five minutes and sends ' +
  'the exact call ID to a separate tool-enabled conversation for CALL WRAP-UP AND EXECUTION v4. ' +
  'That worker captures and executes safe authorized tasks and saves verified HUD results. ' +
  'The automatic [Outbound call] ended reply in THIS conversation has no tools; give a ' +
  'truthful acknowledgment and explain that transcript processing can take up to five minutes ' +
  'to begin. Do not describe that tool-less notification as a failure of the execution bridge, ' +
  'and do not claim the task is already complete. Only the actual owner transcript authorizes ' +
  'tasks, not old project chores recited by the phone assistant. ' +
  'Respect all approval boundaries. ' +
  'Do not claim ringing until the native tool confirms dialing or claim execution without evidence.');
}

function json(body, status) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'POST' } : {}) },
  });
}

function post(url, token, body, timeoutMs = 15_000) {
  return fetch(url, {
    method: 'POST',
    redirect: 'manual', // Edge runtime supports manual, not error; never follow redirects.
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function dispatchQueued({ base44, controls, token, controlId, requestId, logs, baseUrl, prompt }) {
  const recordFailure = async (reason) => {
    try { await logs.create({type:'note',task_title:'Jarvis call dispatch',message:'Call request '+requestId+' failed before dialing: '+reason}); } catch {}
  };
  const updateOwned = async (data) => {
    const result = await controls.updateMany({ id: controlId, request_id: requestId }, { $set: data });
    if (!result.success || result.updated !== 1) throw new Error('control_write_failed');
  };
  let conversationId;
  try {
    const response = await post(baseUrl + '/user-agent/conversations/v2', token, { metadata: {} });
    if (!response.ok) {
      await recordFailure('native conversation HTTP '+response.status);
      await updateOwned({ dispatch_state: [401, 403].includes(response.status) ? 'failed' : 'failed' });
      return;
    }
    const data = await response.json();
    if (typeof data.id !== 'string' || !/^[a-f0-9]{24}$/.test(data.id)) throw new Error('invalid_conversation');
    conversationId = data.id;
  } catch (e) {
    await recordFailure(String(e?.name)+': '+String(e?.message).replaceAll(String(token),'[REDACTED]').slice(0,250));
    try { await updateOwned({ dispatch_state: 'failed' }); } catch {}
    return;
  }
  const messageId = crypto.randomUUID();
  try {
    await updateOwned({ dispatch_state: 'submitting', conversation_id: conversationId, message_id: messageId, lock_until_ms: Date.now() + UNKNOWN_HOLD_MS });
    // Pre-call context: the same revenue lines the Retell route sends. A read
    // failure degrades to the prompt alone rather than aborting a queued call.
    let revenueLines = '';
    try {
      revenueLines = await buildRevenueLines(base44.asServiceRole.entities.Lead);
    } catch (e) {
      await logs.create({ type: 'note', task_title: 'Jarvis call context', message: 'Revenue context unavailable for this call: ' + String(e?.message || e).slice(0, 120) }).catch(() => {});
    }
    const delivery = await postWithDeliveryConfirmation(fetch, baseUrl + '/user-agent/conversations/' + conversationId + '/messages', token, {
      id: messageId, role: 'user', hidden: false, content: revenueLines ? prompt + ' Revenue context for this call, current as of now: ' + revenueLines : prompt,
    }, conversationId, messageId, baseUrl);
    if (delivery.kind === 'unknown') {
      await updateOwned({ dispatch_state: 'unknown', lock_until_ms: Date.now() + UNKNOWN_HOLD_MS });
      return;
    }
    if (delivery.kind === 'rejected') {
      await updateOwned({ dispatch_state: 'failed', lock_until_ms: 0 });
      return;
    }
    await updateOwned({ dispatch_state: 'submitted', lock_until_ms: 0 });
  } catch {
    try { await updateOwned({ dispatch_state: 'unknown', lock_until_ms: Date.now() + UNKNOWN_HOLD_MS }); } catch {}
  }
}

export default async function(req) {
  if (req.method !== 'POST') return json({ requestAccepted: false, error: 'method_not_allowed', revision: REVISION }, 405);
  let base44;
  let user;
  try {
    base44 = createClientFromRequest(req);
    user = await base44.auth.me();
  } catch {
    return json({ requestAccepted: false, error: 'unauthorized' }, 401);
  }
  if (!user) return json({ requestAccepted: false, error: 'unauthorized' }, 401);
  if (user.role !== 'admin') return json({ requestAccepted: false, error: 'forbidden' }, 403);

  let input;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4096) return json({ error: 'body_too_large' }, 413);
    input = raw.trim() ? JSON.parse(raw) : {};
    if (!input || typeof input !== 'object' || Array.isArray(input) || ('dry_run' in input && typeof input.dry_run !== 'boolean')) return json({ error: 'invalid_body' }, 400);
  } catch { return json({ error: 'invalid_json' }, 400); }

  const token = secrets.get('JARVIS_NATIVE_TOKEN');
  if (!token) return json({ requestAccepted: false, error: 'native_token_not_configured' }, 503);

  // The Superagent id and owner name come from the Profile at runtime. Without a
  // Superagent id there is no conversation to dispatch, so fail fast in plain words.
  const profile = (await base44.asServiceRole.entities.Profile.list('-updated_date', 1))[0] || null;
  const superagentId = profile?.superagent_id || '';
  if (typeof superagentId !== 'string' || !superagentId.trim()) {
    return json({ requestAccepted: false, error: 'Add your Jarvis agent ID in Settings first.' }, 400);
  }
  const baseUrl = hudBaseUrl(superagentId.trim());
  const ownerName = typeof profile?.owner_name === 'string' ? profile.owner_name.trim() : '';
  const firstName = ownerName.split(/\s+/)[0] || '';
  const hudAppId = typeof profile?.hud_app_id === 'string' && profile.hud_app_id.trim() ? profile.hud_app_id.trim() : '';
  const prompt = buildPrompt(firstName, hudAppId);

  // Admin-only diagnostic mode follows the real auth/config gates but can never
  // claim a dispatch, queue work, create a conversation or dial. Never coerce it.
  try {
    const controls = base44.asServiceRole.entities.CallControl;
    const rows = await controls.filter({ name: CONTROL_NAME }, '-created_date', 2);
    if (rows.length !== 1) {
      return json({ requestAccepted: false, error: rows.length ? 'control_not_unique' : 'control_not_initialized' }, 503);
    }
    const control = rows[0];
    if (input.dry_run === true) {
      const blocked = ['submitting', 'unknown'].includes(control.dispatch_state);
      const cooling = !Number.isFinite(control.lock_until_ms) || control.lock_until_ms > Date.now();
      const diagnostic = { dry_run: true, dialed: false, requestAccepted: false, auth_verified: true,
        native_token_configured: true, control_ready: true, would_queue: !blocked && !cooling,
        message_supported: false, superagent_configured: true,
        reason: blocked ? 'dispatch_unknown' : cooling ? 'cooldown_active' : 'ready', revision: REVISION };
      // Optional audit row for a scheduled no-dial test. Contains no credentials,
      // phone numbers, or caller-controlled text. Does not change call control.
      if (input.audit_dry_run === true) await base44.asServiceRole.entities.ActivityLog.create({
        type: 'note', task_title: 'EOD NO-DIAL DIAGNOSTIC', message: JSON.stringify(diagnostic),
      });
      return json(diagnostic, 200);
    }
    // These states require reconciliation, even after a cooldown expires.
    if (['submitting', 'unknown'].includes(control.dispatch_state)) {
      return json({ requestAccepted: false, error: 'dispatch_unknown' }, 409);
    }
    const requestId = crypto.randomUUID();
    const now = Date.now();
    const claim = await controls.updateMany(
      { id: control.id, lock_until_ms: { $lte: now }, dispatch_state: { $nin: ['submitting', 'unknown'] } },
      { $set: { request_id: requestId, lock_until_ms: now + IN_FLIGHT_MS, dispatch_state: 'claimed', conversation_id: '', message_id: '' } },
    );
    if (!claim.success || claim.updated !== 1) return json({ requestAccepted: false, error: 'cooldown_active' }, 429);

    // Defer invocation one turn so the 202 response is committed before any upstream I/O.
    waitUntil(new Promise((resolve) => setTimeout(() => resolve(dispatchQueued({ base44, controls, token, controlId: control.id, requestId, logs:base44.asServiceRole.entities.ActivityLog, baseUrl, prompt })), 0)));
    return json({ requestAccepted: true, request_id: requestId, state: 'queued', message_supported: false }, 202);
  } catch {
    return json({ requestAccepted: false, error: 'call_control_unavailable' }, 503);
  }
}
