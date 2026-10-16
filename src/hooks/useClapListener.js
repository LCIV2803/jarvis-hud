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
  const busy = useRef(false);
  const started = useRef(false);
  const armed = useRef(false);
  const cooldown = useRef(0);
  const triggerRef = useRef(() => {});
  const timer = useRef(null);
  const greeting = useRef(null);
  const { arm: openMicrophone, disarm: closeMicrophone } = useClapMicrophone(() => triggerRef.current());
  const play = useServerFn(startClapMusic);
  const checkConnection = useServerFn(getSpotifyConnection);
  const connection = useQuery({ queryKey: ['spotify-connection'], queryFn: () => checkConnection(), staleTime: 60000 });
  const { mutateAsync } = useMutation({ mutationFn: () => play({ data: {} }) });
  const showMessage = useCallback((text, red = false) => {
    clearTimeout(timer.current);
    setMessage({ text, red });
    timer.current = setTimeout(() => setMessage(null), 10000);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') { started.current = true; setMode('started'); }
    return () => { clearTimeout(timer.current); greeting.current?.pause(); };
  }, []);

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

  const disarm = useCallback(() => {
    armed.current = false;
    closeMicrophone();
    greeting.current?.pause();
    setMode(started.current ? 'started' : 'idle');
  }, [closeMicrophone]);
  useEffect(() => () => { armed.current = false; }, []);

  const arm = useCallback(async () => {
    if (started.current || busy.current) return;
    setMode('arming');
    try {
      if (!await openMicrophone()) return;
      armed.current = true;
      setMode('listening');
      showMessage('Let the room settle for two seconds, then clap twice sharply, about half a second apart.');
    } catch (error) {
      closeMicrophone();
      setMode('idle');
      showMessage(error?.name === 'NotAllowedError' ? 'Allow microphone access, then arm again.' : error?.message || 'Could not open the microphone.', true);
    }
  }, [openMicrophone, closeMicrophone, showMessage]);

  return {
    mode, arm, disarm,
    message: message || (connection.isError ? { text: 'Could not check Spotify connection.', red: true } : null),
    spotify: connection.data?.connected,
    disabled: connection.isPending || connection.isError || !connection.data?.canControl || ['arming', 'triggering', 'started'].includes(mode),
    connect: () => window.location.assign('/api/spotify/login'),
  };
}