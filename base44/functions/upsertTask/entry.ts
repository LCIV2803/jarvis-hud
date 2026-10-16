import { method405, readBody, taskKey, normalizeDate, validateEnum, findMatches, dedupeMatches, authorizeWrite, brisbaneTodayISO } from '../../shared/hud.ts';

function txt(res, status) {
  return new Response(res, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const TASK_STATUS = ['todo', 'doing', 'done'];
const PRIORITY = ['low', 'normal', 'high'];

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

    const title = typeof body?.title === 'string' ? body.title.trim() : null;
    if (!title) {
      return Response.json({ error: 'title is required' }, { status: 400 });
    }
    if (Object.hasOwn(body, 'execution_owner') && !['jarvis', 'owner'].includes(body.execution_owner)) {
      return Response.json({ error: 'invalid execution_owner' }, { status: 400 });
    }
    if (Object.hasOwn(body, 'progress_note') && (typeof body.progress_note !== 'string' || body.progress_note.length > 1000)) {
      return Response.json({ error: 'progress_note must be text up to 1000 characters' }, { status: 400 });
    }
    // Only the server may timestamp a progress report. Never trust browser/model time.
    if (Object.hasOwn(body, 'progress_updated_at')) {
      return Response.json({ error: 'progress_updated_at is server-managed' }, { status: 400 });
    }

    let status = 'todo';
    if (typeof body?.status === 'string') {
      const v = validateEnum(body.status, TASK_STATUS, 'status');
      if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
      status = body.status;
    }
    if (typeof body?.priority === 'string') {
      const v = validateEnum(body.priority, PRIORITY, 'priority');
      if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
    }
    let dueISO;
    if (typeof body?.due_date === 'string') {
      const d = normalizeDate(body.due_date);
      if (!d.ok) return Response.json({ error: d.error }, { status: 400 });
      dueISO = d.iso;
    }

    const Task = base44.asServiceRole.entities.Task;
    const key = taskKey(title);
    const matches = await findMatches(Task, (r) => taskKey(r.title), key);
    const existing = matches[0];
    // Partial notes/progress updates must not reopen a task or clear done_at.
    const effectiveStatus = typeof body.status === 'string' ? body.status : (existing?.status || 'todo');
    const transitioned = existing ? effectiveStatus !== existing.status : true;
    const progress = {};
    if (typeof body.execution_owner === 'string') progress.execution_owner = body.execution_owner;
    if (typeof body.progress_note === 'string') progress.progress_note = body.progress_note;
    if (transitioned || Object.hasOwn(body, 'progress_note') || Object.hasOwn(body, 'execution_owner')) {
      progress.progress_updated_at = new Date().toISOString();
    }

    const brisToday = brisbaneTodayISO();
    const memToday = new Date().toISOString().slice(0, 10);

    let created = false;
    if (matches.length > 0) {
      const update = { ...progress };
      if (typeof body?.status === 'string') update.status = body.status;
      if (typeof body?.priority === 'string') update.priority = body.priority;
      if (dueISO !== undefined) update.due_date = dueISO;
      if (typeof body?.notes === 'string') update.notes = body.notes;
      // done_at: set on a real transition to done, clear on reopening.
      if (effectiveStatus === 'done') {
        if (existing.status !== 'done' || !existing.done_at) update.done_at = brisToday;
      } else {
        if (existing.done_at) update.done_at = null;
      }
      await Task.update(existing.id, update);
      await dedupeMatches(Task, matches);
    } else {
      const priority = typeof body?.priority === 'string' ? body.priority : 'normal';
      const notes = typeof body?.notes === 'string' ? body.notes : undefined;
      const doneAt = effectiveStatus === 'done' ? brisToday : undefined;
      await Task.create({ title, status: effectiveStatus, priority, due_date: dueISO, notes, done_at: doneAt, ...progress });
      created = true;
      const rematches = await findMatches(Task, (r) => taskKey(r.title), key);
      await dedupeMatches(Task, rematches);
    }

    const logType = transitioned && effectiveStatus === 'doing' ? 'task_started' : transitioned && effectiveStatus === 'done' ? 'task_done' : 'note';
    const message =
      logType === 'task_started' ? `Started: ${title}` :
      logType === 'task_done' ? `Completed: ${title}` :
      `Updated: ${title}`;
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        message, type: logType, task_title: title
      });
    } catch (e) {}
    if (effectiveStatus === 'done' && transitioned) {
      try {
        await base44.asServiceRole.entities.Memory.create({
          text: `Finished task: ${title}`, kind: 'outcome', created_at: memToday
        });
      } catch (e) {}
    }

    return txt(created ? `task created: ${title}` : `task updated: ${title}`, 200);
  } catch (error) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
}
