import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { startClapMusic, getSpotifyConnection } from '@/lib/spotify';
import useClapMicrophone from '@/hooks/useClapMicrophone';

const SESSION_KEY = 'jarvis.music.1FA0Adwe8FnRNpja1KYyT5.started';
const GREETING_URL = 'https://media.base44.com/files/public/6ad167dc5c10aca7dab4bc47/9277a7eb6_speech.mp3';

export default function useClapListener() {
  const [mode, setMode] = useState('idle');
  const [message, setMessage] = useState(null);
  const [micDenied, setMicDenied] = useState(false);
  const busy = useRef(false);
  const started = useRef(false);
  const armed = useRef(false);
  const cooldown = useRef(0);
  const triggerRef = useRef(() => {});
  const timer = useRef(null);
  const firstTimer = useRef(null);
  const greeting = useRef(null);
  const showMessage = useCallback((text, red = false) => {
    clearTimeout(timer.current);
    setMessage({ text, red });
    timer.current = setTimeout(() => setMessage(null), 10000);
  }, []);
  const noteFirstClap = useCallback(() => {
    clearTimeout(timer.current);
    setMessage({ text: 'One clap heard — clap once more.' });
    clearTimeout(firstTimer.current);
    firstTimer.current = setTimeout(() => setMessage(null), 2500);
  }, []);
  const { arm: openMicrophone, disarm: closeMicrophone } = useClapMicrophone(
    () => triggerRef.current(),
    noteFirstClap,
  );
  const play = useServerFn(startClapMusic);
  const checkConnection = useServerFn(getSpotifyConnection);
  const connection = useQuery({ queryKey: ['spotify-connection'], queryFn: () => checkConnection(), staleTime: 60000 });
  const { mutateAsync } = useMutation({ mutationFn: () => play({ data: {} }) });

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') { started.current = true; setMode('started'); return undefined; }
    // Automatic: the microphone arms itself as soon as the dashboard loads.
    let cancelled = false;
    openMicrophone().then((opened) => {
      if (cancelled || opened === false) return;
      armed.current = true;
      setMode('listening');
    }).catch((error) => {
      if (cancelled) return;
      setMicDenied(true);
      if (error?.name !== 'NotAllowedError') showMessage(error?.message || 'Could not open the microphone.', true);
    });
    return () => { cancelled = true; armed.current = false; };
  }, [openMicrophone, showMessage]);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(firstTimer.current); greeting.current?.pause(); }, []);

  const trigger = useCallback(async () => {
    if (busy.current || started.current || !armed.current || Date.now() < cooldown.current) return;
    busy.current = true; // Lock synchronously, before either greeting or playback starts.
    setMode('triggering');
    try {
      await new Promise((resolve) => {
        const audio = new Audio(GREETING_URL);
        greeting.current = audio;
        const timeout = setTimeout(() => { audio.pause(); resolve(); }, 4000);
        const finish = () => { clearTimeout(timeout); resolve(); };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      });
      if (!armed.current) return;
      const data = await mutateAsync();
      if (!data?.ok || !data.verified || data.uri !== 'spotify:track:1FA0Adwe8FnRNpja1KYyT5') {
        showMessage(data?.message || 'Spotify has not confirmed the correct song.', true);
        return;
      }
      started.current = true;
      sessionStorage.setItem(SESSION_KEY, 'true');
      armed.current = false;
      closeMicrophone();
      setMode('started');
      showMessage((data.already_playing ? 'Already playing — not restarted: ' : 'Now playing: ') + data.track + ' · ' + data.device);
    } catch (error) {
      showMessage(error?.message || 'Could not start Spotify.', true);
    } finally {
      busy.current = false;
      cooldown.current = Date.now() + 10000;
      if (!started.current) setMode(armed.current ? 'listening' : 'idle');
    }
  }, [mutateAsync, closeMicrophone, showMessage]);
  useEffect(() => { triggerRef.current = trigger; }, [trigger]);

  return {
    mode, message, micDenied,
    spotify: connection.data?.connected,
    disabled: connection.isPending || connection.isError || !connection.data?.canControl,
    connect: () => window.location.assign('/api/spotify/login'),
  };
}