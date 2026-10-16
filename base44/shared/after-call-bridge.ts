/* After-call poller library; importing the module performs no remote side effects.
 * The store methods mirror Base44 entity methods; updateMany must be an atomic conditional
 * update and the caller must verify updated === 1.
 *
 * No account IDs are hard-coded here. The Base44 Superagent id, the HUD app id and the
 * owner's name are read at runtime from the Profile record (superagent_id / hud_app_id /
 * owner_name), so this exact library installs unchanged for any owner.
 */

export const CONTROL_NAME = 'native_after_call_bridge';
export const AUTO_CONTINUE_DELAY_MS = 6 * 60 * 1000;
export const POLL_LOCK_MS = 300_000;
export const UNKNOWN_HOLD_MS = 600_000;
export const MAX_CANDIDATES_PER_POLL = 1;
export const MAX_SCAN_MS = 60_000;

// Native Superagent conversation API prefix, keyed by the account's Superagent id
// (the 24-hex id that appears after /agents/ in the Superagent Base URL).
export function hudBaseUrl(superagentId) {
  return `https://app.base44.com/api/apps/${superagentId}`;
}

// Imported lazily inside runAfterCallPoll to avoid a module cycle: auto-continue
// imports hudBaseUrl from this file.
export async function sweepAutoContinue(store, baseUrl) {
  const { runAutoContinueSweep } = await import('./auto-continue.ts');
  return runAutoContinueSweep({ receipts: store.receipt, logs: store.logs, pat: store.pat, baseUrl });
}

