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

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const tones = {
    move: [260, 0.045],
    capture: [120, 0.08],
    card: [520, 0.06],
    mutation: [720, 0.075],
    chaos: [88, 0.16],
    end: [180, 0.2],
  };
  const [frequency, duration] = tones[kind] || tones.move;

  oscillator.type = kind === "chaos" ? "sawtooth" : "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.58), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

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
