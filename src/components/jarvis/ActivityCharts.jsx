import React, { useMemo } from 'react';
import { HUD, lastBrisbaneDays, brisbaneDayKey, parseBase44Date } from '@/lib/jarvis';

export default function ActivityCharts({ logs, tasks }) {
  // Sparkline: ActivityLog record counts per hour over the past 24 hours.
  const hourly = useMemo(() => {
    const now = Date.now();
    const buckets = new Array(24).fill(0);
    for (const l of logs || []) {
      if (typeof l.message === 'string' && l.message.startsWith('diag:')) continue;
      const parsed = parseBase44Date(l.created_date);
      const t = parsed?.kind === 'instant' ? parsed.epochMs : NaN;
      const diff = now - t;
      if (diff >= 0 && diff < 24 * 3600 * 1000) {
        const idx = 23 - Math.floor(diff / 3600000);
        if (idx >= 0 && idx < 24) buckets[idx]++;
      }
    }
    return buckets;
  }, [logs]);

  const maxH = Math.max(1, ...hourly);
  const sparkPath = useMemo(() => {
    const w = 200, h = 40;
    return hourly.map((c, i) => {
      const x = (i / 23) * w;
      const y = h - (c / maxH) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }, [hourly, maxH]);

  // Bar chart: tasks done per day for the last 14 Brisbane days (using done_at).
  const days = useMemo(() => lastBrisbaneDays(14), []);
  const counts = useMemo(() => {
    const map = Object.fromEntries(days.map((d) => [d, 0]));
    for (const t of tasks || []) {
      if (t.status === 'done' && t.done_at) {
        const k = brisbaneDayKey(t.done_at);
        if (map[k] !== undefined) map[k]++;
      }
    }
    return days.map((d) => map[d]);
  }, [days, tasks]);
  const maxC = Math.max(1, ...counts);

  return (
    <div>
      <div className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 pb-2">
        ACTIVITY · LAST 24H
      </div>
      <div className="h-px bg-hud-border mb-3" />
      <svg viewBox="0 0 200 40" className="w-full" style={{ height: 40 }} preserveAspectRatio="none">
        <path d={sparkPath} fill="none" stroke={HUD.accent} strokeWidth="1" opacity="0.7" />
      </svg>

      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-hud-faint mb-2">
          TASKS DONE · 14D
        </div>
        <div className="flex items-end gap-1" style={{ height: 48 }}>
          {counts.map((c, i) => (
            <div key={i} className="flex-1 flex items-end" style={{ height: 48 }}>
              <div
                style={{
                  width: '100%',
                  height: `${(c / maxC) * 100}%`,
                  minHeight: c > 0 ? 2 : 1,
                  background: c >= 3 ? HUD.amber : HUD.accent,
                  opacity: c > 0 ? 0.9 : 0.25
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
