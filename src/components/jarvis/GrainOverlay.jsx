import React from 'react';

// Fixed full-screen film grain generated inline with an SVG feTurbulence
// filter. No image file, no external asset. Sits above the page background
// and below all content; pointer-events disabled; opacity drifts faintly.
export default function GrainOverlay() {
  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <filter id="hud-grain-filter">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          stitchTiles="stitch"
        />
      </filter>
      <rect
        className="hud-grain"
        width="100%"
        height="100%"
        filter="url(#hud-grain-filter)"
        opacity="0.02"
      />
    </svg>
  );
}
