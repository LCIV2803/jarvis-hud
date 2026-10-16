import React from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { HUD } from '@/lib/jarvis';

// Dollar figures read with thousands separators ($0, $2,000, $12,500);
// plain counts stay unformatted.
function formatStat(value, prefix) {
  const n = Number(value) || 0;
  return prefix ? prefix + n.toLocaleString('en-AU') : String(n);
}

function Stat({ value, label, gold, prefix }) {
  const display = useCountUp(value);
  return (
    <div className="flex flex-col">
      <span
        className="font-mono text-[40px] leading-none tabular-nums"
        style={{ color: gold ? HUD.amber : HUD.text }}
      >
        {formatStat(display, prefix)}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-hud-text2 mt-2">
        {label}
      </span>
    </div>
  );
}

export default function StatColumn({ revenue, spokenTo, leadsGenerated, tasksDone }) {
  return (
    <div className="flex flex-col gap-8">
      <Stat value={revenue} label="Revenue This Month" gold prefix="$" />
      <Stat value={spokenTo} label="Businesses Spoken To" />
      <Stat value={leadsGenerated} label="Leads Generated" />
      <Stat value={tasksDone} label="Tasks Done" />
    </div>
  );
}
