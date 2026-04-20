const AUDIO_KEY = "wacko-chess-audio-muted-v1";

let audioContext = null;
let muted = loadMuted();

export function initAudioToggle(button) {
  updateButton(button);
  button.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem(AUDIO_KEY, muted ? "true" : "false");
    updateButton(button);
    playTone("card");
  });
}

export function playTone(kind = "move") {
  if (muted) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext ||= new AudioCtor();

  const play = TONE_PLAYERS[kind] || TONE_PLAYERS.move;
  play(audioContext);
}

function osc(ctx, type, freq, freqEnd, gainPeak, attack, decay, startDelay = 0) {
  const now = ctx.currentTime + startDelay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + attack + decay);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gainPeak, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + attack + decay + 0.05);
}

function noise(ctx, duration, gainPeak, startDelay = 0) {
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
  src.connect(g).connect(ctx.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

const TONE_PLAYERS = {
  move(ctx) {
    osc(ctx, "sine", 440, 520, 0.06, 0.005, 0.06);
    osc(ctx, "triangle", 880, 1040, 0.02, 0.005, 0.04);
  },
  capture(ctx) {
    osc(ctx, "sawtooth", 180, 60, 0.09, 0.005, 0.12);
    osc(ctx, "square", 360, 120, 0.03, 0.01, 0.08);
    noise(ctx, 0.08, 0.04, 0.01);
  },
  card(ctx) {
    osc(ctx, "sine", 660, 880, 0.05, 0.005, 0.05);
    osc(ctx, "triangle", 990, 1320, 0.03, 0.01, 0.06, 0.03);
    osc(ctx, "sine", 1320, 1760, 0.02, 0.01, 0.04, 0.06);
  },
  mutation(ctx) {
    osc(ctx, "sawtooth", 220, 880, 0.06, 0.01, 0.15);
    osc(ctx, "sine", 440, 1760, 0.04, 0.02, 0.12, 0.02);
    osc(ctx, "triangle", 110, 55, 0.03, 0.005, 0.1);
  },
  chaos(ctx) {
    osc(ctx, "sawtooth", 55, 30, 0.1, 0.01, 0.25);
    osc(ctx, "square", 110, 55, 0.06, 0.02, 0.2, 0.03);
    osc(ctx, "sawtooth", 165, 40, 0.04, 0.03, 0.18, 0.06);
    noise(ctx, 0.2, 0.05, 0.05);
  },
  end(ctx) {
    osc(ctx, "sine", 330, 165, 0.07, 0.01, 0.3);
    osc(ctx, "triangle", 440, 220, 0.05, 0.02, 0.25, 0.05);
    osc(ctx, "sine", 550, 275, 0.04, 0.03, 0.2, 0.1);
    osc(ctx, "sine", 220, 110, 0.03, 0.05, 0.35, 0.15);
  },
};

function updateButton(button) {
  button.textContent = muted ? "SFX Off" : "SFX On";
  button.setAttribute("aria-pressed", muted ? "false" : "true");
}

function loadMuted() {
  try {
    return localStorage.getItem(AUDIO_KEY) === "true";
  } catch {
    return false;
  }
}