// The wrap-up prompt handed to Jarvis with the transcript. [RECEIPT_ID] / [CALL_TAIL] /
// [CALL_STATUS] are substituted at dispatch time; the HUD app id is injected here.
export function buildTranscriptPrompt({ receiptId, callTail, callStatus, hudAppId }) {
  return [
  'This is an unattended run. Never pause to ask whether to continue or to confirm the plan; there is nobody here to answer. Complete the whole job in this run, and if you must stop, stop only for a real owner blocker and send the Telegram message first.',
  'Do not call any lead, client or third party. You may call the owner, and only the owner, in exactly one case: the owner explicitly asked on this call to be phoned when the work is done. In that case, after the work is verified complete on the HUD, place one call to the owner with the make_phone_call tool, open with what was finished in one sentence, and end the call. If the call tool is unavailable in this conversation, send the same sentence on Telegram and log it with logActivity.',
  'If this call was itself a call-back reporting finished work and the owner asks for a correction to that work, the original request to be phoned carries over: call the owner again when the correction is verified complete, unless they say not to.',
  'Before spending credits on media or research, check every prerequisite you cannot create yourself, such as whether the target Base44 app exists; if one is missing, message the owner first, then proceed with the parts that do not depend on it.',
  'This is the exact ENDED owner call, receipt [RECEIPT_ID], ending [CALL_TAIL], with platform status [CALL_STATUS]. Ended does not mean successful.',
  'Use the authenticated HUD backend functions for app ' + hudAppId + ': call getContext, then save the owner task with upsertTask before executing it.',
  'Fetch the full exact transcript with native tools; the full call id is in this conversation metadata and ends with [CALL_TAIL]. Apply CALL WRAP-UP AND EXECUTION v4 and execute safe authorized work end to end without requiring reconfirmation.',
  'LIVE BOARD PROGRESS v1: For every task you will actually execute, first call upsertTask with its stable title, status doing, execution_owner jarvis, and a short factual progress_note saying what you are starting. Wait for a successful save before starting the work. Do not leave executing work in todo. A queued task that has not started must stay todo. Tasks for the owner to perform must use execution_owner owner and remain open.',
  'At real milestones update that same title with a factual progress_note, keeping status doing. If work lasts several minutes, save another actual progress update when a tool returns; never invent progress percentages or fake heartbeats. Never send progress_updated_at; the server stamps it. If blocked, return status todo with a progress_note describing the specific blocker. Finish by storing the full usable deliverable and source URLs in notes (not merely a sandbox filename), then status done and progress_note Result saved. Preserve the receipt reference in notes for deduplication. Do not repeat completed work to create activity.',
  'Check HUD receipt records before every action; this dispatch receipt is not proof that execution completed. If this receipt already has a completed execution record, do not repeat safe tasks.',
  'Never treat voicemail, an agent suggestion, or an unconfirmed statement as owner authorization.',
  'The platform may mark a connected call failed even when useful owner speech exists. Read the actual timestamped transcript, not just its generated summary. Recover only clear requests in the owner speech; never invent missing words, infer an unfinished correction, or execute a summary suggestion. The latest clear correction wins. If a request is cut off or materially ambiguous, record the clarification needed without guessing.',
  'Use the call timestamp and Profile timezone to resolve today/this afternoon; preserve the original timing if recovery is delayed. If the owner asked for a task for THEM to contact someone, create that open task for the owner; do not contact that person or mark the contact done. Do not create chores from the assistant opening report. Ordinary discussion is not a task request.',
  'For research or ranking, follow the exact scope, count, geography and criteria the owner requested. Never invent Google longevity, rankings, or evidence; state unknown explicitly. Do not perform outreach or other irreversible contact.',
  'A search that finds no official website supports only No official website found in the checked sources, not proof that no website exists. Do not invent commercial claims, conversion guarantees, platform fees, customer ROI, or statements that directory reviews are invisible. In draft sales copy, use qualified, factual wording and placeholders for unverified claims.',
  'The moment you discover something only the owner can do (create an app, add a key, press Publish, give a missing detail), stop and send the owner a Telegram message right away, containing exactly what you need and a link to this conversation. Send the owner\u2019s Telegram message through a one-time workflow scheduled exactly 2 minutes from now, never later; create it the moment you know what you need, before any other work. Then log the blocker with logActivity prefixed NEEDS OWNER and continue any work that does not depend on the owner.',
  'If a real permission or tool blocker prevents completion, record the specific blocker on the existing task.',
  'Do not stop at worker reports or a next-action proposal. Consolidate and save the requested deliverable. Resolve material evidence conflicts where possible; unresolved facts must be labeled unknown or unverified with lower confidence, not used to invent certainty or silently abandon the work. If a real permission or tool blocker prevents completion, record the specific blocker on the existing task.',
  'Use getContext, upsertTask, remember, logSession, and upsertLead as appropriate; save results to the HUD and verify each result.',
  'When the owner reports a closed or signed deal, call upsertLead with status won, deal_value as the amount in dollars, and won_at as today; if no amount was given, ask the owner for it on the call-back or Telegram message rather than leaving it blank.',
  'HUD PAYLOAD CONTRACT: Call the backend-function tool with app_id, function_name, and payload as an object. upsertLead requires business_name and suburb; use trade (not business_type), source_url (not source), phone, website, notes, status. Put the primary official source in source_url and additional sources in notes. Read back each saved Lead and verify its source_url, trade, phone and website, not just its existence. upsertTask requires title; put deliverables and the receipt reference in notes. remember requires text (not content) and kind. logSession requires title: first create status open with job and conversation_ref, then close the same title with status done and outcome after the work is saved; notes is not a session field. Never mark the task complete before its required records and result fields have been saved and read back.',
  'If the call contains no actionable owner request, do not invent a task, lead, or follow-up from the opening report. An explicitly cancelled request must not execute. An assistant suggestion is not permission to call or contact anyone. Preferred call_hours are not an instruction to postpone safe work.',
  'Finish and verify the saved work before notification delivery. Use a connected Telegram sending tool or existing notification workflow if available. If this conversation has no direct Telegram tool, the verified one-time Telegram workflow path is allowed once for this call, addressed only to the registered owner; it must be one-shot, never recurring. Do not modify other workflows. Do not hold task completion open while waiting for that notification or repeatedly search conversations or sleep in a loop. Claim delivery only when independently confirmed; otherwise say queued or unavailable and record that limitation in the session outcome.',
  'Do not claim that a task was completed unless the HUD and the native execution output verify it.',
  'If the owner asked to be called when this work is done and the HUD voice provider is retell, call the callMeRetell backend function with a one-sentence message describing the result; if the provider is base44 or the call cannot be placed, send the result on Telegram instead and log it with logActivity.',
  ].join(' ');
}

