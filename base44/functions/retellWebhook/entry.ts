import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets, waitUntil } from 'base44:runtime';
import { AUTO_CONTINUE_DELAY_MS, hudBaseUrl, postWithDeliveryConfirmation } from '../../shared/after-call-bridge.ts';
import { autoContinueReceipt } from '../../shared/auto-continue.ts';

const CALL_ANALYZED = 'call_analyzed';
const RETELL_API = 'https://api.retellai.com';
const CALL_ID_PATTERN = /^call_[a-f0-9]+$/;
const LOOKUP_TIMEOUT_MS = 8_000;
const LOOKUP_MAX_AGE_MS = 15 * 60 * 1000;
const ANALYSIS_MAX_CHARS = 2_000;

function text(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' },
  });
}

function toMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Date.now();
  // Retell timestamps are unix seconds; tolerate milliseconds.
  return n < 1e12 ? n * 1000 : n;
}

async function verifySignature(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !signature) return false;
  const match = signature.match(/v=(\d+),d=(.*)/);
  if (!match) return false;
  const tsStr = match[1];
  const digest = match[2];
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody + tsStr));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== digest.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= expected.charCodeAt(i) ^ digest.charCodeAt(i);
  return diff === 0;
}

// Path 2: authenticated Retell lookup of the call. Used when the HMAC check
// fails, so a real delivery is never lost to a rotated signing secret.
// Accepts only this owner's agent, a terminal call status, and a recent end timestamp.
// The expected agent id is read from the Profile record, never hard-coded.
async function lookupCall(callId, secret, expectedAgentId) {
  if (typeof callId !== 'string' || !CALL_ID_PATTERN.test(callId)) return null;
  let res;
  try {
    res = await fetch(RETELL_API + '/v2/get-call/' + callId, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: { Authorization: 'Bearer ' + secret },
    });
  } catch { return null; }
  if (res.status !== 200) return null;
  let call = null;
  try { call = await res.json(); } catch { return null; }
  if (!call || typeof call !== 'object') return null;
  if (call.agent_id !== expectedAgentId) return null;
  if (call.call_status !== 'ended' && call.call_status !== 'not_connected') return null;
  const rawEnd = Number(call.end_timestamp);
  if (!Number.isFinite(rawEnd) || rawEnd <= 0) return null;
  const endMs = rawEnd < 1e12 ? rawEnd * 1000 : rawEnd;
  if (Math.abs(Date.now() - endMs) > LOOKUP_MAX_AGE_MS) return null;
  return call;
}

