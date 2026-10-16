import React, { useState, useEffect } from 'react';
import { fmtClock } from '@/lib/jarvis';
import HeaderActions from '@/components/jarvis/HeaderActions';

export default function HeaderBar({ goal, voiceProvider, needsOwner }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const objective = goal && String(goal).trim() ? String(goal).trim() : 'set your 90-day goal';

  return (
    <div className="h-16 flex items-center gap-6 border-b border-hud-border">
      <span className="hud-pulse w-2 h-2 rounded-full bg-hud-accent" />
      <span className="font-body text-[18px] tracking-[0.34em] text-hud-text">JARVIS</span>
      <span className="w-px h-4 bg-hud-border" />
      <span className="font-mono text-[17px] text-hud-text2 tabular-nums">{fmtClock(now)}</span>
      <span className="hidden sm:block w-px h-4 bg-hud-border" />
      <span className="hidden sm:block font-body text-[11px] tracking-[0.26em] text-hud-faint">
        JUST A RATHER VERY INTELLIGENT SYSTEM
      </span>
      <span
        className="hidden md:inline-flex font-mono text-[10px] tracking-[0.18em] uppercase text-hud-amber ml-2 px-2 py-1"
        style={{ border: '1px solid rgba(232,180,90,0.5)' }}
      >
        OBJECTIVE · {objective}
      </span>
      {needsOwner && (
        <span
          className="hidden md:inline-flex font-mono text-[10px] tracking-[0.14em] text-hud-amber ml-2 px-2 py-1 max-w-[380px] truncate"
          style={{ border: '1px solid rgba(232,180,90,0.5)' }}
          title={needsOwner}
        >
          {needsOwner}
        </span>
      )}
      <HeaderActions voiceProvider={voiceProvider} />
    </div>
  );
}
