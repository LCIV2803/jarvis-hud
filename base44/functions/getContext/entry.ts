import { method405, authorizeWrite } from '../../shared/hud.ts';

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

    // Backwards-compatible optional leads-only paginated view for native review.
    let body = {};
    try { const raw = await req.text(); if (raw) body = JSON.parse(raw); } catch {}
    if (body && body.section === 'leads') {
      let limit = 100;
      let offset = 0;
      if (body.limit !== undefined) {
        if (!Number.isInteger(body.limit) || body.limit < 1) return Response.json({ error: 'limit must be a positive integer' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        limit = Math.min(body.limit, 500);
      }
      if (body.offset !== undefined) {
        if (!Number.isInteger(body.offset) || body.offset < 0) return Response.json({ error: 'offset must be a non-negative integer' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        offset = body.offset;
      }
      const all = await base44.asServiceRole.entities.Lead.list();
      all.sort((a, b) => {
        const d = new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
        if (d !== 0) return d;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
      const total_count = all.length;
      const page = all.slice(offset, offset + limit);
      const has_more = offset + page.length < total_count;
      const leads = page.map((l) => ({
        id: l.id, business_name: l.business_name, trade: l.trade, suburb: l.suburb,
        phone: l.phone, website: l.website, google_rating: l.google_rating,
        review_count: l.review_count, source_url: l.source_url, status: l.status, notes: l.notes
      }));
      return Response.json({ section: 'leads', total_count, offset, limit, has_more, leads }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    const lines = [];

    // 1. PROFILE
    const profiles = await base44.asServiceRole.entities.Profile.list();
    lines.push("PROFILE");
    const profile = profiles[0];
    if (profile) {
      const fields = [
        ['business_name', profile.business_name],
        ['owner_name', profile.owner_name],
        ['niche', profile.niche],
        ['service', profile.service],
        ['suburbs', profile.suburbs],
        ['price_low', profile.price_low],
        ['price_high', profile.price_high],
        ['tools', profile.tools],
        ['call_hours', profile.call_hours],
        ['timezone', profile.timezone],
        ['checkin_time', profile.checkin_time],
        ['goal_90_day', profile.goal_90_day],
        ['updated_at', profile.updated_at]
      ];
      for (const [label, value] of fields) {
        if (value !== undefined && value !== null && value !== '') {
          lines.push(`${label}: ${value}`);
        }
      }
    } else {
      lines.push("(no profile)");
    }
    lines.push("");

    // 2. MEMORY (20 newest)
    lines.push("MEMORY");
    const memories = await base44.asServiceRole.entities.Memory.list('-created_date', 20);
    if (memories.length === 0) {
      lines.push("(none)");
    } else {
      for (const m of memories) {
        lines.push(m.text || '');
      }
    }
    lines.push("");

    // 3. OPEN SESSIONS
    lines.push("OPEN SESSIONS");
    const sessions = await base44.asServiceRole.entities.SessionLog.filter({ status: 'open' });
    if (sessions.length === 0) {
      lines.push("(none)");
    } else {
      for (const s of sessions) {
        lines.push(`${s.title || ''} — ${s.job || ''}`);
      }
    }
    lines.push("");

    // 4. OPEN TASKS
    lines.push("OPEN TASKS");
    const tasks = await base44.asServiceRole.entities.Task.list();
    const openTasks = tasks.filter((t) => t.status !== 'done');
    if (openTasks.length === 0) {
      lines.push("(none)");
    } else {
      for (const t of openTasks) {
        lines.push(`${t.title || ''} | status=${t.status || ''} | priority=${t.priority || ''} | due=${t.due_date || 'none'}`);
      }
    }
    lines.push("");

    // 5. LEADS
    lines.push("LEADS");
    const leads = await base44.asServiceRole.entities.Lead.list();
    const counts = {};
    for (const l of leads) {
      const st = l.status || 'new';
      counts[st] = (counts[st] || 0) + 1;
    }
    const statusOrder = ['new', 'demo_built', 'contacted', 'replied', 'won', 'lost'];
    let printedAny = false;
    for (const st of statusOrder) {
      if (counts[st]) {
        lines.push(`${st}: ${counts[st]}`);
        printedAny = true;
      }
    }
    if (!printedAny) lines.push("(none)");
    lines.push("");
    const newestLeads = [...leads]
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);
    for (const l of newestLeads) {
      lines.push(`${l.business_name || ''} — ${l.trade || ''} — ${l.suburb || ''} — ${l.status || ''}`);
    }

    return txt(lines.join("\n"), 200);
  } catch (error) {
    return txt("error", 400);
  }
}