// Background dispatch: conversation creation + message delivery. The receipt
// already exists (created in the fast path); this updates it to
// dispatch_submitting / dispatch_accepted / dispatch_failed / dispatch_unknown.
async function dispatchBackground({ receipts, logs, pat, callId, transcript, callStatus, callAnalysis, receiptId, baseUrl }) {
  const callTail = String(callId || '').slice(-6);
  const prompt =
    'This is an unattended run. Never pause to ask whether to continue or to confirm the plan; there is nobody here to answer. Complete the whole job in this run, and if you must stop, stop only for a real owner blocker and send the WhatsApp message first. ' +
    'Do not call any lead, client or third party. You may call the owner, and only the owner, in exactly one case: the owner explicitly asked on this call to be phoned when the work is done. In that case, after the work is verified complete on the HUD, place one call to the owner with the make_phone_call tool, open with what was finished in one sentence, and end the call. If the call tool is unavailable in this conversation, send the same sentence on WhatsApp and log it with logActivity. ' +
    'If this call was itself a call-back reporting finished work and the owner asks for a correction to that work, the original request to be phoned carries over: call the owner again when the correction is verified complete, unless they say not to. ' +
    'Before spending credits on media or research, check every prerequisite you cannot create yourself, such as whether the target Base44 app exists; if one is missing, message the owner first, then proceed with the parts that do not depend on it. ' +
    'This is the exact ended Retell call, receipt ' + receiptId + ', ending ' + callTail + '. The full transcript is included below because native tools cannot fetch Retell transcripts. ' +
    'Apply CALL WRAP-UP AND EXECUTION v4: capture every clear owner request as a board task if not already on the board ' +
    '(match by title; do not duplicate tasks the phone agent added during the call), execute safe authorized work end to end, ' +
    'save verified results to the board, write one Memory outcome line \'Retell call, receipt ' + receiptId + ', ending ' + callTail + ': <summary>\'. ' +
    'When the owner reports a closed or signed deal, call upsertLead with status won, deal_value as the amount in dollars, and won_at as today; if no amount was given, ask the owner for it on the call-back or WhatsApp message rather than leaving it blank. ' +
    'The moment you discover something only the owner can do (create an app, add a key, press Publish, give a missing detail), stop and send the owner a WhatsApp message right away, containing exactly what you need and a link to this conversation. Send the owner\u2019s WhatsApp message through a one-time workflow scheduled exactly 2 minutes from now, never later; create it the moment you know what you need, before any other work. Then log the blocker with logActivity prefixed NEEDS OWNER and continue any work that does not depend on the owner. ' +
    'If the owner asked to be called when this work is done and the HUD voice provider is retell, call the callMeRetell backend function with a one-sentence message describing the result; if the provider is base44 or the call cannot be placed, send the result on WhatsApp instead and log it with logActivity. ' +
    'Never invent missing words; latest correction wins; no outreach to real people.';
  const analysisSection = callAnalysis ? '\n\n--- CALL ANALYSIS ---\n' + callAnalysis : '';
  const content = prompt + analysisSection + '\n\n--- TRANSCRIPT (call_status: ' + callStatus + ') ---\n' + transcript;

  try {
    const conversation = await fetch(baseUrl + '/user-agent/conversations/v2', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: 'Bearer ' + pat, 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { source: 'retell_webhook', call_id: callId } }),
    });
    if (!conversation.ok) {
      await receipts.update(receiptId, { status: 'dispatch_failed', error: 'conversation_create_failed_' + conversation.status });
      return;
    }
    const conversationData = await conversation.json();
    const conversationId = conversationData?.id;
    if (typeof conversationId !== 'string' || !/^[a-f0-9]{24}$/.test(conversationId)) {
      await receipts.update(receiptId, { status: 'dispatch_failed', error: 'invalid_conversation_id' });
      return;
    }
    const messageId = crypto.randomUUID();
    await receipts.update(receiptId, { status: 'dispatch_submitting', conversation_id: conversationId, message_id: messageId });
    const delivery = await postWithDeliveryConfirmation(fetch, baseUrl + '/user-agent/conversations/' + conversationId + '/messages', pat, {
      id: messageId, role: 'user', hidden: false, content,
    }, conversationId, messageId, baseUrl);
    if (delivery.kind === 'unknown') {
      await receipts.update(receiptId, { status: 'dispatch_unknown', lock_until_ms: Date.now() + 600_000 });
      return;
    }
    if (delivery.kind === 'rejected') {
      await receipts.update(receiptId, { status: 'dispatch_failed', error: 'message_rejected' });
      return;
    }
    await receipts.update(receiptId, { status: 'dispatch_accepted' });
    await logs.create({ type: 'note', task_title: 'Retell webhook', message: 'Retell call ' + callId + ' handed to Jarvis for execution' });
    // Delayed safety net for this specific run, independent of the poller, in
    // case the run parks on a question to an owner who is not there.
    try {
      const row = await receipts.get(receiptId);
      if (row) {
        waitUntil(new Promise((resolve) => setTimeout(() => resolve(autoContinueReceipt({ receipt: row, receipts, logs, pat, baseUrl }).catch(() => {})), AUTO_CONTINUE_DELAY_MS)));
      }
    } catch { /* the poller sweep covers this run */ }
  } catch (e) {
    await receipts.update(receiptId, { status: 'dispatch_failed', error: 'dispatch_exception:' + String(e?.message || e).slice(0, 180) });
  }
}

