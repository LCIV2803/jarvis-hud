import { useCallback, useEffect, useRef, useState } from 'react';
import useSpeechRecognition from '@/hooks/useSpeechRecognition';
import { isBeginMusicCommand, normalizeVoiceCommand } from '@/lib/music-command';

// Standby and music share a recognizer, so they never compete for the microphone.
export default function useWakeWord(onWake, onBeginMusic) {
  const wakeRef = useRef(onWake);
  const musicRef = useRef(onBeginMusic);
  wakeRef.current = onWake;
  musicRef.current = onBeginMusic;
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const pending = useRef('');
  const wakeTimer = useRef(null);
  const clearPending = useCallback(() => {
    clearTimeout(wakeTimer.current);
    wakeTimer.current = null;
    pending.current = '';
  }, []);

  const { supported, error, start, stop } = useSpeechRecognition((transcript) => {
    if (!armedRef.current) return;
    const text = normalizeVoiceCommand(transcript);
    const combined = pending.current ? pending.current + ' ' + text : text;
    // Check the complete command before treating "Jarvis" as a chat request.
    if (isBeginMusicCommand(combined)) {
      clearPending();
      musicRef.current?.();
      return;
    }
    if (!/\bjarvis\b/.test(text) && !pending.current) return;
    pending.current = combined;
    clearTimeout(wakeTimer.current);
    const activate = () => {
      clearPending();
      if (!armedRef.current) return;
      armedRef.current = false;
      setArmed(false);
      stop();
      wakeRef.current();
    };
    // Recognition may deliver "Jarvis" and "let's begin" as separate results.
    if (/\bjarvis(?: let(?:s| us)?)?$/.test(combined)) {
      wakeTimer.current = setTimeout(activate, 1500);
    } else {
      activate();
    }
  }, 'en-US');

  const arm = useCallback(() => {
    if (armedRef.current) return true;
    clearPending();
    const started = start();
    armedRef.current = started;
    setArmed(started);
    return started;
  }, [start, clearPending]);

  const disarm = useCallback(() => {
    armedRef.current = false;
    setArmed(false);
    clearPending();
    stop();
  }, [stop, clearPending]);

  useEffect(() => () => { armedRef.current = false; clearPending(); }, [clearPending]);
  return { supported, armed, error, arm, disarm };
}