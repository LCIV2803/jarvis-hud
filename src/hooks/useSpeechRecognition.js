import { useCallback, useEffect, useRef, useState } from 'react';

export const speechSupported = () =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

// Continuous browser speech recognition that auto-restarts while active.
export default function useSpeechRecognition(onFinal) {
  const callback = useRef(onFinal);
  callback.current = onFinal;
  const recognition = useRef(null);
  const active = useRef(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    active.current = false;
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onend = null;
      try { current.stop(); } catch { /* already stopped */ }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!speechSupported() || active.current) return false;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const instance = new Recognition();
    instance.lang = navigator.language || 'en-US';
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) callback.current(event.results[i][0].transcript.trim());
      }
    };
    instance.onerror = (event) => {
      setError(event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        active.current = false;
        recognition.current = null;
        setListening(false);
      }
    };
    instance.onend = () => {
      if (active.current && recognition.current === instance) {
        try { instance.start(); } catch { /* mid-restart race */ }
      } else {
        setListening(false);
      }
    };
    try { instance.start(); } catch { return false; }
    active.current = true;
    recognition.current = instance;
    setListening(true);
    return true;
  }, []);

  useEffect(() => stop, [stop]);
  return { supported: speechSupported(), listening, error, start, stop };
}