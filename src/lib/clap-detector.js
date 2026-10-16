// Deliberately conservative: two short, broadband transients with quiet between.
export function createClapDetector(now) {
  let ambient = 0.008;
  let quietSince = now;
  let burst = null;
  let firstClap = null;
  const readyAt = now + 1500;
  return (time, rms, peak, highFrequencyRatio) => {
    const threshold = Math.max(0.045, ambient * 8);
    if (time < readyAt) {
      ambient = Math.min(0.035, ambient * 0.96 + rms * 0.04);
      quietSince = time;
      return false;
    }
    if (firstClap !== null && time - firstClap > 850) firstClap = null;
    const quiet = rms < Math.max(0.018, ambient * 2.2);
    if (burst) {
      burst.peak = Math.max(burst.peak, peak);
      burst.high = Math.max(burst.high, highFrequencyRatio);
      if (time - burst.at > 400) { // a real clap keeps ringing past 140ms; allow the room to settle
        burst = null;
        firstClap = null;
        quietSince = time;
        return false;
      }
      if (!quiet) return false;
      const duration = time - burst.at;
      const valid = duration >= 8 && duration <= 350 && burst.peak >= 0.25 && burst.high >= 0.15;
      burst = null;
      quietSince = time;
      if (!valid) { firstClap = null; return false; }
      if (firstClap !== null && time - firstClap >= 260 && time - firstClap <= 850) {
        firstClap = null;
        return true;
      }
      firstClap = time;
      return false;
    }
    if (rms >= threshold && peak >= 0.25 && highFrequencyRatio >= 0.15 && time - quietSince >= 100) {
      burst = { at: time, peak, high: highFrequencyRatio };
      return false;
    }
    if (!quiet) quietSince = time;
    else ambient = Math.max(0.002, ambient * 0.99 + rms * 0.01);
    return false;
  };
}