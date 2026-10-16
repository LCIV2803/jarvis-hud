// Jarvis speaks with one consistent AI voice, so the website sounds the same on
// every device. The browser's own speech synthesis is the offline fallback.
function speakJarvisBrowser(text, onDone) {
  const synth = window.speechSynthesis;
  if (!synth) { onDone?.(); return; }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const british = voices.filter((voice) => /en[-_]GB/i.test(voice.lang));
  utterance.voice = british.find((voice) => /daniel|george|arthur|male/i.test(voice.name))
    || british[0]
    || voices.find((voice) => /^en/i.test(voice.lang))
    || null;
  utterance.rate = 0.9;
  utterance.pitch = 0.95;
  let started = false;
  utterance.onstart = () => { started = true; };
  const guard = setTimeout(() => { if (!started) onDone?.(); }, 1500);
  utterance.onend = () => { clearTimeout(guard); onDone?.(); };
  utterance.onerror = () => { clearTimeout(guard); onDone?.(); };
  synth.speak(utterance);
}

// generate: the useServerFn-bound speech server function, called as generate({ data: { text } }).
export function createJarvisSpeaker(generate) {
  const cache = new Map(); // one audio URL per reply text, so repeats cost nothing
  let current = null;
  return {
    async speak(text, onDone) {
      const clean = String(text).replace(/[*_#`>|]/g, ' ').trim();
      if (!clean) { onDone?.(); return; }
      try {
        let url = cache.get(clean);
        if (!url) {
          const result = await generate({ data: { text: clean.slice(0, 1000) } });
          url = result?.url;
          if (!url) throw new Error('no audio returned');
          cache.set(clean, url);
        }
        this.stop();
        const audio = new Audio(url);
        current = audio;
        const finish = () => { if (current === audio) current = null; onDone?.(); };
        audio.onended = finish;
        audio.onerror = finish;
        await audio.play();
      } catch {
        speakJarvisBrowser(clean, onDone);
      }
    },
    stop() {
      current?.pause();
      current = null;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    },
  };
}