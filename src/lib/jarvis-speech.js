// Jarvis speaks through the browser's speech synthesis: British, measured.
export function speakJarvis(text, onDone) {
  const synth = window.speechSynthesis;
  if (!synth) { onDone?.(); return; }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).replace(/[*_#`>|]/g, ' ').trim());
  const voices = synth.getVoices();
  const british = voices.filter((voice) => /en[-_]GB/i.test(voice.lang));
  utterance.voice = british.find((voice) => /daniel|george|arthur|male/i.test(voice.name))
    || british[0]
    || voices.find((voice) => /^en/i.test(voice.lang))
    || null;
  utterance.rate = 0.9;
  utterance.pitch = 0.95;
  utterance.onend = () => onDone?.();
  utterance.onerror = () => onDone?.();
  synth.speak(utterance);
}

export function stopJarvisSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}