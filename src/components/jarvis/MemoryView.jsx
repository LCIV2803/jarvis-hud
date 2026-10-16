import React, { useEffect, useState } from 'react';
import { HUD, fmtClock } from '@/lib/jarvis';

const kindColor = {
  fact: HUD.faint,
  decision: HUD.amber,
  outcome: HUD.green,
  question: HUD.accent,
  event: HUD.faint
};

export default function MemoryView({ memories }) {
  const [, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  return (
    <div>
      <div className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 pb-2">
        MEMORY
      </div>
      <div className="h-px bg-hud-border mb-3" />
      <div className="h-[320px] overflow-y-auto flex flex-col gap-[14px]">
        {(memories || []).map((m) => (
          <div key={m.id} className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-[15px] text-hud-faint tabular-nums shrink-0">
              {fmtClock(m.created_date)}
            </span>
            <span
              className="font-mono text-[11px] uppercase tracking-[0.1em] shrink-0"
              style={{ color: kindColor[m.kind] || HUD.faint }}
            >
              {m.kind}
            </span>
            <span className="font-body text-[17px] text-hud-text2 truncate">
              {typeof m.text === 'string' && m.text.trim() ? m.text : 'unknown'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
