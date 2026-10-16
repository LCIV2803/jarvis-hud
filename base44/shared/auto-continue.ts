/* Auto-continue safety net.
 *
 * A wrap-up run can stop and ask the owner "shall I continue?" — but these runs
 * are unattended, so nobody answers and the job sits idle. This helper checks
 * the end of a dispatched conversation and, only in the narrow case where the
 * assistant parked on a question, posts the single word "continue".
 *
 * Hard rules, enforced here rather than left to a prompt:
 * - the only content ever posted is the word continue
 * - never post when the last message came from the owner
 * - never post when the assistant reported a real owner blocker
 * - a direct continue/confirm prompt always wins over blocker wording, because a
 *   run often logs NEEDS OWNER and still parks on a continue prompt
 * - at most MAX_CONTINUES posts per receipt
 * - one post per pass, and a re-check before each post
 */

// The Superagent conversation base URL is supplied at call time by the poller
// (it is derived at runtime from the Profile's superagent_id), never imported.

export const MAX_CONTINUES = 3;
export const AUTO_CONTINUE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const CONTINUE_TEXT = 'continue';
const MESSAGES_TIMEOUT_MS = 8_000;

const CONVERSATION_ID = /^[a-f0-9]{24}$/;

// The assistant parked on a question to the owner.
const ASKS_TO_CONTINUE = [
  /write\s+["'“”]?continue/i,
  /(?:type|say|reply|respond|answer)\s+["'“”]?continue/i,
  /continue\s+(?:when|to\s+(?:keep|proceed|go))/i,
  /let\s+me\s+know\s+(?:if|when|whether)\s+(?:you\s+want|to)\s+me\s+to\s+continue/i,
  /(?:want|like|need)\s+me\s+to\s+continue/i,
  /should\s+i\s+(?:continue|keep\s+going|proceed)/i,
  /shall\s+i\s+(?:continue|keep\s+going|proceed)/i,
  /(?:on\s+the\s+right\s+track|right\s+track)\?/i,
];
const ASKS_TO_CONFIRM = [
  /once\s+you\s+confirm/i,
  /(?:after|when)\s+you\s+(?:confirm|approve)/i,
  /confirm\s+and\s+(?:i(?:'|’)?ll|i\s+will|we(?:'|’)?ll|we\s+will)\s+(?:proceed|continue)/i,
  /(?:please|kindly)\s+confirm/i,
  /awaiting\s+your\s+(?:confirmation|approval|go[-\s]?ahead)/i,
  /waiting\s+for\s+your\s+(?:confirmation|approval|go[-\s]?ahead)/i,
  /(?:your|the)\s+confirm(?:ation)?\s+to\s+(?:proceed|continue)/i,
  /let\s+me\s+know\s+if\s+you\s+(?:approve|want\s+me\s+to\s+proceed)/i,
];
const PARTIAL = [
  /partially\s+completed/i,
  /part(?:ly|ial)?\s+(?:done|complete|finished)/i,
  /(?:still|yet)\s+(?:to\s+be\s+)?(?:finish|complete|do)/i,
  /remain(?:s|ing)\s+to\s+be\s+(?:done|completed)/i,
  /not\s+yet\s+(?:finished|complete|done)/i,
  /unfinished/i,
  /stopped\s+(?:partway|before\s+finishing)/i,
  /need\s+to\s+(?:continue|keep\s+going)/i,
];
// Reasons to leave the run alone: the owner must act first.
const OWNER_BLOCKER = [
  /needs?\s+owner/i,
  /owner\s+(?:action|input|decision|approval)\s+(?:is\s+)?(?:required|needed)/i,
  /(?:requires?|needs?)\s+your\s+(?:action|input|approval|decision|confirmation)/i,
  /only\s+you\s+can/i,
  /(?:blocked|can(?:not|'|’)?t\s+(?:proceed|continue)\s+until)\s+.{0,80}(?:key|access|credential|password|permission|account|login|payment|card)/i,
  /unable\s+to\s+(?:proceed|continue)\s+without/i,
  /cannot\s+(?:proceed|continue)\s+without/i,
];

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Why the run parked.
 * A prompt the owner can act on outranks every other signal: a run that asks to
 * "write continue" or ends on a confirm prompt is parked, even when it also
 * describes a blocker in the same message (blockers are usually just reported in
 * the summary). Only without such a prompt does an owner blocker win.
 */
export function classifyPark(text) {
  if (typeof text !== 'string' || !text.trim()) return 'none';
  if (matchesAny(text, ASKS_TO_CONTINUE)) return 'asks_continue';
  if (matchesAny(text, ASKS_TO_CONFIRM)) return 'asks_confirm';
  if (matchesAny(text, OWNER_BLOCKER)) return 'owner';
  if (matchesAny(text, PARTIAL)) return 'partial';
  return 'none';
}

function messageContent(message) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => (typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : ''))).join(' ');
  }
  if (typeof message?.text === 'string') return message.text;
  return '';
}

export function isOwnerMessage(message) {
  return message?.role === 'user' || message?.is_owner === true;
}

