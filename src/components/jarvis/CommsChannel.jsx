import React, { useEffect, useState } from 'react';
import { HUD, relTime, formatActivityLog } from '@/lib/jarvis';

const TYPE_LABEL = {
  task_done: 'TASK DONE',
  task_started: 'TASK STARTED',
  note: 'NOTE',
  update: 'UPDATE'
};

export default function CommsChannel({ logs }) {
  const [, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const now = Date.now();
  const rows = (logs || []).map((log) => ({ log, formatted: formatActivityLog(log) })).filter(({ formatted }) => !formatted.hidden).slice(0, 6);
  return (
    <div>
      <div className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 pb-2">
        LIVE CHANNEL · COMMS
      </div>
      <div className="h-px bg-hud-border mb-3" />
      <div className="flex flex-col gap-3">
        {rows.map(({ log, formatted }) => (
          <div key={log.id} className="flex gap-3 min-w-0">
            <span className="w-[3px] self-stretch shrink-0" style={{ background: HUD.amber }} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-hud-faint">
                {TYPE_LABEL[log.type] || 'ACTIVITY'} · {relTime(log.created_date, now)}
              </div>
              <div
                className="font-body text-[15px] text-hud-text2 leading-snug"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {formatted.message}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="font-mono text-[12px] text-hud-faint">no comms yet</div>
        )}
      </div>
    </div>
  );
}
