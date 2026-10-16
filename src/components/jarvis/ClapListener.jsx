import React from 'react';
import useClapListener from '@/hooks/useClapListener';

const btnCls = 'font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 border border-hud-border bg-hud-panel text-hud-text2 hover:text-hud-text hover:border-hud-accent transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent disabled:opacity-60 disabled:cursor-default';
const labels = {
  idle: 'Arm Clap',
  arming: 'Opening microphone…',
  listening: 'Listening — two deliberate claps',
  triggering: 'Starting your song…',
  started: 'Music started · no restart',
};

export default function ClapListener() {
  const { mode, message, spotify, disabled, connect, arm, disarm } = useClapListener();
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {message && (
        <div role="status" aria-live="polite" className={`font-mono text-[10px] tracking-[0.14em] px-3 py-1.5 bg-hud-panel border max-w-[280px] text-right ${message.red ? 'text-hud-red border-hud-red' : 'text-hud-green border-hud-green'}`}>
          {message.text}
        </div>
      )}
      <div className="flex items-center gap-2">
        {spotify === false && <button type="button" className={btnCls} onClick={connect}>Connect Spotify</button>}
        <button type="button" className={btnCls} disabled={disabled} onClick={mode === 'listening' ? disarm : arm} aria-pressed={mode === 'listening'}>
          {mode === 'listening' && <span className="text-hud-accent" aria-hidden="true">● </span>}
          {labels[mode]}
        </button>
      </div>
    </div>
  );
}