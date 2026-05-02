/**
 * Shared audio utilities for typewriter/soft-key/keyboard/chime typing sounds.
 * Used by Word-of-Day, Did-You-Know, and Code Video panels.
 */

export function playTypingPulse(
  ac: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  when: number,
  sound: string,
  vol: number,
  ch: string,
  accent: boolean
) {
  const ws = ch.trim().length === 0;

  if (sound === "chime") {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const notes = [523, 587, 659, 784, 880, 988, 1047];
    const noteIdx = (ch.charCodeAt(0) ?? 65) % notes.length;
    osc.type = "sine";
    osc.frequency.setValueAtTime(accent ? notes[noteIdx]! * 1.5 : notes[noteIdx]!, when);
    const pk = (accent ? 0.08 : 0.05) * vol * (ws ? 0.3 : 1);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(pk, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(gain); gain.connect(dest);
    osc.start(when); osc.stop(when + 0.09);
    return;
  }

  if (sound === "keyboard") {
    const bufLen = Math.floor(ac.sampleRate * 0.012);
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(ws ? 120 : accent ? 380 : 260, when);
    filt.Q.setValueAtTime(1.2, when);
    const gain = ac.createGain();
    const pk = (accent ? 0.22 : 0.14) * vol * (ws ? 0.5 : 1);
    gain.gain.setValueAtTime(pk, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.014);
    src.connect(filt); filt.connect(gain); gain.connect(dest);
    src.start(when); src.stop(when + 0.016);
    return;
  }

  // Original: soft / typewriter
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(sound === "typewriter" ? 900 : 700, when);
  filter.Q.setValueAtTime(0.7, when);
  osc.type = sound === "typewriter" ? "square" : "triangle";
  osc.frequency.setValueAtTime(
    sound === "typewriter"
      ? ws ? 150 : accent ? 320 : 240
      : ws ? 480 : accent ? 900 : 700,
    when
  );
  const pk =
    (sound === "typewriter"
      ? accent ? 0.12 : 0.08
      : accent ? 0.07 : 0.045) *
    vol *
    (ws ? 0.45 : 1);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(pk, when + 0.0015);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    when + (sound === "typewriter" ? 0.016 : 0.012)
  );
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + (sound === "typewriter" ? 0.018 : 0.014));
}
