import { method405, readBody, validateEnum, todayISO, authorizeWrite } from '../../shared/hud.ts';

function txt(res, status) {
  return new Response(res, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const VALID_KINDS = ['fact', 'decision', 'event', 'question', 'outcome'];

export default async function(req) {
  try {
    const m405 = method405(req);
    if (m405) return m405;

    const auth = await authorizeWrite(req);
    if (!auth.ok) return txt("unauthorized", 401);
    const base44 = auth.base44;

    const parsed = await readBody(req);
    if (!parsed.ok) return txt(parsed.error, parsed.status);
    const body = parsed.body;

    const text = typeof body?.text === 'string' ? body.text : null;
    if (!text || !text.trim()) {
      return txt("text is required", 400);
    }
    let kind = 'event';
    if (typeof body?.kind === 'string') {
      const v = validateEnum(body.kind, VALID_KINDS, 'kind');
      if (!v.ok) return txt(v.error, 400);
      kind = body.kind;
    }
    const subject = typeof body?.subject === 'string' ? body.subject : undefined;
    const source = typeof body?.source === 'string' ? body.source : undefined;
    const today = todayISO();

    const Memory = base44.asServiceRole.entities.Memory;
    const existing = await Memory.filter({ text });
    const match = existing.find((m) => m.created_at === today);

    const data = { text, kind, subject, source, created_at: today };
    if (match) {
      await Memory.update(match.id, data);
    } else {
      await Memory.create(data);
    }

    return txt(`remembered: ${text}`, 200);
  } catch (error) {
    return txt("bad request", 400);
  }
}
