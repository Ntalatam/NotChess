/**
 * Themes module — board color schemes and piece styling.
 * Themes affect board squares, accents, and piece rendering colors.
 */

const STORAGE_KEY = "wacko-chess-theme-v1";

export const THEMES = {
  dark: {
    id: "dark",
    name: "Dark Fantasy",
    board: {
      light: "#27283a",
      dark: "#11131d",
      seamLight: "rgba(240, 192, 64, 0.06)",
      seamDark: "rgba(0, 229, 255, 0.08)",
      crackLight: "rgba(255, 255, 255, 0.025)",
      crackDark: "rgba(255, 255, 255, 0.018)",
    },
    frame: {
      background: "#0a0b11",
      borderColor: "rgba(240, 192, 64, 0.22)",
      borderPulse: 0.12,
      innerBorder: "rgba(0, 229, 255, 0.18)",
    },
    coords: "rgba(201, 194, 223, 0.66)",
    pieces: {
      white: { fill: "#f4efff", stroke: "rgba(10, 10, 15, 0.82)", glow: "rgba(240, 192, 64, 0.56)" },
      black: { fill: "#150d20", stroke: "rgba(240, 192, 64, 0.78)", glow: "rgba(0, 229, 255, 0.3)" },
    },
  },
  classic: {
    id: "classic",
    name: "Classic Wood",
    board: {
      light: "#e8c88a",
      dark: "#a67b4b",
      seamLight: "rgba(120, 80, 30, 0.08)",
      seamDark: "rgba(60, 30, 10, 0.06)",
      crackLight: "rgba(255, 255, 255, 0.02)",
      crackDark: "rgba(0, 0, 0, 0.03)",
    },
    frame: {
      background: "#3d2b1a",
      borderColor: "rgba(180, 140, 80, 0.5)",
      borderPulse: 0.05,
      innerBorder: "rgba(160, 120, 60, 0.3)",
    },
    coords: "rgba(60, 40, 20, 0.7)",
    pieces: {
      white: { fill: "#fff8e8", stroke: "rgba(40, 20, 5, 0.7)", glow: "rgba(200, 160, 60, 0.3)" },
      black: { fill: "#1a1008", stroke: "rgba(180, 140, 60, 0.6)", glow: "rgba(100, 60, 20, 0.3)" },
    },
  },
  neon: {
    id: "neon",
    name: "Neon Cyberpunk",
    board: {
      light: "#1a0a2e",
      dark: "#0d0520",
      seamLight: "rgba(192, 38, 211, 0.12)",
      seamDark: "rgba(0, 229, 255, 0.1)",
      crackLight: "rgba(192, 38, 211, 0.04)",
      crackDark: "rgba(0, 229, 255, 0.03)",
    },
    frame: {
      background: "#05010e",
      borderColor: "rgba(192, 38, 211, 0.5)",
      borderPulse: 0.2,
      innerBorder: "rgba(0, 229, 255, 0.3)",
    },
    coords: "rgba(192, 38, 211, 0.6)",
    pieces: {
      white: { fill: "#f0e0ff", stroke: "rgba(192, 38, 211, 0.8)", glow: "rgba(192, 38, 211, 0.6)" },
      black: { fill: "#0a0216", stroke: "rgba(0, 229, 255, 0.85)", glow: "rgba(0, 229, 255, 0.5)" },
    },
  },
  ice: {
    id: "ice",
    name: "Frozen Tundra",
    board: {
      light: "#c8dce8",
      dark: "#6a8fa8",
      seamLight: "rgba(180, 220, 255, 0.1)",
      seamDark: "rgba(100, 160, 200, 0.08)",
      crackLight: "rgba(255, 255, 255, 0.06)",
      crackDark: "rgba(200, 230, 255, 0.04)",
    },
    frame: {
      background: "#1c2e3a",
      borderColor: "rgba(150, 210, 255, 0.3)",
      borderPulse: 0.08,
      innerBorder: "rgba(100, 180, 220, 0.25)",
    },
    coords: "rgba(30, 60, 80, 0.6)",
    pieces: {
      white: { fill: "#ffffff", stroke: "rgba(20, 50, 80, 0.6)", glow: "rgba(150, 210, 255, 0.4)" },
      black: { fill: "#0e1a24", stroke: "rgba(150, 210, 255, 0.7)", glow: "rgba(80, 160, 220, 0.35)" },
    },
  },
};

export const PIECE_STYLES = {
  standard: {
    id: "standard",
    name: "Standard",
    font: 'Georgia, "Times New Roman", serif',
    sizeMultiplier: 0.7,
  },
  bold: {
    id: "bold",
    name: "Bold",
    font: '"Segoe UI Symbol", "Apple Symbols", sans-serif',
    sizeMultiplier: 0.75,
  },
  elegant: {
    id: "elegant",
    name: "Elegant",
    font: '"Cinzel", Georgia, serif',
    sizeMultiplier: 0.65,
  },
};

let currentTheme = "dark";
let currentPieceStyle = "standard";

export function getTheme() {
  return THEMES[currentTheme] || THEMES.dark;
}

export function getPieceStyle() {
  return PIECE_STYLES[currentPieceStyle] || PIECE_STYLES.standard;
}

export function getThemeId() {
  return currentTheme;
}

export function getPieceStyleId() {
  return currentPieceStyle;
}

export function setTheme(themeId) {
  if (THEMES[themeId]) {
    currentTheme = themeId;
    savePreference();
  }
}

export function setPieceStyle(styleId) {
  if (PIECE_STYLES[styleId]) {
    currentPieceStyle = styleId;
    savePreference();
  }
}

export function loadThemePreference() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const pref = JSON.parse(raw);
      if (THEMES[pref.theme]) currentTheme = pref.theme;
      if (PIECE_STYLES[pref.pieceStyle]) currentPieceStyle = pref.pieceStyle;
    }
  } catch { /* ignore */ }
}

function savePreference() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: currentTheme, pieceStyle: currentPieceStyle }));
  } catch { /* ignore */ }
}
