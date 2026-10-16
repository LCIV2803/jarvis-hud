// A clap is a sudden sharp rise above the room's ambient level that settles
// again shortly after; two such transients close together trigger the action.
export function createClapDetector(now) {
  let ambient = 0.008;
  let firstClapAt = null;
  let transient = null; // { started, peak }
  const readyAt = now + 1500;
  return (time, rms, peak) => {
    if (time < readyAt) {
      ambient = Math.min(0.05, ambient * 0.96 + rms * 0.04);
      return 'none';
    }
    const onset = Math.max(0.04, ambient * 7);
    const settled = rms < ambient * 2.5 + 0.012;
    if (transient) {
      if (settled) {
        const duration = time - transient.started;
        const peakReached = transient.peak;
        transient = null;
        if (peakReached < 0.18 || duration > 600) { firstClapAt = null; return 'none'; }
        if (firstClapAt !== null && time - firstClapAt >= 150 && time - firstClapAt <= 1000) {
          firstClapAt = null;
          return 'double';
        }
        firstClapAt = time;
        return 'single';
      }
      if (time - transient.started > 1200) { transient = null; firstClapAt = null; return 'none'; }
      transient.peak = Math.max(transient.peak, peak);
      return 'none';
    }
    if (firstClapAt !== null && time - firstClapAt > 1000) firstClapAt = null;
    if (settled) {
      ambient = Math.min(0.05, ambient * 0.985 + rms * 0.015);
      return 'none';
    }
    if (rms >= onset) transient = { started: time, peak };
    return 'none';
  };
}