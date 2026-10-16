import { method405, readBody, authorizeWrite } from '../../shared/hud.ts';

function txt(res, status) {
  return new Response(res, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export default async function(req) {
  try {
    const m405 = method405(req);
    if (m405) return m405;

    const auth = await authorizeWrite(req);
    if (!auth.ok) return txt("unauthorized", 401);
    const base44 = auth.base44;

    const parsed = await readBody(req);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.body;

    const message = typeof body?.message === 'string' ? body.message : null;
    const type = typeof body?.type === 'string' ? body.type : null;
    const taskTitle = typeof body?.task_title === 'string' ? body.task_title : undefined;

    if (!message || !type) {
      return Response.json({ error: 'message and type are required strings' }, { status: 400 });
    }

    const record = await base44.asServiceRole.entities.ActivityLog.create({
      message,
      type,
      task_title: taskTitle
    });

    return Response.json({ ok: true, id: record.id });
  } catch (error) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
}