const ID = /^[a-f0-9]{24}$/;

// Only speech attributed to the owner within the ended call counts. Platform
// callbacks can be serialized as user messages after hang-up; exclude them.
function hasOwnerSpeech(transcript, startedAt, endedAt, nativeUtc) {
  return transcript.some((entry) => {
    if (entry?.role !== 'user' || typeof entry.text !== 'string' || !entry.text.trim()) return false;
    if (/^\s*\[(?:Outbound|Inbound) call\]/i.test(entry.text)) return false;
    const at = isoMs(entry.at, nativeUtc);
    return Number.isFinite(at) && at >= startedAt && at <= endedAt;
  });
}

function isoMs(value, nativeNaiveTimestampsAreUtc = false) {
  if (typeof value !== 'string') return NaN;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(value)) return Date.parse(value);
  // Opt-in only: native responses have been observed without a zone; callers
  // must configure this after verifying the platform's timestamp policy.
  if (nativeNaiveTimestampsAreUtc && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)) return Date.parse(`${value}Z`);
  return NaN;
}

function responseJson(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function request(fetchImpl, url, token, init = {}, timeoutMs = 15_000) {
  return fetchImpl(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
}

export async function findVisibleMessage(fetchImpl, token, conversationId, messageId, baseUrl) {
  if (!ID.test(conversationId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) return false;
  try {
    const response = await fetchImpl(`${baseUrl}/user-agent/conversations/${conversationId}/messages?limit=200`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5_000), headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const data = await response.json();
    const messages = Array.isArray(data) ? data : data?.messages;
    return Array.isArray(messages) && messages.some((message) => message?.id === messageId && message?.role === 'user');
  } catch { return false; }
}

// A verified delivered message clears only the ambiguous dispatch state, not
// the cooldown. This never sends another message or places another call.
export async function reconcileCallDispatch(controls, fetchImpl, pat, baseUrl) {
  const rows = await controls.filter({ name: 'owner_native_call' }, '-created_date', 2);
  if (rows.length !== 1) return false;
  const row = rows[0];
  if (row.name !== 'owner_native_call' || !['unknown', 'submitting'].includes(row.dispatch_state)) return false;
  if (!await findVisibleMessage(fetchImpl, pat, row.conversation_id, row.message_id, baseUrl)) return false;
  const result = await controls.updateMany(
    { id: row.id, name: row.name, request_id: row.request_id, conversation_id: row.conversation_id, message_id: row.message_id, dispatch_state: row.dispatch_state },
    { $set: { dispatch_state: 'submitted' } },
  );
  return result?.success === true && result.updated === 1;
}

/** Confirm a slow native POST by observing the exact user message once it is visible.
 * No second POST is ever attempted. A visible exact UUID proves dispatch only, not execution. */
export async function postWithDeliveryConfirmation(fetchImpl, url, token, body, conversationId, messageId, baseUrl) {
  const monitorUrl = `${baseUrl}/user-agent/conversations/${conversationId}/messages?limit=20`;
  let stopped = false;
  let timer;
  const pause = (ms) => new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  const postPromise = request(fetchImpl, url, token, { method: 'POST', body: JSON.stringify(body) }, 180_000);
  // Always observe rejection so a monitor win cannot create an unhandled rejection.
  postPromise.catch(() => {});
  const postOutcome = postPromise.then((response) => {
    if (response.ok) return { kind: 'accepted' };
    if (response.status >= 400 && response.status < 500 && response.status !== 408) return { kind: 'rejected', status: response.status };
    return { kind: 'unknown' };
  }, () => ({ kind: 'unknown' }));
  const monitor = (async () => {
    // Let an already-resolved POST win before starting any read monitor.
    await pause(1000);
    for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
      if (attempt) await pause(1000);
      if (stopped) return { kind: 'cancelled' };
      try {
        const response = await fetchImpl(monitorUrl, {
          method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5_000),
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        const messages = Array.isArray(data) ? data : data?.messages;
        if (Array.isArray(messages) && messages.some((message) => message?.id === messageId && message?.role === 'user')) return { kind: 'confirmed' };
      } catch { /* bounded read-only monitor; unresolved delivery remains ambiguous */ }
    }
    return { kind: 'unknown' };
  })();
  // A monitor timeout means only that the message is not visible yet. It must
  // not beat a still-running POST and manufacture an early `unknown` state.
  // Await the bounded POST outcome before declaring ambiguity; a confirmed
  // visible message remains an allowed early success path.
  const winner = await Promise.race([postOutcome, monitor]);
  if (winner.kind === 'unknown') {
    const outcome = await postOutcome;
    stopped = true;
    clearTimeout(timer);
    return outcome;
  }
  stopped = true;
  clearTimeout(timer);
  return winner;
}

async function resolveHudConfig(store) {
  if (!store?.profile) return { ok: false, reason: 'profile_store_missing' };
  let profile = null;
  try {
    const profiles = await store.profile.list('-updated_date', 1);
    profile = profiles && profiles[0] ? profiles[0] : null;
  } catch { profile = null; }
  const superagentId = profile?.superagent_id || '';
  const hudAppId = profile?.hud_app_id || '';
  if (typeof superagentId !== 'string' || !superagentId.trim()) return { ok: false, reason: 'superagent_not_configured' };
  if (typeof hudAppId !== 'string' || !hudAppId.trim()) return { ok: false, reason: 'hud_app_not_configured' };
  return { ok: true, superagentId: superagentId.trim(), hudAppId: hudAppId.trim(), baseUrl: hudBaseUrl(superagentId.trim()) };
}

/**
 * Run one read/dispatch pass. The caller supplies a Base44 service-role entity facade.
 * `pat` is the server-only JARVIS_NATIVE_TOKEN; it is never returned or logged.
 */
export async function runAfterCallPoll({ store, fetchImpl = fetch, pat, now = Date.now, enabled = true }) {
  if (!enabled || !pat) return { enabled: false, processed: 0, reason: 'disabled_or_missing_secret' };
  const hud = await resolveHudConfig(store);
  if (!hud.ok) return { enabled: true, processed: 0, reason: hud.reason };
  const baseUrl = hud.baseUrl;
  const controls = store.control;
  const receipts = store.receipt;
  let configured = await controls.filter({ name: CONTROL_NAME }, '-created_date', 2);
  // First run on a fresh install: no control row exists yet, so create the one
  // this poll needs. Enrollment is stamped now, so calls that completed before
  // initialisation are ignored. Only ever creates when the table is empty for
  // this name; an existing row, including one the owner has deliberately
  // disabled, is left exactly as it is.
  if (configured.length === 0) {
    const initialised = await controls.create({
      name: CONTROL_NAME,
      enabled: true,
      enrollment_at_ms: now(),
      poll_lock_until_ms: 0,
      native_naive_timestamps_utc: true,
    });
    // Two scheduled runs can reach the create at the same time. Re-read, and if
    // this run lost the race, remove its own row rather than leaving the pair
    // that would fail the uniqueness check below on every future run.
    configured = await controls.filter({ name: CONTROL_NAME }, '-created_date', 3);
    if (configured.length > 1 && initialised?.id) {
      const mine = configured.find((row) => row.id === initialised.id);
      const other = configured.find((row) => row.id !== initialised.id);
      if (mine && other) {
        try { await controls.delete(initialised.id); } catch { /* the other run's row stands */ }
        configured = await controls.filter({ name: CONTROL_NAME }, '-created_date', 2);
      }
    }
    if (store.logs && configured.length === 1) {
      try { await store.logs.create({ type: 'note', message: 'after-call bridge initialised' }); } catch { /* logging is never fatal */ }
    }
  }
  if (configured.length !== 1 || configured[0].enabled !== true || !Number.isFinite(configured[0].enrollment_at_ms)) {
    return { enabled: false, processed: 0, reason: configured.length === 1 ? 'not_configured' : 'control_not_unique' };
  }
  const control = configured[0];
  const t = now();
  const scanDeadline = t + MAX_SCAN_MS;
  const requestId = crypto.randomUUID();
  const claim = await controls.updateMany(
    { id: control.id, name: CONTROL_NAME, poll_lock_until_ms: { $lte: t } },
    { $set: { poll_request_id: requestId, poll_lock_until_ms: t + POLL_LOCK_MS } },
  );
  if (!claim?.success || claim.updated !== 1) return { enabled: true, processed: 0, reason: 'poll_lock_busy' };

  try {
    await reconcileCallDispatch(controls, fetchImpl, pat, baseUrl);
    const auth = await request(fetchImpl, `${baseUrl}/auth/token`, pat);
    if (!auth.ok) return { enabled: true, processed: 0, reason: 'runtime_token_rejected' };
    const authData = await auth.json();
    const runtimeToken = typeof authData?.token === 'string' && authData.token ? authData.token : null;
    if (!runtimeToken) return { enabled: true, processed: 0, reason: 'runtime_token_missing' };
    const list = await request(fetchImpl, `${baseUrl}/phone/calls?limit=20&offset=0`, runtimeToken);
    if (!list.ok) return { enabled: true, processed: 0, reason: 'call_list_failed' };
    const calls = (await list.json())?.calls;
    if (!Array.isArray(calls)) return { enabled: true, processed: 0, reason: 'call_list_invalid' };
    let processed = 0;
    let candidates = 0;
    let reconciliations = 0;
    for (const call of calls) {
      if (now() >= scanDeadline) return { enabled: true, processed, reason: 'scan_deadline' };
      if (call?.is_owner !== true || !['completed', 'failed'].includes(call.status) || typeof call.id !== 'string' || !ID.test(call.id)) continue;
      const startedAt = isoMs(call.started_at, control.native_naive_timestamps_utc === true);
      const completedAt = isoMs(call.ended_at || call.completed_at, control.native_naive_timestamps_utc === true);
      if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || startedAt < control.enrollment_at_ms || completedAt < startedAt || completedAt > now()) continue;
      if (candidates >= MAX_CANDIDATES_PER_POLL) break;
      const existing = await receipts.filter({ call_id: call.id }, '-created_date', 1);
      if (existing.length) {
        const prior = existing[0];
        if (reconciliations < 1 && ['dispatch_submitting', 'dispatch_unknown'].includes(prior.status)) {
          reconciliations++;
          if (await findVisibleMessage(fetchImpl, pat, prior.conversation_id, prior.message_id, baseUrl)) {
            await receipts.update(prior.id, { status: 'dispatch_accepted' });
          }
        }
        continue;
      }
      const detailResponse = await request(fetchImpl, `${baseUrl}/phone/calls/${call.id}`, runtimeToken);
      if (!detailResponse.ok) continue;
      const detail = await detailResponse.json();
      const transcript = detail?.transcript;
      if (detail?.call?.id !== call.id || detail.call.is_owner !== true || !['completed', 'failed'].includes(detail.call.status)) continue;
      if (!Array.isArray(transcript) || !hasOwnerSpeech(transcript, startedAt, completedAt, control.native_naive_timestamps_utc === true)) continue;
      candidates++;

      // Renew and fence before creating a durable dispatch receipt.
      const renewed = await controls.updateMany(
        { id: control.id, poll_request_id: requestId, poll_lock_until_ms: { $gt: now() } },
        { $set: { poll_lock_until_ms: now() + POLL_LOCK_MS } },
      );
      if (now() >= scanDeadline) return { enabled: true, processed, reason: 'scan_deadline' };
      if (!renewed?.success || renewed.updated !== 1) return { enabled: true, processed, reason: 'poll_lease_lost' };
      // Receipt first: a crash after this point must not turn into an automatic replay.
      const receipt = await receipts.create({ call_id: call.id, status: 'dispatch_pending', call_completed_at_ms: completedAt, created_at_ms: t });
      if (!receipt?.id) continue;
      let conversationId;
      try {
        const beforeDispatch = await controls.updateMany(
          { id: control.id, poll_request_id: requestId, poll_lock_until_ms: { $gt: now() } },
          { $set: { poll_lock_until_ms: now() + POLL_LOCK_MS } },
        );
        if (!beforeDispatch?.success || beforeDispatch.updated !== 1) {
          await receipts.update(receipt.id, { status: 'dispatch_deferred', error: 'poll_lease_lost' });
          return { enabled: true, processed, reason: 'poll_lease_lost' };
        }
        // Native owner messaging is authenticated with the server-only scoped PAT, as in callMe.
        // The short-lived runtime token is intentionally limited to phone read endpoints.
        const conversation = await request(fetchImpl, `${baseUrl}/user-agent/conversations/v2`, pat, { method: 'POST', body: JSON.stringify({ metadata: { source: 'after_call_bridge', call_id: call.id } }) });
        if (!conversation.ok) {
          await receipts.update(receipt.id, { status: 'dispatch_failed', error: 'conversation_create_failed' });
          continue;
        }
        const conversationData = await conversation.json();
        conversationId = conversationData?.id;
        if (typeof conversationId !== 'string' || !ID.test(conversationId)) throw new Error('invalid_conversation_id');
        const messageId = crypto.randomUUID();
        await receipts.update(receipt.id, { status: 'dispatch_submitting', conversation_id: conversationId, message_id: messageId });
        const prompt = buildTranscriptPrompt({ receiptId: receipt.id, callTail: call.id.slice(-6), callStatus: detail.call.status, hudAppId: hud.hudAppId });
        const delivery = await postWithDeliveryConfirmation(fetchImpl, `${baseUrl}/user-agent/conversations/${conversationId}/messages`, pat, {
          id: messageId, role: 'user', hidden: false, content: prompt,
        }, conversationId, messageId, baseUrl);
        if (delivery.kind === 'unknown') {
          await receipts.update(receipt.id, { status: 'dispatch_unknown', lock_until_ms: now() + UNKNOWN_HOLD_MS });
          continue;
        }
        if (delivery.kind === 'rejected') {
          await receipts.update(receipt.id, { status: 'dispatch_failed', error: 'message_rejected' });
          continue;
        }
        await receipts.update(receipt.id, { status: 'dispatch_accepted' });
        processed++;
      } catch {
        // Never retry an ambiguous message submission automatically.
        await receipts.update(receipt.id, { status: 'dispatch_unknown', lock_until_ms: now() + UNKNOWN_HOLD_MS });
      }
    }
    // Safety net: a dispatched run that parked on a question gets nudged here.
    // Runs after the dispatch work, inside the same poll lock, so a nudge can
    // never race a fresh dispatch.
    let auto_continue = null;
    if (store.logs) {
      try {
        auto_continue = await sweepAutoContinue({ receipt: receipts, logs: store.logs, pat }, baseUrl);
      } catch {
        auto_continue = { error: 'auto_continue_failed' };
      }
    }
    return { enabled: true, processed, reason: 'ok', auto_continue };
  } finally {
    await controls.updateMany({ id: control.id, poll_request_id: requestId }, { $set: { poll_lock_until_ms: 0 } });
  }
}

/** Admin-session-only until Base44 automation caller auth is proven. Never trusts a header. */
export async function handleAfterCallPoll(req, { createClientFromRequest, secrets, fetchImpl = fetch }) {
  if (req.method !== 'POST') return responseJson({ ok: false, error: 'method_not_allowed' }, 405);
  let base44, user;
  try { base44 = createClientFromRequest(req); user = await base44.auth.me(); } catch { return responseJson({ ok: false, error: 'unauthorized' }, 401); }
  if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  if (user.role !== 'admin') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const pat = secrets.get('JARVIS_NATIVE_TOKEN');
  const result = await runAfterCallPoll({ store: { control: base44.asServiceRole.entities.CallControl, receipt: base44.asServiceRole.entities.CallReceipt, profile: base44.asServiceRole.entities.Profile }, fetchImpl, pat });
  return responseJson(result);
}
