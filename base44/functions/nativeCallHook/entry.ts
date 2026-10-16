// Instant Base44-route pickup for completed owner calls.
//
// Triggered (when registered) by a Base44 agent webhook on message.completed.
// The completed message text of the phone conversation contains the platform's
// '[Outbound call] ended' notification when a native call finishes, so that
// marker is the event filter. The handler verifies the request the way the
// platform documents for public webhook functions: the existing HUD_KEY shared
// secret, supplied by the webhook registration and checked on every call, then
// runs exactly the same poll the after-call bridge workflow runs
// (runAfterCallPoll, via waitUntil, with the same lock and reconcile semantics
// and no double-dispatch). No new secret is introduced.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets, waitUntil } from 'base44:runtime';
import { runAfterCallPoll } from '../../shared/after-call-bridge.ts';

function text(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' },
  });
}

export default async function (req) {
  if (req.method !== 'POST') return text('method_not_allowed', 405);

  // Verify the caller the way the platform documents for public webhook
  // functions: a shared secret, checked on every call. This reuses the existing
  // HUD_KEY, accepted as the ?key= query parameter the webhook registration
  // carries or as the x-hud-key header; no other credential is accepted.
  let raw;
  try { raw = await req.text(); } catch { return text('bad_request', 400); }
  if (new TextEncoder().encode(raw).length > 100_000) return text('body_too_large', 413);

  const url = new URL(req.url);
  const expected = secrets.get('HUD_KEY');
  const provided = url.searchParams.get('key') || req.headers.get('x-hud-key');
  if (!expected || !provided || provided !== expected) return text('unauthorized', 401);

  try { JSON.parse(raw); } catch { return text('invalid_json', 400); }

  // Acknowledge quickly. Non-event or non-marker deliveries are 200 but inert.
  // The scan runs over the raw body so unknown event field shapes still match;
  // the phrase is the platform's own call-end notification text.
  if (!raw.includes('[Outbound call] ended')) return text('ok: no call-end marker', 200);

  let base44;
  try { base44 = createClientFromRequest(req); } catch { return text('sdk_unavailable', 503); }

  const pat = secrets.get('JARVIS_NATIVE_TOKEN');
  if (!pat) return text('native_token_not_configured', 503);

  // Same poll, same locks, same receipt store as the scheduled bridge. The
  // bridge's own poll lock makes this safe to fire alongside the schedule and
  // prevents duplicate dispatches for the same call ID.
  waitUntil((async () => {
    try {
      const result = await runAfterCallPoll({
        store: { control: base44.asServiceRole.entities.CallControl, receipt: base44.asServiceRole.entities.CallReceipt, profile: base44.asServiceRole.entities.Profile },
        pat,
      });
      if (result.processed || !['ok', 'poll_lock_busy', 'not_configured'].includes(result.reason)) {
        await base44.asServiceRole.entities.ActivityLog.create({
          type: 'note',
          task_title: 'Jarvis after-call bridge',
          message: 'After-call bridge (nativeCallHook): ' + JSON.stringify(result),
        }).catch(() => {});
      }
    } catch {
      await base44.asServiceRole.entities.ActivityLog.create({
        type: 'note',
        task_title: 'Jarvis after-call bridge',
        message: 'After-call bridge (nativeCallHook) failed; check receipt status before retrying.',
      }).catch(() => {});
    }
  })());

  return text('accepted: poll queued', 202);
}
