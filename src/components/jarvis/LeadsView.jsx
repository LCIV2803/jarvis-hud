import React from 'react';
import { HUD } from '@/lib/jarvis';

const markerColor = (status) => {
  if (status === 'new') return HUD.green;
  if (status === 'demo_built') return HUD.amber;
  if (status === 'contacted') return HUD.accent;
  return HUD.faint;
};

export default function LeadsView({ leads }) {
  return (
    <div>
      <div className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 pb-2">
        LEADS
      </div>
      <div className="h-px bg-hud-border mb-3" />
      <div className="flex flex-col gap-[14px]">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-center gap-3 min-w-0">
            <span
              className="w-1.5 h-1.5 shrink-0"
              style={{ background: markerColor(lead.status) }}
            />
            <span className="font-body text-[17px] text-hud-text shrink-0">
              {lead.business_name}
            </span>
            <span className="font-mono text-[14px] text-hud-faint truncate">
              {[
                lead.trade,
                lead.suburb,
                lead.phone,
                lead.status
              ].filter(Boolean).join('  ·  ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
