// Synthesizes the bundled notification tones as 16-bit mono WAVs into
// resources/sounds/. Run once (or after tweaking a tone): node scripts/make-sounds.mjs
// They are copied into android res/raw by scripts/patch-android.mjs.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'sounds');
mkdirSync(OUT, { recursive: true });

// note: freq in Hz, start/dur in seconds, decay = exponential fade speed
function render(notes, totalDur) {
  const n = Math.floor(totalDur * RATE);
  const buf = new Float64Array(n);
  for (const { freq, start, dur, amp = 0.5, decay = 6 } of notes) {
    const s0 = Math.floor(start * RATE), s1 = Math.min(n, Math.floor((start + dur) * RATE));
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / RATE;
      const env = Math.exp(-decay * t) * Math.min(1, t * 200); // fast attack, exp decay
      buf[i] += amp * env * Math.sin(2 * Math.PI * freq * t);
    }
  }
  return buf;
}

function wav(samples) {
  const n = samples.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const tones = {
  // two-note bell: C6 then E6, ringing out
  ff_chime: render([
    { freq: 1046.5, start: 0, dur: 1.0, amp: 0.45, decay: 5 },
    { freq: 2093.0, start: 0, dur: 1.0, amp: 0.12, decay: 7 },     // octave shimmer
    { freq: 1318.5, start: 0.18, dur: 1.2, amp: 0.45, decay: 4 },
    { freq: 2637.0, start: 0.18, dur: 1.2, amp: 0.10, decay: 6 }
  ], 1.5),
  // three insistent A5 beeps
  ff_urgent: render([
    { freq: 880, start: 0.00, dur: 0.14, amp: 0.55, decay: 10 },
    { freq: 880, start: 0.24, dur: 0.14, amp: 0.55, decay: 10 },
    { freq: 880, start: 0.48, dur: 0.20, amp: 0.55, decay: 8 },
    { freq: 1760, start: 0.48, dur: 0.20, amp: 0.15, decay: 10 }
  ], 0.85),
  // single low mellow tone
  ff_soft: render([
    { freq: 528, start: 0, dur: 1.1, amp: 0.40, decay: 3.5 },
    { freq: 1056, start: 0, dur: 1.1, amp: 0.08, decay: 5 }
  ], 1.2),
  // quick rising arpeggio
  ff_digital: render([
    { freq: 659.3, start: 0.00, dur: 0.10, amp: 0.5, decay: 12 },
    { freq: 880.0, start: 0.10, dur: 0.10, amp: 0.5, decay: 12 },
    { freq: 1108.7, start: 0.20, dur: 0.30, amp: 0.5, decay: 8 }
  ], 0.6)
};

for (const [name, samples] of Object.entries(tones)) {
  const f = join(OUT, name + '.wav');
  writeFileSync(f, wav(samples));
  console.log('wrote', f);
}
