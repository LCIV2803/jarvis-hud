import { useCallback, useEffect, useRef, useState } from 'react';
import useSpeechRecognition from '@/hooks/useSpeechRecognition';

// Listens in the background for the spoken wake word "Jarvis".
export default function useWakeWord(onWake) {
  const wakeRef = useRef(onWake);
  wakeRef.current = onWake;
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const { supported, error, start, stop } = useSpeechRecognition((transcript) => {
    if (armedRef.current && /\bjarvis\b/i.test(transcript)) {
      armedRef.current = false;
      setArmed(false);
      stop();
      wakeRef.current();
    }
  });

  const arm = useCallback(() => {
    armedRef.current = true;
    setArmed(true);
    return start();
  }, [start]);

  const disarm = useCallback(() => {
    armedRef.current = false;
    setArmed(false);
    stop();
  }, [stop]);

  useEffect(() => () => { armedRef.current = false; }, []);
  return { supported, armed, error, arm, disarm };
}