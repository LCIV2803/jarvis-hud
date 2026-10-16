import React from 'react';

const btnCls = 'font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 border border-hud-border bg-hud-panel text-hud-text2 hover:text-hud-text hover:border-hud-accent transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent disabled:opacity-60 disabled:cursor-default';

export default function MusicCommandStatus({ message, isPending, spotify, disabled, connect }) {
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {message && (
        <div role="status" aria-live="polite" className={`font-mono text-[10px] tracking-[0.14em] px-3 py-1.5 bg-hud-panel border max-w-[280px] text-right ${message.red ? 'text-hud-red border-hud-red' : 'text-hud-green border-hud-green'}`}>
          {message.text}
        </div>
      )}
      <div className="flex flex-wrap justify-end items-center gap-2">
        {spotify === false && <button type="button" className={btnCls} disabled={disabled} onClick={connect}>Connect Spotify</button>}
        <span role="status" aria-live="polite" className="font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 border border-hud-border bg-hud-panel text-hud-text2">
          {isPending ? 'Starting your song…' : 'Say “Jarvis, let’s begin”'}
        </span>
      </div>
    </div>
  );
}