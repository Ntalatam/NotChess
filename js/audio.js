const AUDIO_KEY = "wacko-chess-audio-v2";

let audioContext = null;
let musicGainNode = null;
let sfxGainNode = null;
let musicNodes = [];
let musicPlaying = false;

let settings = loadSettings();

export function initAudioToggle(button) {
  updateButton(button);
  button.addEventListener("click", () => {
    settings.sfxMuted = !settings.sfxMuted;
    saveSettings();
    updateButton(button);
    if (!settings.sfxMuted) playTone("card");
  });
}

export function initMusicToggle(button) {
  if (!button) return;
  updateMusicButton(button);
  button.addEventListener("click", () => {
    settings.musicMuted = !settings.musicMuted;
    saveSettings();
    updateMusicButton(button);
    if (settings.musicMuted) {
      stopMusic();
    } else {
      startMusic();
    }
  });
}

export function initVolumeControls(sfxSlider, musicSlider) {
  if (sfxSlider) {
    sfxSlider.value = settings.sfxVolume;
    sfxSlider.addEventListener("input", (e) => {
      settings.sfxVolume = Number(e.target.value);
      if (sfxGainNode) sfxGainNode.gain.value = settings.sfxVolume;
      saveSettings();
    });
  }
  if (musicSlider) {
    musicSlider.value = settings.musicVolume;
    musicSlider.addEventListener("input", (e) => {
      settings.musicVolume = Number(e.target.value);
      if (musicGainNode) musicGainNode.gain.value = settings.musicVolume;
      saveSettings();
    });
  }
}

export function playTone(kind = "move") {
  if (settings.sfxMuted) return;
  ensureContext();
  if (!audioContext) return;

  const play = TONE_PLAYERS[kind] || TONE_PLAYERS.move;
  play(audioContext, sfxGainNode);
}

export function startMusic() {
  if (settings.musicMuted || musicPlaying) return;
  ensureContext();
  if (!audioContext) return;
  musicPlaying = true;
  playAmbientLoop();
}

export function stopMusic() {
  musicPlaying = false;
  if (musicNodes._timeout) clearTimeout(musicNodes._timeout);
  for (const node of musicNodes) {
    try { node.stop(); } catch { /* already stopped */ }
  }
  musicNodes = [];
}

function ensureContext() {
  if (audioContext) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext = new AudioCtor();

  // Create gain nodes for mixing
  sfxGainNode = audioContext.createGain();
  sfxGainNode.gain.value = settings.sfxVolume;
  sfxGainNode.connect(audioContext.destination);

  musicGainNode = audioContext.createGain();
  musicGainNode.gain.value = settings.musicVolume;
  musicGainNode.connect(audioContext.destination);
}

function osc(ctx, dest, type, freq, freqEnd, gainPeak, attack, decay, startDelay = 0) {
  const now = ctx.currentTime + startDelay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + attack + decay);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gainPeak, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  o.connect(g).connect(dest);
  o.start(now);
  o.stop(now + attack + decay + 0.05);
}

function noise(ctx, dest, duration, gainPeak, startDelay = 0) {
  const now = ctx.currentTime + startDelay;
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainPeak, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(g).connect(dest);
  src.start(now);
  src.stop(now + duration + 0.02);
}

const TONE_PLAYERS = {
  move(ctx, dest) {
    osc(ctx, dest, "sine", 440, 520, 0.06, 0.005, 0.06);
    osc(ctx, dest, "triangle", 880, 1040, 0.02, 0.005, 0.04);
  },
  capture(ctx, dest) {
    osc(ctx, dest, "sawtooth", 180, 60, 0.09, 0.005, 0.12);
    osc(ctx, dest, "square", 360, 120, 0.03, 0.01, 0.08);
    noise(ctx, dest, 0.08, 0.04, 0.01);
  },
  card(ctx, dest) {
    osc(ctx, dest, "sine", 660, 880, 0.05, 0.005, 0.05);
    osc(ctx, dest, "triangle", 990, 1320, 0.03, 0.01, 0.06, 0.03);
    osc(ctx, dest, "sine", 1320, 1760, 0.02, 0.01, 0.04, 0.06);
  },
  mutation(ctx, dest) {
    osc(ctx, dest, "sawtooth", 220, 880, 0.06, 0.01, 0.15);
    osc(ctx, dest, "sine", 440, 1760, 0.04, 0.02, 0.12, 0.02);
    osc(ctx, dest, "triangle", 110, 55, 0.03, 0.005, 0.1);
  },
  chaos(ctx, dest) {
    osc(ctx, dest, "sawtooth", 55, 30, 0.1, 0.01, 0.25);
    osc(ctx, dest, "square", 110, 55, 0.06, 0.02, 0.2, 0.03);
    osc(ctx, dest, "sawtooth", 165, 40, 0.04, 0.03, 0.18, 0.06);
    noise(ctx, dest, 0.2, 0.05, 0.05);
  },
  end(ctx, dest) {
    osc(ctx, dest, "sine", 330, 165, 0.07, 0.01, 0.3);
    osc(ctx, dest, "triangle", 440, 220, 0.05, 0.02, 0.25, 0.05);
    osc(ctx, dest, "sine", 550, 275, 0.04, 0.03, 0.2, 0.1);
    osc(ctx, dest, "sine", 220, 110, 0.03, 0.05, 0.35, 0.15);
  },
  check(ctx, dest) {
    osc(ctx, dest, "square", 880, 440, 0.06, 0.005, 0.08);
    osc(ctx, dest, "sawtooth", 660, 330, 0.04, 0.01, 0.06, 0.04);
    osc(ctx, dest, "square", 880, 440, 0.05, 0.005, 0.06, 0.1);
  },
  lowTime(ctx, dest) {
    osc(ctx, dest, "sine", 1200, 800, 0.04, 0.002, 0.08);
    osc(ctx, dest, "sine", 1200, 800, 0.03, 0.002, 0.06, 0.15);
  },
  turnSwitch(ctx, dest) {
    osc(ctx, dest, "sine", 520, 660, 0.03, 0.005, 0.04);
    osc(ctx, dest, "triangle", 660, 880, 0.02, 0.005, 0.03, 0.02);
  },
  select(ctx, dest) {
    osc(ctx, dest, "sine", 600, 700, 0.025, 0.003, 0.03);
  },
  invalid(ctx, dest) {
    osc(ctx, dest, "square", 200, 150, 0.04, 0.005, 0.06);
    osc(ctx, dest, "square", 180, 130, 0.03, 0.005, 0.05, 0.04);
  },
};

