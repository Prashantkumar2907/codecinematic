/**
 * Shared audio utilities for typewriter/soft-key typing sounds.
 * Used by Word-of-Day and Did-You-Know panels.
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
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(sound === "typewriter" ? 900 : 700, when);
  filter.Q.setValueAtTime(0.7, when);
  const ws = ch.trim().length === 0;
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
