export function normalizeVoiceCommand(text) {
  return String(text).toLowerCase().normalize('NFKC')
    .replace(/['’‘`]/g, '').replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function isBeginMusicCommand(text) {
  return /(?:^|\s)jarvis let(?:s| us) begin(?:$|\s)/.test(normalizeVoiceCommand(text));
}