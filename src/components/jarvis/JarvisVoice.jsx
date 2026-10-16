import React, { useCallback, useEffect, useRef, useState } from 'react';
import useWakeWord from '@/hooks/useWakeWord';
import useSpeechRecognition from '@/hooks/useSpeechRecognition';
import useJarvisConversation from '@/hooks/useJarvisConversation';
import VoiceMessageList from '@/components/jarvis/VoiceMessageList';
import { speakJarvis, stopJarvisSpeech } from '@/lib/jarvis-speech';

const btnCls = 'font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 border border-hud-border bg-hud-panel text-hud-text2 hover:text-hud-text hover:border-hud-accent transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent disabled:opacity-60 disabled:cursor-default';
const phaseLabels = { listening: 'Listening — speak your command', thinking: 'Jarvis is thinking…', speaking: 'Jarvis is speaking…' };

export default function JarvisVoice() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState(null);
  const [draft, setDraft] = useState('');
  const openRef = useRef(false);
  const speakingRef = useRef(false);
  openRef.current = open;

  const commands = useSpeechRecognition((transcript) => {
    if (!transcript || speakingRef.current) return;
    const remainder = transcript.replace(/^.*?\bjarvis\b[,]?\s*/i, '').trim();
    setPhase('thinking');
    commands.stop();
    conversation.send(remainder || transcript);
  });

  const replyHandler = useCallback((text) => {
    if (!text || !openRef.current) return;
    speakingRef.current = true;
    setPhase('speaking');
    speakJarvis(text, () => {
      speakingRef.current = false;
      if (!openRef.current) return;
      setPhase('listening');
      commands.start();
    });
  }, [commands]);

  const conversation = useJarvisConversation(replyHandler);

  const wake = useCallback(() => {
    setOpen(true);
    speakingRef.current = true;
    setPhase('speaking');
    conversation.begin();
    speakJarvis('At your service.', () => {
      speakingRef.current = false;
      setPhase('listening');
      commands.start();
    });
  }, [conversation, commands]);
  const wakeWord = useWakeWord(wake);

  useEffect(() => {
    if (wakeWord.error === 'not-allowed' || wakeWord.error === 'service-not-allowed') {
      wakeWord.disarm();
      setNotice('Allow microphone access, then arm again.');
    }
  }, [wakeWord.error, wakeWord.disarm]);

  const close = useCallback(() => {
    setOpen(false);
    openRef.current = false;
    speakingRef.current = false;
    stopJarvisSpeech();
    commands.stop();
    wakeWord.disarm();
    setPhase('idle');
  }, [commands, wakeWord]);

  const submitDraft = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    commands.stop();
    setPhase('thinking');
    conversation.send(text);
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">
      {notice && (
        <div className="font-mono text-[10px] tracking-[0.14em] px-3 py-1.5 bg-hud-panel border border-hud-red text-hud-red max-w-[280px]">
          {notice}
        </div>
      )}
      <button
        type="button"
        className={btnCls}
        disabled={!wakeWord.supported}
        onClick={() => (wakeWord.armed ? wakeWord.disarm() : wakeWord.arm())}
        aria-pressed={wakeWord.armed}
      >
        {wakeWord.armed && <span className="text-hud-accent" aria-hidden="true">● </span>}
        {wakeWord.armed ? 'Listening for “Jarvis”' : 'Arm “Jarvis” wake word'}
      </button>
      {open && (
        <div className="w-[min(92vw,360px)] border border-hud-border bg-hud-panel p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-hud-faint">Jarvis · voice link</span>
            <button type="button" className="font-mono text-[10px] text-hud-text2 hover:text-hud-text" onClick={close}>Close</button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto flex flex-col gap-2">
            <VoiceMessageList messages={conversation.messages} phase={phase} />
          </div>
          {phaseLabels[phase] && <p className="font-mono text-[10px] text-hud-accent">{phaseLabels[phase]}</p>}
          <form className="flex gap-2" onSubmit={submitDraft}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1 bg-hud-bg border border-hud-border px-2 py-1.5 text-xs text-hud-text placeholder:text-hud-faint focus:outline-none focus-visible:border-hud-accent"
              placeholder="Type to Jarvis instead…"
              maxLength={400}
            />
            <button type="submit" className={btnCls}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}