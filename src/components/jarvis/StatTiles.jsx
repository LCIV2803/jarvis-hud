import React from 'react';
import { useCountUp } from '@/hooks/useCountUp';

function Tile({ value, label }) {
  const display = useCountUp(value);
  return (
    <div className="flex flex-col items-center px-10">
      <span className="font-mono text-[38px] text-hud-text tabular-nums leading-none">{display}</span>
      <span className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 mt-2">{label}</span>
    </div>
  );
}

export default function StatTiles({ openCount, doneToday, doneWeek }) {
  return (
    <div className="flex items-stretch justify-center">
      <Tile value={openCount} label="Open Tasks" />
      <div className="w-px bg-hud-border" />
      <Tile value={doneToday} label="Done Today" />
      <div className="w-px bg-hud-border" />
      <Tile value={doneWeek} label="Done This Week" />
    </div>
  );
}
