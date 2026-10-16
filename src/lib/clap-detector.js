// Deliberately conservative: two short, broadband transients with quiet between.
export function createClapDetector(now) {
  let ambient = 0.008;
  let quietSince = now;
  let burst = null;
  let firstClap = null;
  const readyAt = now + 1500;
  return (time, rms, peak, highFrequencyRatio) => {
    const threshold = Math.max(0.065, ambient * 9);
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
      if (time - burst.at > 140) {
        burst = null;
        firstClap = null;
        quietSince = time;
        return false;
      }
      if (!quiet) return false;
      const duration = time - burst.at;
      const valid = duration >= 8 && burst.peak >= 0.42 && burst.high >= 0.3;
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
    if (rms >= threshold && peak >= 0.42 && highFrequencyRatio >= 0.3 && time - quietSince >= 180) {
      burst = { at: time, peak, high: highFrequencyRatio };
      return false;
    }
    if (!quiet) quietSince = time;
    else ambient = Math.max(0.002, ambient * 0.99 + rms * 0.01);
    return false;
  };
}