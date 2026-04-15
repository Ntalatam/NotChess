export const MUTATION_DEFINITIONS = {
  JUMPER: {
    id: "JUMPER",
    name: "Leaper",
    badgeColor: "#00e5ff",
    effect: "Can jump over one blocking piece on a straight or diagonal path.",
  },
  GHOST: {
    id: "GHOST",
    name: "Phased",
    badgeColor: "#c026d3",
    effect: "Can pass through one occupied square while moving.",
  },
  EXPLOSIVE: {
    id: "EXPLOSIVE",
    name: "Volatile",
    badgeColor: "#ff3b5c",
    effect: "When captured, destroys pieces on the eight adjacent squares.",
  },
  SHIELD: {
    id: "SHIELD",
    name: "Shielded",
    badgeColor: "#f0c040",
    effect: "The next capture attempt against this piece fails, then the shield breaks.",
  },
  CLONER: {
    id: "CLONER",
    name: "Duplicator",
    badgeColor: "#39ff14",
    effect: "Once per game, can split into an adjacent empty square.",
  },
  BERSERKER: {
    id: "BERSERKER",
    name: "Enraged",
    badgeColor: "#ff8a2a",
    effect: "Can capture friendly pieces, except the King.",
  },
  ANCHOR: {
    id: "ANCHOR",
    name: "Rooted",
    badgeColor: "#9ca3af",
    effect: "Cannot be moved by chaos cards or board events.",
  },
  MAGNETO: {
    id: "MAGNETO",
    name: "Magnetic",
    badgeColor: "#29d3b4",
    effect: "Adjacent enemies cannot move away unless they capture it.",
  },
  REVERSO: {
    id: "REVERSO",
    name: "Reversed",
    badgeColor: "#ff6ad5",
    effect: "Legal moves are mirrored horizontally from this piece.",
  },
  TITAN: {
    id: "TITAN",
    name: "Titan",
    badgeColor: "#b88722",
    effect: "Counts as a royal threat for Wacko win checks.",
  },
  HAUNTED: {
    id: "HAUNTED",
    name: "Haunted",
    badgeColor: "#e5e7eb",
    effect: "When captured, leaves a Ghost Tile for three turns.",
  },
  WILDCARD: {
    id: "WILDCARD",
    name: "Wild",
    badgeColor: "#ffffff",
    effect: "Once per turn, can also move like a random different piece.",
  },
};

export const MUTATION_IDS = Object.keys(MUTATION_DEFINITIONS);

export function hasMutation(piece, mutationId) {
  return Boolean(piece?.mutations?.includes(mutationId));
}

export function grantMutation(piece, mutationId) {
  if (!piece || !MUTATION_DEFINITIONS[mutationId]) return false;
  if (piece.type === "k" && mutationId === "CLONER") return false;
  if (piece.mutations.includes(mutationId)) return false;
  if (piece.mutations.length >= 4) return false;
  piece.mutations.push(mutationId);
  return true;
}

export function grantRandomMutation(state, piece) {
  if (!piece || piece.mutations.length >= 4) return null;
  const candidates = MUTATION_IDS.filter((id) => !piece.mutations.includes(id) && !(piece.type === "k" && id === "CLONER"));
  if (!candidates.length) return null;
  const index = Math.floor(state.rng() * candidates.length);
  const mutationId = candidates[index];
  grantMutation(piece, mutationId);
  state.mutationStats.total += 1;
  state.mutationStats.mostOnPiece = Math.max(state.mutationStats.mostOnPiece, piece.mutations.length);
  return MUTATION_DEFINITIONS[mutationId];
}

export function removeMutation(piece, mutationId) {
  if (!piece?.mutations) return false;
  const index = piece.mutations.indexOf(mutationId);
  if (index < 0) return false;
  piece.mutations.splice(index, 1);
  return true;
}

export function getMutationTitle(piece) {
  if (!piece?.mutations?.length) return "";
  const names = piece.mutations.map((id) => MUTATION_DEFINITIONS[id].name.toUpperCase());
  return piece.mutations.length >= 3 ? `${names.join(" ")} ${piece.type.toUpperCase()}` : names.join(", ");
}

export function describeMutations(piece) {
  return (piece?.mutations || []).map((id) => MUTATION_DEFINITIONS[id]);
}
