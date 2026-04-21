/**
 * Stats & ELO module — persistent player statistics, ratings, and game history.
 */

const STATS_KEY = "wacko-chess-stats-v2";
const HISTORY_KEY = "wacko-chess-history-v1";
const MAX_HISTORY = 50;

// ELO constants
const ELO_BASE = 1200;
const ELO_K = 32;

export function loadExtendedStats() {
  const defaults = {
    gamesPlayed: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    chaosSurvived: 0,
    mostMutations: 0,
    eloWhite: ELO_BASE,
    eloBlack: ELO_BASE,
    eloAi: ELO_BASE,
    currentStreak: 0,
    bestStreak: 0,
    streakColor: null,
    totalCardsPlayed: 0,
    totalTurns: 0,
    totalMutations: 0,
    cardUsage: {},
    fastestWin: null,
    longestGame: 0,
  };

  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }

  // Migrate from v1
  try {
    const old = localStorage.getItem("wacko-chess-stats-v1");
    if (old) {
      const parsed = JSON.parse(old);
      return { ...defaults, ...parsed };
    }
  } catch { /* ignore */ }

  return defaults;
}

export function saveExtendedStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch { /* ignore */ }
}

export function loadGameHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGameHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch { /* ignore */ }
}

/**
 * Calculate new ELO ratings after a match.
 * result: 1 = playerA wins, 0 = playerB wins, 0.5 = draw
 */
function calculateElo(ratingA, ratingB, result) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  return {
    newA: Math.round(ratingA + ELO_K * (result - expectedA)),
    newB: Math.round(ratingB + ELO_K * ((1 - result) - expectedB)),
  };
}

/**
 * Record a completed game and update all stats.
 * @param {object} gameState - the final game state
 * @param {object} stats - current extended stats (mutated in place)
 */
export function recordGameResult(gameState, stats) {
  const { winner, turnCount, cardsPlayed, majorChaosCount, mutationStats, settings } = gameState;
  const isAi = settings.aiOpponent;
  const startTime = gameState._startTime || Date.now();
  const duration = Math.round((Date.now() - startTime) / 1000);

  // Basic counters
  stats.gamesPlayed += 1;
  if (winner === "white") stats.whiteWins += 1;
  else if (winner === "black") stats.blackWins += 1;
  else stats.draws += 1;

  stats.chaosSurvived += majorChaosCount;
  stats.mostMutations = Math.max(stats.mostMutations, mutationStats.mostOnPiece);
  stats.totalCardsPlayed += cardsPlayed;
  stats.totalTurns += turnCount;
  stats.totalMutations += mutationStats.total;

  // Game length records
  stats.longestGame = Math.max(stats.longestGame, turnCount);
  if (winner && (stats.fastestWin === null || turnCount < stats.fastestWin)) {
    stats.fastestWin = turnCount;
  }

  // Win streaks
  if (winner) {
    if (stats.streakColor === winner) {
      stats.currentStreak += 1;
    } else {
      stats.streakColor = winner;
      stats.currentStreak = 1;
    }
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
    stats.streakColor = null;
  }

  // ELO updates
  if (isAi) {
    const result = winner === "white" ? 1 : winner === "black" ? 0 : 0.5;
    const { newA, newB } = calculateElo(stats.eloWhite, stats.eloAi, result);
    stats.eloWhite = newA;
    stats.eloAi = newB;
  } else {
    const result = winner === "white" ? 1 : winner === "black" ? 0 : 0.5;
    const { newA, newB } = calculateElo(stats.eloWhite, stats.eloBlack, result);
    stats.eloWhite = newA;
    stats.eloBlack = newB;
  }

  // Track card usage from game's played cards log
  if (gameState._cardsPlayedLog) {
    for (const cardId of gameState._cardsPlayedLog) {
      stats.cardUsage[cardId] = (stats.cardUsage[cardId] || 0) + 1;
    }
  }

  // Save game to history
  const historyEntry = {
    date: Date.now(),
    winner,
    turns: turnCount,
    cards: cardsPlayed,
    chaos: majorChaosCount,
    mutations: mutationStats.total,
    duration,
    whiteName: settings.whiteName || "White",
    blackName: settings.blackName || "Black",
    isAi,
    difficulty: settings.aiDifficulty || "standard",
    intensity: settings.intensity || "standard",
  };

  const history = loadGameHistory();
  history.push(historyEntry);
  saveGameHistory(history);

  saveExtendedStats(stats);
  return stats;
}

/**
 * Get formatted stats for display.
 */
export function getDisplayStats(stats) {
  const avgTurns = stats.gamesPlayed > 0
    ? Math.round(stats.totalTurns / stats.gamesPlayed)
    : 0;
  const avgCards = stats.gamesPlayed > 0
    ? (stats.totalCardsPlayed / stats.gamesPlayed).toFixed(1)
    : "0";
  const winRate = stats.gamesPlayed > 0
    ? Math.round(((stats.whiteWins + stats.blackWins) / stats.gamesPlayed) * 100)
    : 0;

  // Top 3 cards
  const topCards = Object.entries(stats.cardUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ id, count }));

  return {
    ...stats,
    avgTurns,
    avgCards,
    winRate,
    topCards,
  };
}

/**
 * Reset all stats (with confirmation handled by caller).
 */
export function resetAllStats() {
  localStorage.removeItem(STATS_KEY);
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem("wacko-chess-stats-v1");
  return loadExtendedStats();
}
