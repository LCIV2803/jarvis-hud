import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { startClapMusic, getSpotifyConnection } from '@/lib/spotify';

export default function useMusicCommand() {
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const lastTrigger = useRef(0);
  const play = useServerFn(startClapMusic);
  const checkConnection = useServerFn(getSpotifyConnection);
  const connection = useQuery({ queryKey: ['spotify-connection'], queryFn: () => checkConnection(), staleTime: 60000 });
  const { mutateAsync, isPending } = useMutation({ mutationFn: () => play({ data: {} }) });

  const start = useCallback(async () => {
    if (busy.current || Date.now() - lastTrigger.current < 2500) return;
    busy.current = true;
    lastTrigger.current = Date.now();
    setMessage(null);
    try {
      const data = await mutateAsync();
      if (!data?.ok || !data.verified || data.uri !== 'spotify:track:1FA0Adwe8FnRNpja1KYyT5') {
        setMessage({ text: data?.message || 'Spotify has not confirmed the song. Say “Jarvis, let’s begin” to retry.', red: true });
        return;
      }
      setMessage({ text: (data.already_playing ? 'Already playing — not restarted: ' : 'Now playing: ') + data.track + ' · ' + data.device });
    } catch (error) {
      setMessage({ text: error?.message || 'Could not start Spotify. Say “Jarvis, let’s begin” to retry.', red: true });
    } finally {
      busy.current = false;
    }
  }, [mutateAsync]);

  return {
    start, message, isPending,
    spotify: connection.data?.connected,
    disabled: connection.isPending || connection.isError || !connection.data?.canControl,
    connect: () => window.location.assign('/api/spotify/login'),
  };
}