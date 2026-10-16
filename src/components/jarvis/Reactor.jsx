import React, { useId, useState } from 'react';
import './Reactor.css';

const CYAN = '#79edff';
const polar = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [320 + r * Math.cos(a), 320 + r * Math.sin(a)];
};
const arc = (r, start, end) => {
  const [x, y] = polar(r, start), [x2, y2] = polar(r, end);
  return `M ${x} ${y} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};
const segment = (outer, inner, start, end) => {
  const a = polar(outer, start), b = polar(outer, end);
  const c = polar(inner, end), d = polar(inner, start);
  return `M ${a.join(' ')} A ${outer} ${outer} 0 0 1 ${b.join(' ')} L ${c.join(' ')} A ${inner} ${inner} 0 0 0 ${d.join(' ')} Z`;
};
const TICKS = Array.from({ length: 120 }, (_, i) => i);
const SECTORS = Array.from({ length: 12 }, (_, i) => i);

// Presentation only: no network, microphone, fabricated telemetry or call actions.
export default function Reactor({ doneToday = 0, pulseKey = 0 }) {
  const id = `jr-${useId().replace(/:/g, '')}`;
  const [paused, setPaused] = useState(false);
  const completed = Number.isFinite(doneToday) ? Math.max(0, Math.floor(doneToday)) : null;
  return (
    <section className={`jarvis-core${paused ? ' jarvis-core--paused' : ''}`} aria-label="Jarvis command core">
      <div className="jarvis-core__heading"><span className="jarvis-core__diamond" />PERSONAL INTELLIGENCE<span className="jarvis-core__rule" /><span>J / 01</span></div>
      <div className="jarvis-core__scene">
        <div className="jarvis-core__ambient" aria-hidden="true" />
        <svg className="jarvis-core__drawing" viewBox="0 0 640 640" fill="none" aria-hidden="true">
          <defs>
            <radialGradient id={`${id}-halo`}>
              <stop stopColor="#87f5ff" stopOpacity=".28" />
              <stop offset=".35" stopColor="#36cffa" stopOpacity=".09" />
              <stop offset="1" stopColor="#36cffa" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${id}-glass`}>
              <stop stopColor="#1c718d" stopOpacity=".22" />
              <stop offset="1" stopColor="#020c1c" stopOpacity=".9" />
            </radialGradient>
            <linearGradient id={`${id}-metal`} x1="180" y1="120" x2="460" y2="510" gradientUnits="userSpaceOnUse">
              <stop stopColor="#defdff" /><stop offset=".42" stopColor="#459ab8" /><stop offset=".7" stopColor="#174563" /><stop offset="1" stopColor="#9becff" />
            </linearGradient>
            <linearGradient id={`${id}-energy`} x1="260" y1="260" x2="362" y2="355" gradientUnits="userSpaceOnUse">
              <stop stopColor="white" /><stop offset=".55" stopColor="#bcfaff" /><stop offset="1" stopColor="#43d5ff" />
            </linearGradient>
            <filter id={`${id}-bloom`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>
          </defs>
          <circle cx="320" cy="320" r="275" fill={`url(#${id}-halo)`} />

          {/* Fine engineering grid and static reticle. All geometry is decorative. */}
          <g stroke={CYAN} strokeOpacity=".12" strokeWidth=".7">
            <path d="M320 24v110M320 506v110M24 320h110M506 320h110" />
            <circle cx="320" cy="320" r="280" strokeDasharray="1 9" />
            <circle cx="320" cy="320" r="252" />
            <path d="M91 120v-29h29M520 91h29v29M549 520v29h-29M120 549H91v-29" strokeWidth="2" />
          </g>
          <g stroke={CYAN}>
            {TICKS.map(i => {
              const major = i % 10 === 0, mid = i % 5 === 0;
              const a = polar(major ? 256 : mid ? 260 : 264, i * 3), b = polar(270, i * 3);
              return <path key={i} d={`M${a.join(' ')}L${b.join(' ')}`} strokeWidth={major ? 2 : 1} opacity={major ? .7 : mid ? .35 : .17} />;
            })}
          </g>
          <g className="jarvis-core__rotate jarvis-core__outer">
            {[0, 120, 240].map(deg => <g key={deg}>
              <path d={arc(244, deg + 7, deg + 76)} stroke={CYAN} strokeWidth="2" opacity=".6" />
              <path d={arc(239, deg + 7, deg + 48)} stroke={CYAN} strokeWidth=".7" opacity=".35" />
              <path d={arc(244, deg + 79, deg + 84)} stroke="#eab878" strokeWidth="3" />
            </g>)}
          </g>
          <circle cx="320" cy="320" r="225" stroke={CYAN} strokeOpacity=".18" strokeWidth=".8" />
          <g className="jarvis-core__rotate jarvis-core__segments">
            {SECTORS.map(i => <g key={i}>
              <path d={segment(215, 192, i * 30 + 2, i * 30 + 27)} fill={`url(#${id}-metal)`} fillOpacity={i % 3 === 0 ? .2 : .08} stroke={CYAN} strokeOpacity=".3" strokeWidth=".8" />
              <path d={arc(207, i * 30 + 5, i * 30 + 24)} stroke={CYAN} strokeWidth="2" opacity={i % 3 === 0 ? .8 : .3} />
            </g>)}
          </g>
          <g className="jarvis-core__rotate jarvis-core__scanner">
            <path d={arc(183, 0, 88)} stroke={CYAN} strokeWidth="2" opacity=".2" />
            <path d={arc(183, 66, 88)} stroke={CYAN} strokeWidth="3" opacity=".7" />
            <circle cx="503" cy="320" r="3" fill="#e6fdff" />
          </g>
          <circle cx="320" cy="320" r="172" stroke={CYAN} strokeWidth="1" strokeOpacity=".4" />
          <circle cx="320" cy="320" r="167" stroke={CYAN} strokeWidth=".7" strokeOpacity=".15" strokeDasharray="1 5" />
          <circle cx="320" cy="320" r="150" fill={`url(#${id}-glass)`} stroke={CYAN} strokeOpacity=".18" />

          {/* Three broad turbine shields, with illuminated inner conductors. */}
          <g className="jarvis-core__rotate jarvis-core__turbine">
            {[0, 120, 240].map(deg => <g key={deg}>
              <path d={segment(147, 135, deg + 12, deg + 103)} fill={`url(#${id}-metal)`} fillOpacity=".55" />
              <path d={arc(129, deg + 14, deg + 101)} stroke={CYAN} strokeWidth="3" opacity=".75" />
              <path d={arc(123, deg + 25, deg + 92)} stroke={CYAN} strokeWidth="1" opacity=".3" />
            </g>)}
          </g>
          <circle cx="320" cy="320" r="110" stroke={CYAN} strokeOpacity=".25" strokeWidth="1" />
          <circle cx="320" cy="320" r="103" stroke={CYAN} strokeOpacity=".55" strokeWidth=".8" />
          <g className="jarvis-core__energy">
            <path d="M320 243L392 365H248Z" stroke="#61eaff" strokeWidth="15" strokeLinejoin="round" filter={`url(#${id}-bloom)`} opacity=".7" />
            <path d="M320 243L392 365H248Z" stroke={`url(#${id}-energy)`} strokeWidth="4" strokeLinejoin="round" fill="#63eaff" fillOpacity=".04" />
            <path d="M320 261L376 355H264Z" stroke={CYAN} strokeWidth="1" strokeOpacity=".5" />
            <path d="M320 291L345 334H295Z" fill={`url(#${id}-energy)`} filter={`url(#${id}-soft)`} />
            <path d="M320 291L345 334H295Z" fill={`url(#${id}-energy)`} />
            <path d="M320 220v13M235 373l-12 7M405 373l12 7" stroke={CYAN} strokeWidth="2" />
          </g>
          <g stroke={CYAN} strokeWidth=".8" strokeOpacity=".35">
            <path d="M57 194h67l36 34M480 224l36-36h67M77 455h58l32-32M475 429l30 30h67" />
            <circle cx="160" cy="228" r="3" fill={CYAN} /><circle cx="480" cy="224" r="3" fill={CYAN} />
            <circle cx="167" cy="423" r="3" fill={CYAN} /><circle cx="475" cy="429" r="3" fill={CYAN} />
          </g>
          <g fill="#8cbbd0" fontFamily="'Geist Mono', monospace" fontSize="9" letterSpacing="2">
            <text x="57" y="184">CONTEXT</text><text x="583" y="178" textAnchor="end">MEMORY</text>
            <text x="77" y="474">TASKS</text><text x="573" y="478" textAnchor="end">COMMS</text>
          </g>
          <g fill="#759aae" fontFamily="'Geist Mono', monospace" fontSize="8" letterSpacing="1.6">
            <text x="320" y="31" textAnchor="middle">N</text><text x="610" y="323">E</text>
            <text x="320" y="617" textAnchor="middle">S</text><text x="20" y="323">W</text>
          </g>
          <circle key={pulseKey} className={pulseKey > 0 ? 'jarvis-core__receipt' : undefined} cx="320" cy="320" r="180" stroke={CYAN} opacity="0" />
        </svg>
        <div className="jarvis-core__identity"><span>J.A.R.V.I.S.</span><small>YOUR PERSONAL COMMAND CENTRE</small></div>
      </div>
      <div className="jarvis-core__footer">
        <div className="jarvis-core__readout"><span className="jarvis-core__readout-bar" /><strong>{completed ?? '—'}</strong><span>TASKS CLOSED<br />TODAY</span></div>
        <button type="button" className="jarvis-core__motion" aria-pressed={paused} onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume reactor animation' : 'Pause reactor animation'}>
          <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span> MOTION {paused ? 'PAUSED' : 'ON'}
        </button>
      </div>
    </section>
  );
}
