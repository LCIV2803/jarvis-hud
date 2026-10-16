import React, { useState, useEffect, useRef } from 'react';
import { HUD } from '@/lib/jarvis';
import { useCountUp } from '@/hooks/useCountUp';

function polar(r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 160 + r * Math.cos(a), y: 160 + r * Math.sin(a) };
}

function arcPath(r, centerDeg, spanDeg) {
  const a1 = centerDeg - spanDeg / 2;
  const a2 = centerDeg + spanDeg / 2;
  const p1 = polar(r, a1);
  const p2 = polar(r, a2);
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
}

const ARCS = [45, 135, 225, 315];
const RING_C = [45, 135, 225, 315];

export default function HudRing({ doneToday, touchedToday, pulseKey }) {
  const displayCount = useCountUp(doneToday);
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  const litCount = touchedToday > 0 ? Math.round((doneToday / touchedToday) * 72) : 0;

  const ringA = Array.from({ length: 36 }, (_, i) => i);
  const ringD = Array.from({ length: 120 }, (_, i) => i);

  const radarStart = polar(118, 0);
  const radarEnd = polar(118, 50);
  const radarPath = `M ${radarStart.x} ${radarStart.y} A 118 118 0 0 1 ${radarEnd.x} ${radarEnd.y}`;

  const [ripples, setRipples] = useState([]);
  const [glowKey, setGlowKey] = useState(0);
  const rid = useRef(0);

  useEffect(() => {
    if (pulseKey === 0) return;
    const id = ++rid.current;
    setRipples((rs) => [...rs, id]);
    setGlowKey((k) => k + 1);
    const t = setTimeout(() => {
      setRipples((rs) => rs.filter((x) => x !== id));
    }, 1400);
    return () => clearTimeout(t);
  }, [pulseKey]);

  return (
    <div className="relative w-[320px] h-[320px] max-[600px]:w-[220px] max-[600px]:h-[220px]">
      <div
        className="hud-breathe-glow absolute pointer-events-none"
        style={{
          width: 180,
          height: 180,
          left: '50%',
          top: '50%',
          marginLeft: -90,
          marginTop: -90,
          background:
            'radial-gradient(circle, rgba(82,181,255,0.22) 0%, transparent 70%)'
        }}
      />
      <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient
            id="hud-radar-grad"
            gradientUnits="userSpaceOnUse"
            x1={radarStart.x}
            y1={radarStart.y}
            x2={radarEnd.x}
            y2={radarEnd.y}
          >
            <stop offset="0%" stopColor={HUD.accent} stopOpacity="0" />
            <stop offset="100%" stopColor={HUD.accent} stopOpacity="0.5" />
          </linearGradient>
        </defs>

        <g stroke={HUD.accent} fill="none">
          <circle cx="160" cy="160" r="150" strokeWidth="1" opacity="0.35" />
          <circle cx="160" cy="160" r="144" strokeWidth="1" opacity="0.14" strokeDasharray="1 14" className="hud-spin" />
          <circle cx="160" cy="160" r="100" strokeWidth="1" opacity="0.4" className="hud-breathe-circle" />
        </g>

        <g stroke={HUD.accent} fill="none" className="hud-ring-a" opacity="0.18">
          {ringA.map((i) => {
            const p1 = polar(121, i * 10);
            const p2 = polar(127, i * 10);
            return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeWidth="1" />;
          })}
        </g>

        <circle cx="160" cy="160" r="112" stroke={HUD.accent} strokeWidth="1" fill="none" strokeDasharray="2 10" opacity="0.14" className="hud-ring-b" />

        <g stroke={HUD.accent} fill="none" className="hud-ring-c" opacity="0.22">
          {RING_C.map((deg) => (
            <path key={deg} d={arcPath(140, deg, 40)} strokeWidth="1" />
          ))}
        </g>

        <g fill={HUD.accent} className="hud-ring-d" opacity="0.12">
          {ringD.map((i) => {
            const p = polar(156, i * 3);
            return <circle key={i} cx={p.x} cy={p.y} r="0.7" />;
          })}
        </g>

        <g stroke={HUD.accent} fill="none">
          {ticks.map((i) => {
            const isMajor = i % 6 === 0;
            const r1 = isMajor ? 118 : 124;
            const p1 = polar(r1, i * 5);
            const p2 = polar(134, i * 5);
            const lit = i < litCount;
            const opacity = lit ? 0.9 : isMajor ? 0.3 : 0.13;
            const width = isMajor ? 1.2 : 1;
            return (
              <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeWidth={width} opacity={opacity} />
            );
          })}
        </g>

        <g stroke={HUD.accent} fill="none">
          {ARCS.map((deg) => {
            const r = 152;
            const a1 = ((deg - 14 - 90) * Math.PI) / 180;
            const a2 = ((deg + 14 - 90) * Math.PI) / 180;
            const x1 = 160 + r * Math.cos(a1);
            const y1 = 160 + r * Math.sin(a1);
            const x2 = 160 + r * Math.cos(a2);
            const y2 = 160 + r * Math.sin(a2);
            const d = `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
            const e1 = polar(r, deg - 14);
            const e2 = polar(r, deg + 14);
            return (
              <g key={deg}>
                <path d={d} strokeWidth="1.2" opacity="0.34" strokeLinecap="round" />
                <circle cx={e1.x} cy={e1.y} r="2" fill={HUD.accent} stroke="none" opacity="0.6" />
                <circle cx={e2.x} cy={e2.y} r="2" fill={HUD.accent} stroke="none" opacity="0.6" />
              </g>
            );
          })}
        </g>

        <g className="hud-radar">
          <path d={radarPath} stroke="url(#hud-radar-grad)" strokeWidth="1.5" fill="none" />
        </g>

        {ripples.map((id) => (
          <circle key={id} className="hud-ripple" cx="160" cy="160" r="100" fill="none" stroke={HUD.accent} strokeWidth="1.5" />
        ))}

        <text
          key={glowKey}
          x="160"
          y="158"
          textAnchor="middle"
          fontFamily="'Geist Mono', 'JetBrains Mono', monospace"
          fontSize="64"
          fill={HUD.text}
          className={glowKey > 0 ? 'hud-num-glow' : undefined}
        >
          {displayCount}
        </text>
        <text
          x="160"
          y="190"
          textAnchor="middle"
          fontFamily="'Geist Mono', 'JetBrains Mono', monospace"
          fontSize="13"
          letterSpacing="0.15em"
          fill={HUD.text2}
        >
          DONE TODAY
        </text>
      </svg>
    </div>
  );
}