/** Read the conversation tail. Read-only; returns null on any failure. */
export async function fetchRecentMessages(fetchImpl, token, conversationId, baseUrl) {
  if (typeof conversationId !== 'string' || !CONVERSATION_ID.test(conversationId)) return null;
  try {
    const response = await fetchImpl(`${baseUrl}/user-agent/conversations/${conversationId}/messages?limit=50`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(MESSAGES_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const messages = Array.isArray(data) ? data : data?.messages;
    if (!Array.isArray(messages) || !messages.length) return null;
    // The route may return newest first; order defensively.
    return messages
      .filter((message) => message && typeof message === 'object')
      .map((message, index) => ({
        index,
        role: message.role,
        isOwner: isOwnerMessage(message),
        content: messageContent(message),
        at: message.created_at || message.created_date || null,
      }))
      .sort((a, b) => {
        const at = a.at ? Date.parse(a.at) : NaN;
        const bt = b.at ? Date.parse(b.at) : NaN;
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
        return a.index - b.index;
      });
  } catch {
    return null;
  }
}

/**
 * Inspect one receipt and, if the run parked on a question, post "continue".
 * Returns a report describing what it did or would have done; `dryRun` never posts.
 */
export async function autoContinueReceipt({ receipt, receipts, logs, fetchImpl = fetch, pat, dryRun = false, now = Date.now, baseUrl }) {
  const report = { call_id: receipt?.call_id || null, conversation_id: receipt?.conversation_id || null, action: 'skipped', reason: null, continue_count: null, last_message: null };

  if (!receipt?.id || typeof receipt.conversation_id !== 'string' || !CONVERSATION_ID.test(receipt.conversation_id)) {
    report.reason = 'no_conversation';
    return report;
  }
  if (!pat) {
    report.reason = 'native_token_not_configured';
    return report;
  }

  const messages = await fetchRecentMessages(fetchImpl, pat, receipt.conversation_id, baseUrl);
  if (!messages) {
    report.reason = 'conversation_unreadable';
    return report;
  }
  const last = messages[messages.length - 1];
  report.last_message = { role: last.role, excerpt: String(last.content || '').slice(0, 300) };

  if (last.isOwner) {
    report.reason = 'last_message_from_owner';
    return report;
  }

  const classification = classifyPark(last.content);
  report.classification = classification;
  if (classification === 'none') {
    report.reason = 'no_parking_question';
    return report;
  }
  if (classification === 'owner') {
    report.reason = 'owner_blocker';
    return report;
  }

  const count = Number.isFinite(receipt.continue_count) ? receipt.continue_count : 0;
  report.continue_count = count;
  if (count >= MAX_CONTINUES) {
    report.reason = 'max_continues_reached';
    return report;
  }
  if (dryRun) {
    report.action = 'would_continue';
    return report;
  }

  // Re-read just before posting so a completed run is never interrupted.
  const confirm = await fetchRecentMessages(fetchImpl, pat, receipt.conversation_id, baseUrl);
  const confirmLast = confirm && confirm.length ? confirm[confirm.length - 1] : null;
  if (!confirmLast || confirmLast.isOwner) {
    report.reason = confirmLast ? 'last_message_from_owner' : 'conversation_unreadable';
    return report;
  }
  const confirmClass = classifyPark(confirmLast.content);
  if (confirmClass === 'none') {
    report.reason = 'no_parking_question';
    return report;
  }

  const messageId = crypto.randomUUID();
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/user-agent/conversations/${receipt.conversation_id}/messages`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: messageId, role: 'user', hidden: false, content: CONTINUE_TEXT }),
    });
  } catch {
    report.reason = 'post_failed';
    return report;
  }
  if (!response.ok) {
    report.reason = 'post_rejected_' + response.status;
    return report;
  }

  const nextCount = count + 1;
  // The message is already sent, so the counter is written unconditionally on
  // the receipt id: a conditional update could silently lose it.
  await receipts.update(receipt.id, { continue_count: nextCount });
  try {
    await logs.create({
      type: 'note',
      task_title: 'Jarvis auto-continue',
      message: 'auto-continued ' + receipt.conversation_id + ' (continue ' + nextCount + ' of ' + MAX_CONTINUES + ', ' + classification + ')',
    });
  } catch { /* the continue is already sent; the log is best effort */ }

  report.action = 'continued';
  report.continue_count = nextCount;
  return report;
}

function receiptAgeMs(receipt, now) {
  const createdMs = Number(receipt?.created_at_ms);
  if (Number.isFinite(createdMs) && createdMs > 0) return now - createdMs;
  const createdDate = receipt?.created_date ? Date.parse(receipt.created_date) : NaN;
  return Number.isFinite(createdDate) ? now - createdDate : Infinity;
}

/**
 * Sweep recent dispatched receipts and nudge any that parked on a question.
 * Only receipts in dispatch_accepted within the last two hours are considered,
 * and at most one nudge is posted per pass.
 */
export async function runAutoContinueSweep({ receipts, logs, fetchImpl = fetch, pat, dryRun = false, now = Date.now, baseUrl }) {
  const result = { considered: 0, reports: [], continued: 0, dry_run: dryRun === true };
  if (!receipts || typeof receipts.filter !== 'function') {
    result.reason = 'no_receipt_store';
    return result;
  }
  const page = await receipts.filter({ status: 'dispatch_accepted' }, { sort: '-created_date', limit: 50 });
  const rows = Array.isArray(page) ? page : (Array.isArray(page?.items) ? page.items : []);
  const t = now();

  let posted = 0;
  for (const receipt of rows) {
    if (receiptAgeMs(receipt, t) > AUTO_CONTINUE_MAX_AGE_MS) continue;
    result.considered++;
    // At most one post per pass, but keep reporting on the rest.
    const report = await autoContinueReceipt({ receipt, receipts, logs, fetchImpl, pat, dryRun: dryRun || posted >= 1, now, baseUrl });
    result.reports.push(report);
    if (report.action === 'continued') {
      posted++;
      result.continued++;
    }
  }
  return result;
}