export default async function(req) {
  if (req.method !== 'POST') return text({ error: 'method_not_allowed' }, 405);
  const rawBody = await req.text();
  const secret = secrets.get('RETELL_API_KEY');
  if (!secret) return text({ error: 'RETELL_API_KEY not set' }, 503);

  let base44 = null;
  try { base44 = createClientFromRequest(req); } catch {}
  if (!base44) return text({ error: 'sdk_unavailable' }, 503);

  // Owner-specific Retell agent id and Base44 Superagent id are read from the
  // Profile record at runtime, so this exact function installs for any owner.
  const profile = (await base44.asServiceRole.entities.Profile.list('-updated_date', 1))[0] || null;
  const expectedAgentId = profile?.retell_agent_id || '';
  const superagentId = profile?.superagent_id || '';
  const baseUrl = hudBaseUrl(superagentId);

  const signature = req.headers.get('x-retell-signature') || req.headers.get('X-Retell-Signature');

  // Best-effort parse for the delivery-attempt log (event type, call_id).
  let body = null;
  try { body = JSON.parse(rawBody); } catch { /* invalid_json handled below */ }
  const eventType = body?.event || 'unknown';
  const callIdFromBody = (body?.call?.call_id && typeof body.call.call_id === 'string') ? body.call.call_id : '';

  // Verify, in order: (1) HMAC signature, (2) authenticated Retell lookup.
  // The path that accepted the delivery becomes its source of truth.
  const signatureOk = await verifySignature(rawBody, signature, secret);
  if (body?.event === 'call_inbound') {
    if (!signatureOk) return text({ error: 'invalid_signature' }, 401);
    const digits = (value) => typeof value === 'string' ? value.replace(/\D/g, '') : '';
    const owner = digits(profile?.owner_phone);
    const destination = digits(profile?.retell_from_number);
    const inbound = body.call_inbound;
    if (!owner || !destination || !expectedAgentId ||
        digits(inbound?.from_number) !== owner || digits(inbound?.to_number) !== destination) {
      return text({ call_inbound: { reject: true } });
    }
    return text({ call_inbound: { override_agent_id: expectedAgentId } });
  }
  let call = signatureOk ? body?.call : null;
  let verifyPath = signatureOk ? 'signature' : 'none';
  if (!signatureOk) {
    call = await lookupCall(callIdFromBody, secret, expectedAgentId);
    if (call) verifyPath = 'lookup';
  }

  // Log EVERY delivery attempt (even rejected ones) with the verify path used,
  // before any further filtering, so real Retell deliveries are always visible.
  const bodyBytes = new TextEncoder().encode(rawBody);
  const bodyDigest = await crypto.subtle.digest('SHA-256', bodyBytes);
  const bodyHash = Array.from(new Uint8Array(bodyDigest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (base44) {
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        type: 'note',
        task_title: 'Retell webhook delivery',
        message: 'diag: event=' + eventType + ' call_id=' + (callIdFromBody || 'none') +
          ' signature=' + (signature ? 'present' : 'absent') +
          ' sig_raw=' + (signature || 'none') +
          ' body_len=' + bodyBytes.length +
          ' body_sha256=' + bodyHash +
          ' verify=' + verifyPath,
      });
    } catch {}
  }

  if (verifyPath === 'none') return text({ error: 'invalid_signature' }, 401);
  if (!body || typeof body !== 'object') return text({ error: 'invalid_body' }, 400);
  if (body.event !== CALL_ANALYZED) return text({ ok: true, ignored: body.event }, 200);
  if (!call || typeof call !== 'object') return text({ ok: true, ignored: 'no_call' }, 200);
  if (call.agent_id !== expectedAgentId) return text({ ok: true, ignored: 'other_agent' }, 200);

  const callId = call.call_id;
  const transcript = typeof call.transcript === 'string' ? call.transcript : (Array.isArray(call.transcript) ? JSON.stringify(call.transcript) : '');
  const callStatus = call.call_status || 'completed';
  const callAnalysis = call.call_analysis && typeof call.call_analysis === 'object' ? JSON.stringify(call.call_analysis).slice(0, ANALYSIS_MAX_CHARS) : '';
  const completedAtMs = toMs(call.end_timestamp);
  if (!callId) return text({ error: 'missing_call_id' }, 400);

  // A call that never connected (or had zero duration) has nothing to hand over:
  // record it, but never dispatch a conversation.
  const durationMs = Number(call.duration_ms);
  const startedMs = Number(call.start_timestamp);
  const endedMs = Number(call.end_timestamp);
  const zeroDuration = Number.isFinite(durationMs)
    ? durationMs <= 0
    : (Number.isFinite(startedMs) && Number.isFinite(endedMs) && toMs(endedMs) <= toMs(startedMs));
  const noTranscript = callStatus === 'not_connected' || zeroDuration;

  const receipts = base44.asServiceRole.entities.CallReceipt;
  const logs = base44.asServiceRole.entities.ActivityLog;

  // Fast path: dedupe + create receipt, then return 200 immediately.
  const receiptKey = 'retell:' + callId;
  const existing = await receipts.filter({ call_id: receiptKey }, '-created_date', 1);
  if (existing.length) return text({ ok: true, duplicate: true }, 200);

  let pat = secrets.get('JARVIS_NATIVE_TOKEN');
  if (!noTranscript && !pat) return text({ error: 'JARVIS_NATIVE_TOKEN not set' }, 503);

  const receipt = await receipts.create({
    call_id: receiptKey,
    status: noTranscript ? 'no_transcript' : 'dispatch_pending',
    call_completed_at_ms: completedAtMs,
    created_at_ms: Date.now(),
  });
  if (!receipt?.id) return text({ error: 'receipt_create_failed' }, 502);
  if (noTranscript) return text('retell call ' + callId + ' recorded (no_transcript)', 200);

  // Defer conversation creation + message dispatch so the 200 is committed
  // before any slow upstream I/O, exactly like callMe's waitUntil pattern.
  waitUntil(new Promise((resolve) => setTimeout(() => resolve(dispatchBackground({ receipts, logs, pat, callId, transcript, callStatus, callAnalysis, receiptId: receipt.id, baseUrl })), 0)));
  return text('retell call ' + callId + ' accepted', 200);
}