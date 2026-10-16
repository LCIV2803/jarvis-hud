import { useCallback, useEffect, useRef } from 'react';
import { createClapDetector } from '@/lib/clap-detector';

export default function useClapMicrophone(onClap) {
  const callback = useRef(onClap);
  const media = useRef(null);
  const generation = useRef(0);
  callback.current = onClap;
  const disarm = useCallback(() => {
    generation.current++;
    const current = media.current;
    media.current = null;
    if (!current) return;
    clearInterval(current.timer);
    current.stream.getTracks().forEach((track) => track.stop());
    if (current.context.state !== 'closed') void current.context.close();
  }, []);
  useEffect(() => disarm, [disarm]);

  const arm = useCallback(async () => {
    const run = ++generation.current;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this browser.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    if (run !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return false; }
    const context = new AudioContext();
    media.current = { stream, context, timer: null };
    await context.resume();
    if (run !== generation.current) return false;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    context.createMediaStreamSource(stream).connect(analyser);
    const waveform = new Float32Array(analyser.fftSize);
    const frequencies = new Uint8Array(analyser.frequencyBinCount);
    const detect = createClapDetector(performance.now());
    const highBin = Math.floor(1500 * analyser.fftSize / context.sampleRate);
    media.current.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(waveform);
      analyser.getByteFrequencyData(frequencies);
      let power = 0, peak = 0, total = 0, high = 0;
      for (const sample of waveform) { power += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      for (let i = 0; i < frequencies.length; i++) {
        total += frequencies[i];
        if (i >= highBin) high += frequencies[i];
      }
      if (detect(performance.now(), Math.sqrt(power / waveform.length), peak, total ? high / total : 0)) callback.current();
    }, 12);
    return true;
  }, []);
  return { arm, disarm };
}