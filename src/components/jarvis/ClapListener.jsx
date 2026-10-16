import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Jarvis's spoken greeting, pre-generated once and stored as a public MP3.
const GREETING_URL = 'https://media.base44.com/files/public/6ad167dc5c10aca7dab4bc47/9277a7eb6_speech.mp3';
const SAMPLE_MS = 40;
const CLAP_WINDOW_MS = 1400; // two sharp transients inside this window = a clap
const SPIKE_MAX_MS = 250;    // a clap is sharp; longer loudness is speech or noise
const COOLDOWN_MS = 5000;

const btnCls = 'font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 border border-hud-border bg-hud-panel text-hud-text2 hover:text-hud-text hover:border-hud-accent transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent';

export default function ClapListener() {
  const [mode, setMode] = useState('idle'); // idle | listening | triggering
  const [spotify, setSpotify] = useState(null); // true | false | null (unknown yet)
  const [msg, setMsg] = useState(null); // { text, red }
  const msgTimer = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef = useRef(null);
  const timerRef = useRef(null);
  const baselineRef = useRef(0.005);
  const spikeRef = useRef(null);
  const lastClapRef = useRef(0);
  const lastTriggerRef = useRef(0);
  const triggerRef = useRef(() => {});

  const showMsg = useCallback((text, red = false, ms = 6000) => {
    setMsg({ text, red });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), ms);
  }, []);

  useEffect(() => {
    let active = true;
    base44.entities.Profile.list('-updated_date', 1)
      .then((list) => { if (active) setSpotify(!!((list && list[0] && list[0].spotify_refresh_token) || '')); })
      .catch(() => { if (active) setSpotify(false); });
    return () => { active = false; };
  }, []);

  const disarm = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioRef.current) { audioRef.current.close().catch(() => {}); audioRef.current = null; }
    analyserRef.current = null;
    bufferRef.current = null;
    spikeRef.current = null;
    setMode('idle');
  }, []);

  useEffect(() => disarm, [disarm]);

  const trigger = useCallback(async () => {
    lastTriggerRef.current = Date.now();
    setMode('triggering');
    try { await new Audio(GREETING_URL).play(); } catch {}
    let response;
    try { response = await base44.functions.invoke('spotifyPlay', {}); } catch (e) { response = e?.response; }
    const data = response?.data;
    if (response?.status === 200 && data?.ok) {
      showMsg('Now playing: ' + (data.track || 'your song') + ' · ' + (data.device || 'Spotify'));
    } else if (data?.error === 'not_connected') {
      setSpotify(false);
      showMsg('Connect Spotify to start the music.', true);
    } else {
      showMsg(data?.message || 'Could not start the music.', true);
    }
    setMode('listening');
  }, [showMsg]);

  useEffect(() => { triggerRef.current = trigger; }, [trigger]);

  // One audio sample: follow the room's baseline quietly, and when a short,
  // sharp transient ends, count it as a clap. Two claps close together trigger.
  const sample = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !bufferRef.current) return;
    analyser.getFloatTimeDomainData(bufferRef.current);
    const buf = bufferRef.current;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    const floor = Math.max(0.025, baselineRef.current * 5);
    const spike = spikeRef.current;
    if (rms > floor) {
      if (!spike) spikeRef.current = { start: now };
    } else {
      baselineRef.current += (rms - baselineRef.current) * 0.02;
      if (spike) {
        spikeRef.current = null;
        const dur = now - spike.start;
        if (dur < SPIKE_MAX_MS && now - lastTriggerRef.current > COOLDOWN_MS) {
          if (now - lastClapRef.current < CLAP_WINDOW_MS) {
            lastClapRef.current = 0;
            triggerRef.current();
          } else {
            lastClapRef.current = now;
          }
        }
      }
    }
  }, []);

  const arm = useCallback(async () => {
    if (mode !== 'idle') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioRef.current = ctx;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      baselineRef.current = 0.005;
      spikeRef.current = null;
      lastClapRef.current = 0;
      lastTriggerRef.current = 0;
      setMode('listening');
      showMsg('Armed. Clap twice to call Jarvis.', false, 4000);
      timerRef.current = setInterval(sample, SAMPLE_MS);
    } catch {
      if (audioRef.current) { audioRef.current.close().catch(() => {}); audioRef.current = null; }
      showMsg('Microphone blocked. Allow mic access in the browser, then arm again.', true);
    }
  }, [mode, sample, showMsg]);

  const connect = () => { window.location.assign('/api/spotify/login'); };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {msg && (
        <div
          className="font-mono text-[10px] tracking-[0.14em] px-3 py-1.5 bg-hud-panel border max-w-[280px] text-right"
          style={{ color: msg.red ? '#E5533D' : '#3DDC84', borderColor: msg.red ? 'rgba(229,83,61,0.5)' : 'rgba(61,220,132,0.4)' }}
        >
          {msg.text}
        </div>
      )}
      <div className="flex items-center gap-2">
        {spotify === false && <button type="button" className={btnCls} onClick={connect}>Connect Spotify</button>}
        <button type="button" className={btnCls} onClick={mode === 'idle' ? arm : disarm}>
          {mode === 'listening' ? <span><span className="text-hud-accent">●</span> Listening — clap twice</span> : mode === 'triggering' ? 'At your service…' : 'Arm Clap'}
        </button>
      </div>
    </div>
  );
}