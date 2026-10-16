import { createClientFromRequest } from 'npm:@base44/sdk';

const CONTROL_NAME = 'owner_native_call';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default async function(req: Request) {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  let base44: any, user: any, body: any;
  try {
    base44 = createClientFromRequest(req);
    user = await base44.auth.me();
  } catch { return json({ ok: false, error: 'unauthorized' }, 401); }
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
  if (user.role !== 'admin') return json({ ok: false, error: 'forbidden' }, 403);
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  if (!UUID.test(body?.request_id || '')) return json({ ok: false, error: 'invalid_request_id' }, 400);
  const rows = await base44.asServiceRole.entities.CallControl.filter({ name: CONTROL_NAME, request_id: body.request_id }, '-updated_date', 2);
  if (rows.length !== 1) return json({ ok: false, error: 'request_not_found' }, 404);
  const row = rows[0];
  return json({ ok: true, request_id: body.request_id, state: row.dispatch_state || 'unknown', ...(typeof row.conversation_id === 'string' && row.conversation_id ? { conversation_id: row.conversation_id } : {}) });
}
