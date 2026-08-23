/**
 * Deterministic, in-repo background music -- one distinct instrumental bed
 * per video template, generated as raw PCM and written out as a WAV file.
 * No dependency, no download, no licensing question: the audio is owned
 * outright because nothing outside this file produced it.
 *
 * This yields ambient/electronic beds (sine/saw/triangle oscillators over a
 * chord progression, filtered and soft-clipped) -- the right register for
 * app promos, not a substitute for orchestral or vocal music. A user's own
 * `bgm` upload (video/project.ts) still overrides the generated track.
 */

export interface BgmPreset {
  bpm: number;
  /** Root note name, e.g. "C3", "A2". */
  key: string;
  /** Semitone offsets from the root per chord, one array per bar; cycles
   *  when the rendered duration exceeds the progression length. */
  chords: number[][];
  voices: ("pad" | "pluck" | "bass" | "sub" | "noise-hat")[];
  /** One-pole low-pass cutoff in Hz -- lower reads darker/softer. */
  filterHz: number;
  /** Documentation only -- not read by the renderer. */
  mood: string;
}

/** One preset per video template id (src/video/templates.ts). */
export const BGM_PRESETS: Record<string, BgmPreset> = {
  "iphone-15-pro-portrait": {
    bpm: 84,
    key: "D3",
    chords: [[0, 4, 7], [0, 3, 7], [-2, 2, 5], [0, 4, 7]],
    voices: ["pad", "sub"],
    filterHz: 2600,
    mood: "sophisticated, restrained ambient",
  },
  "iphone-15-pro-landscape": {
    bpm: 96,
    key: "C3",
    chords: [[0, 4, 7], [9, 12, 16], [7, 11, 14], [0, 4, 7]],
    voices: ["pad", "bass", "pluck"],
    filterHz: 3800,
    mood: "cinematic, premium reveal",
  },
  "pixel-9-pro-portrait": {
    bpm: 100,
    key: "A2",
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
    voices: ["pad", "pluck", "bass"],
    filterHz: 3400,
    mood: "warm corporate, confident",
  },
  "pixel-9-pro-landscape": {
    bpm: 108,
    key: "G2",
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
    voices: ["pad", "pluck", "bass", "sub"],
    filterHz: 3600,
    mood: "smooth dynamic modern",
  },
  "galaxy-s25-portrait": {
    bpm: 88,
    key: "E2",
    chords: [[0, 3, 7], [-3, 0, 4], [5, 8, 12], [0, 3, 7]],
    voices: ["pad", "sub", "bass"],
    filterHz: 2000,
    mood: "dark, weighty, premium",
  },
  "galaxy-s25-landscape": {
    bpm: 92,
    key: "D2",
    chords: [[0, 3, 7], [-3, 0, 4], [5, 8, 12], [0, 3, 7]],
    voices: ["pad", "sub", "bass", "pluck"],
    filterHz: 2200,
    mood: "authoritative, dark enterprise",
  },
  "iphone-16-pro-portrait": {
    bpm: 78,
    key: "F3",
    chords: [[0, 4, 7], [-3, 0, 4], [2, 5, 9], [0, 4, 7]],
    voices: ["pad"],
    filterHz: 2200,
    mood: "airy, calm, unhurried",
  },
  "iphone-16-pro-landscape": {
    bpm: 82,
    key: "E3",
    chords: [[0, 4, 7], [-3, 0, 4], [2, 5, 9], [0, 4, 7]],
    voices: ["pad", "pluck"],
    filterHz: 2500,
    mood: "clean, serene, minimal",
  },
  "pixel-9-portrait": {
    bpm: 122,
    key: "E2",
    chords: [[0, 3, 7], [0, 3, 7], [5, 8, 12], [3, 7, 10]],
    voices: ["pluck", "bass", "noise-hat"],
    filterHz: 4200,
    mood: "energetic, driving",
  },
  "pixel-9-landscape": {
    bpm: 126,
    key: "A2",
    chords: [[0, 3, 7], [0, 3, 7], [5, 8, 12], [3, 7, 10]],
    voices: ["pluck", "bass", "noise-hat", "pad"],
    filterHz: 4400,
    mood: "high energy, promotional",
  },
  "tpl-1371526-hud-blueprint": {
    bpm: 91,
    key: "D3",
    chords: [[0, 4, 7], [0, 3, 7], [-2, 2, 5], [0, 4, 7]],
    voices: ["pad", "sub"],
    filterHz: 2800,
    mood: "hud tech blueprint theme",
  },
  "tpl-23393372-neon-rings": {
    bpm: 105,
    key: "G2",
    chords: [[0, 3, 7], [0, 3, 7], [5, 8, 12], [3, 7, 10]],
    voices: ["pluck", "bass", "noise-hat"],
    filterHz: 3600,
    mood: "neon energetic theme",
  },
  "tpl-23552607-minimal-studio-3d": {
    bpm: 81,
    key: "C3",
    chords: [[0, 4, 7], [9, 12, 16], [7, 11, 14], [0, 4, 7]],
    voices: ["pad", "pluck"],
    filterHz: 2400,
    mood: "serene studio showcase theme",
  },
  "tpl-27720310-dark-matte-spheres": {
    bpm: 97,
    key: "E2",
    chords: [[0, 3, 7], [-3, 0, 4], [5, 8, 12], [0, 3, 7]],
    voices: ["pad", "sub", "bass"],
    filterHz: 2100,
    mood: "cyber obsidian theme",
  },
  "tpl-38180229-minimal-skyblue": {
    bpm: 109,
    key: "F3",
    chords: [[0, 4, 7], [-3, 0, 4], [2, 5, 9], [0, 4, 7]],
    voices: ["pad", "pluck", "noise-hat"],
    filterHz: 3000,
    mood: "clean minimalist skyblue theme",
  },
  "tpl-62155880-delivery-trio-showcase": {
    bpm: 101,
    key: "A2",
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
    voices: ["pad", "bass", "pluck", "noise-hat"],
    filterHz: 3200,
    mood: "dynamic delivery showcase theme",
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

/** "A2" -> Hz, via MIDI note number (A4 = 440Hz = MIDI 69). */
function noteToFreq(note: string): number {
  const m = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 220;
  const [, name, octaveStr] = m;
  const octave = Number(octaveStr);
  const midi = NOTE_INDEX[name] + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function semitoneToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Renders `seconds` of the preset's progression as 16-bit stereo PCM,
 *  wrapped in a WAV header. Deterministic: same preset + duration always
 *  produces the same bytes. */
export function renderBgmWav(preset: BgmPreset, seconds: number): Buffer {
  const sampleRate = 44100;
  const totalSamples = Math.max(1, Math.round(seconds * sampleRate));
  const beatsPerBar = 4;
  const barSeconds = (60 / preset.bpm) * beatsPerBar;
  const rootFreq = noteToFreq(preset.key);

  const samples = new Float32Array(totalSamples);
  const hasVoice = (v: BgmPreset["voices"][number]) => preset.voices.includes(v);

  // Deterministic pseudo-random noise for the hat voice -- xorshift, no
  // external RNG dependency, same output every run.
  let noiseState = 0x9e3779b9;
  function nextNoise(): number {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    noiseState >>>= 0;
    return (noiseState / 0xffffffff) * 2 - 1;
  }

  for (let n = 0; n < totalSamples; n++) {
    const t = n / sampleRate;
    const barIndex = Math.floor(t / barSeconds);
    const chord = preset.chords[barIndex % preset.chords.length];
    const barT = t - barIndex * barSeconds;
    const beatT = barT % (barSeconds / beatsPerBar);
    const beatIndex = Math.floor(barT / (barSeconds / beatsPerBar));

    let v = 0;

    if (hasVoice("pad")) {
      // Sustained triangle-ish sum across the chord tones, gently swelling
      // per bar so it doesn't read as a flat drone.
      const swell = 0.75 + 0.25 * Math.sin((Math.PI * barT) / barSeconds);
      for (const semi of chord) {
        const f = rootFreq * semitoneToRatio(semi);
        v += 0.11 * swell * Math.sin(2 * Math.PI * f * t);
      }
    }
    if (hasVoice("bass")) {
      const f = rootFreq * semitoneToRatio(chord[0]) * 0.5;
      const env = Math.max(0, 1 - beatT / (barSeconds / beatsPerBar / 1.4));
      v += 0.22 * env * Math.sin(2 * Math.PI * f * t);
    }
    if (hasVoice("sub")) {
      const f = rootFreq * semitoneToRatio(chord[0]) * 0.25;
      v += 0.14 * Math.sin(2 * Math.PI * f * t);
    }
    if (hasVoice("pluck")) {
      // A short-decay note on beats 0 and 2, cycling through the chord tones.
      if (beatIndex % 2 === 0) {
        const semi = chord[(barIndex + beatIndex) % chord.length];
        const f = rootFreq * semitoneToRatio(semi) * 2;
        const attackT = beatT;
        const env = Math.exp(-attackT * 7);
        v += 0.18 * env * Math.sin(2 * Math.PI * f * t);
      }
    }
    if (hasVoice("noise-hat")) {
      // A brief filtered noise burst on off-beats for rhythmic texture.
      if (beatIndex % 2 === 1 && beatT < 0.04) {
        const env = 1 - beatT / 0.04;
        v += 0.06 * env * nextNoise();
      }
    }

    samples[n] = v;
  }

  // One-pole low-pass -- softens harmonics above filterHz without a full
  // biquad implementation; sufficient for an ambient bed, not a synth lead.
  const rc = 1 / (2 * Math.PI * preset.filterHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let n = 0; n < totalSamples; n++) {
    prev = prev + alpha * (samples[n] - prev);
    samples[n] = prev;
  }

  // Soft clip + overall headroom, then 16-bit PCM, duplicated to stereo.
  const pcm = Buffer.alloc(totalSamples * 4);
  for (let n = 0; n < totalSamples; n++) {
    const clipped = Math.tanh(samples[n] * 1.6) * 0.82;
    const int16 = Math.max(-32768, Math.min(32767, Math.round(clipped * 32767)));
    pcm.writeInt16LE(int16, n * 4);
    pcm.writeInt16LE(int16, n * 4 + 2);
  }

  const byteRate = sampleRate * 2 * 2; // channels * bytesPerSample
  const blockAlign = 2 * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // channels
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
