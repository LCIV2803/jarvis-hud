import { method405, readBody, validateEnum, todayISO, authorizeWrite } from '../../shared/hud.ts';

function txt(res, status) {
  return new Response(res, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const SESSION_STATUS = ['open', 'done'];

export default async function(req) {
  try {
    const m405 = method405(req);
    if (m405) return m405;

    const auth = await authorizeWrite(req);
    if (!auth.ok) return txt("unauthorized", 401);

    const parsed = await readBody(req);
    if (!parsed.ok) return txt(parsed.error, parsed.status);
    const body = parsed.body;

    const title = typeof body?.title === 'string' ? body.title.trim() : null;
    if (!title) {
      return txt("title is required", 400);
    }
    const job = typeof body?.job === 'string' ? body.job : '';
    let status = 'open';
    if (typeof body?.status === 'string') {
      const v = validateEnum(body.status, SESSION_STATUS, 'status');
      if (!v.ok) return txt(v.error, 400);
      status = body.status;
    }
    const outcome = typeof body?.outcome === 'string' ? body.outcome : undefined;
    const conversationRef = typeof body?.conversation_ref === 'string' ? body.conversation_ref : undefined;

    const base44 = auth.base44;
    const SessionLog = base44.asServiceRole.entities.SessionLog;
    const existing = await SessionLog.filter({ title });

    if (existing.length === 0) {
      if (status === 'done') {
        return Response.json({ error: `no open session called ${title}` }, { status: 404 });
      }
      await SessionLog.create({
        title,
        job,
        status,
        conversation_ref: conversationRef,
        started_at: todayISO()
      });
      return txt(`session logged: ${title} (${status})`, 200);
    }

    const session = existing[0];
    if (status === 'done') {
      const update = { status: 'done', ended_at: todayISO() };
      if (outcome !== undefined) update.outcome = outcome;
      if (job) update.job = job;
      if (conversationRef !== undefined) update.conversation_ref = conversationRef;
      await SessionLog.update(session.id, update);
      return txt(`session logged: ${title} (done)`, 200);
    }

    const update = {};
    if (job) update.job = job;
    if (conversationRef !== undefined) update.conversation_ref = conversationRef;
    if (Object.keys(update).length > 0) {
      await SessionLog.update(session.id, update);
    }
    return txt(`session logged: ${title} (open)`, 200);
  } catch (error) {
    return txt("bad request", 400);
  }
}
