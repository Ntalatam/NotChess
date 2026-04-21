/**
 * Accessibility module — keyboard navigation, colorblind modes,
 * reduced motion, screen reader announcements, and font scaling.
 */

const A11Y_KEY = "wacko-chess-a11y-v1";

const COLORBLIND_PALETTES = {
  none: null,
  deuteranopia: {
    white: "#e8c44a",
    black: "#4a90d9",
    highlight: "#ff6b35",
    danger: "#ff6b35",
    accent: "#4a90d9",
  },
  protanopia: {
    white: "#e8c44a",
    black: "#5b9bd5",
    highlight: "#d4a017",
    danger: "#d4a017",
    accent: "#5b9bd5",
  },
  tritanopia: {
    white: "#ff7878",
    black: "#78c8ff",
    highlight: "#ff7878",
    danger: "#ff4444",
    accent: "#78c8ff",
  },
};

let settings = loadA11ySettings();
let srAnnouncer = null;

export function loadA11ySettings() {
  const defaults = {
    colorblindMode: "none",
    reducedMotion: false,
    fontScale: 1,
    keyboardNav: true,
  };
  try {
    const raw = localStorage.getItem(A11Y_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}

export function saveA11ySettings() {
  try {
    localStorage.setItem(A11Y_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function getA11ySettings() {
  return settings;
}

export function setColorblindMode(mode) {
  settings.colorblindMode = mode;
  applyA11ySettings();
  saveA11ySettings();
}

export function setReducedMotion(enabled) {
  settings.reducedMotion = enabled;
  applyA11ySettings();
  saveA11ySettings();
}

export function setFontScale(scale) {
  settings.fontScale = Math.max(0.8, Math.min(1.4, scale));
  applyA11ySettings();
  saveA11ySettings();
}

export function getColorblindPalette() {
  return COLORBLIND_PALETTES[settings.colorblindMode] || null;
}

export function isReducedMotion() {
  // Check both user preference and OS preference
  if (settings.reducedMotion) return true;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

/**
 * Apply accessibility settings to the DOM.
 */
export function applyA11ySettings() {
  const root = document.documentElement;

  // Font scaling
  root.style.setProperty("--a11y-font-scale", String(settings.fontScale));
  root.style.fontSize = `${settings.fontScale * 100}%`;

  // Reduced motion
  root.classList.toggle("a11y-reduced-motion", settings.reducedMotion);

  // Colorblind mode class
  root.dataset.colorblind = settings.colorblindMode;

  // Apply colorblind palette as CSS custom properties
  const palette = getColorblindPalette();
  if (palette) {
    root.style.setProperty("--cb-white", palette.white);
    root.style.setProperty("--cb-black", palette.black);
    root.style.setProperty("--cb-highlight", palette.highlight);
    root.style.setProperty("--cb-danger", palette.danger);
    root.style.setProperty("--cb-accent", palette.accent);
  } else {
    root.style.removeProperty("--cb-white");
    root.style.removeProperty("--cb-black");
    root.style.removeProperty("--cb-highlight");
    root.style.removeProperty("--cb-danger");
    root.style.removeProperty("--cb-accent");
  }
}

/**
 * Initialize the screen-reader live region for move announcements.
 */
export function initScreenReaderAnnouncer() {
  if (srAnnouncer) return;
  srAnnouncer = document.createElement("div");
  srAnnouncer.id = "srAnnouncer";
  srAnnouncer.setAttribute("role", "log");
  srAnnouncer.setAttribute("aria-live", "polite");
  srAnnouncer.setAttribute("aria-atomic", "false");
  srAnnouncer.className = "sr-only";
  document.body.appendChild(srAnnouncer);
}

/**
 * Announce a message to screen readers.
 */
export function announceToScreenReader(message, priority = "polite") {
  if (!srAnnouncer) initScreenReaderAnnouncer();
  srAnnouncer.setAttribute("aria-live", priority);
  const el = document.createElement("p");
  el.textContent = message;
  srAnnouncer.appendChild(el);
  // Keep the log trimmed
  while (srAnnouncer.children.length > 20) {
    srAnnouncer.removeChild(srAnnouncer.firstChild);
  }
}

/**
 * Keyboard navigation state and handler for board interaction.
 */
export function createKeyboardNav(callbacks) {
  let cursorRow = 0;
  let cursorCol = 0;
  let active = false;

  function getCursor() {
    return { row: cursorRow, col: cursorCol };
  }

  function isActive() {
    return active;
  }

  function activate() {
    active = true;
  }

  function deactivate() {
    active = false;
  }

  function handleKey(event) {
    if (!settings.keyboardNav) return false;

    const key = event.key;

    // Arrow keys activate keyboard nav
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      if (!active) {
        active = true;
        callbacks.onCursorMove?.(cursorRow, cursorCol);
        event.preventDefault();
        return true;
      }

      const prev = { row: cursorRow, col: cursorCol };
      if (key === "ArrowUp") cursorRow = Math.max(0, cursorRow - 1);
      if (key === "ArrowDown") cursorRow = Math.min(7, cursorRow + 1);
      if (key === "ArrowLeft") cursorCol = Math.max(0, cursorCol - 1);
      if (key === "ArrowRight") cursorCol = Math.min(7, cursorCol + 1);

      if (cursorRow !== prev.row || cursorCol !== prev.col) {
        callbacks.onCursorMove?.(cursorRow, cursorCol);
      }
      event.preventDefault();
      return true;
    }

    if (!active) return false;

    if (key === "Enter" || key === " ") {
      callbacks.onSelect?.(cursorRow, cursorCol);
      event.preventDefault();
      return true;
    }

    if (key === "Escape") {
      callbacks.onCancel?.();
      return false; // let other escape handlers also run
    }

    // Tab cycles through pieces
    if (key === "Tab") {
      const next = callbacks.onTab?.(cursorRow, cursorCol, event.shiftKey);
      if (next) {
        cursorRow = next.row;
        cursorCol = next.col;
        callbacks.onCursorMove?.(cursorRow, cursorCol);
        event.preventDefault();
        return true;
      }
    }

    return false;
  }

  function setCursor(row, col) {
    cursorRow = row;
    cursorCol = col;
  }

  return { getCursor, isActive, activate, deactivate, handleKey, setCursor };
}