// ── Ambient Music Generator ──

function playAmbientLoop() {
  if (!musicPlaying || !audioContext) return;

  const now = audioContext.currentTime;
  const chords = [
    [130.81, 164.81, 196.00],  // C3 E3 G3
    [110.00, 138.59, 164.81],  // A2 C#3 E3
    [146.83, 185.00, 220.00],  // D3 F#3 A3
    [123.47, 155.56, 185.00],  // B2 D#3 F#3
  ];

  const loopDuration = 16; // 16 seconds per cycle
  const chordDuration = loopDuration / chords.length;

  chords.forEach((chord, chordIdx) => {
    const chordStart = chordIdx * chordDuration;

    chord.forEach((freq) => {
      // Pad sound — soft sine waves
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now + chordStart);

      // Slow LFO for movement
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(0.3 + Math.random() * 0.4, now);
      lfoGain.gain.setValueAtTime(freq * 0.008, now);
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);

      g.gain.setValueAtTime(0, now + chordStart);
      g.gain.linearRampToValueAtTime(0.018, now + chordStart + 0.8);
      g.gain.setValueAtTime(0.018, now + chordStart + chordDuration - 1);
      g.gain.linearRampToValueAtTime(0, now + chordStart + chordDuration);

      o.connect(g).connect(musicGainNode);
      o.start(now + chordStart);
      o.stop(now + chordStart + chordDuration + 0.1);
      lfo.start(now + chordStart);
      lfo.stop(now + chordStart + chordDuration + 0.1);
      musicNodes.push(o, lfo);
    });

    // Sub bass
    const sub = audioContext.createOscillator();
    const subG = audioContext.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(chord[0] / 2, now + chordStart);
    subG.gain.setValueAtTime(0, now + chordStart);
    subG.gain.linearRampToValueAtTime(0.025, now + chordStart + 1);
    subG.gain.setValueAtTime(0.025, now + chordStart + chordDuration - 1.2);
    subG.gain.linearRampToValueAtTime(0, now + chordStart + chordDuration);
    sub.connect(subG).connect(musicGainNode);
    sub.start(now + chordStart);
    sub.stop(now + chordStart + chordDuration + 0.1);
    musicNodes.push(sub);
  });

  // Schedule next loop
  const nextLoop = setTimeout(() => {
    musicNodes = [];
    if (musicPlaying) playAmbientLoop();
  }, (loopDuration - 0.5) * 1000);

  // Store timeout ref for cleanup
  musicNodes._timeout = nextLoop;
}

function updateButton(button) {
  button.textContent = settings.sfxMuted ? "SFX Off" : "SFX On";
  button.setAttribute("aria-pressed", settings.sfxMuted ? "false" : "true");
}

function updateMusicButton(button) {
  button.textContent = settings.musicMuted ? "Music Off" : "Music On";
  button.setAttribute("aria-pressed", settings.musicMuted ? "false" : "true");
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sfxMuted: Boolean(parsed.sfxMuted),
        musicMuted: parsed.musicMuted !== false, // default music off
        sfxVolume: parsed.sfxVolume ?? 0.7,
        musicVolume: parsed.musicVolume ?? 0.4,
      };
    }
  } catch { /* ignore */ }
  // Migrate from old key
  try {
    const old = localStorage.getItem("wacko-chess-audio-muted-v1");
    if (old === "true") return { sfxMuted: true, musicMuted: true, sfxVolume: 0.7, musicVolume: 0.4 };
  } catch { /* ignore */ }
  return { sfxMuted: false, musicMuted: true, sfxVolume: 0.7, musicVolume: 0.4 };
}

function saveSettings() {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}
