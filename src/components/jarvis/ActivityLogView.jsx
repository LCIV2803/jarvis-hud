import React from 'react';
import { HUD, fmtClock } from '@/lib/jarvis';

const dotColor = {
  task_done: HUD.green,
  task_started: HUD.accent,
  note: HUD.faint,
  update: HUD.amber
};

export default function ActivityLogView({ logs }) {
  return (
    <div>
      <div className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 pb-2">
        JARVIS ACTIVITY
      </div>
      <div className="h-px bg-hud-border mb-3" />
      <div className="h-[320px] overflow-y-auto flex flex-col gap-[14px]">
        {logs.map((log, i) => (
          <div key={log.id} className="hud-log-row flex items-center gap-3 min-w-0">
            <span className="font-mono text-[15px] text-hud-faint tabular-nums shrink-0">
              {fmtClock(new Date(log.created_date))}
            </span>
            <span
              className={`${i === 0 ? 'hud-act-dot' : 'hud-log-dot'} w-1.5 h-1.5 rounded-full shrink-0`}
              style={{ background: dotColor[log.type] || HUD.faint }}
            />
            <span className="font-body text-[17px] text-hud-text2 truncate">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
