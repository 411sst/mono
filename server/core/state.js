import { randomUUID } from 'node:crypto';

function shuffleDeck(n) {
  const deck = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// players: array of { id, name }
export function createInitialState({ map, rules, players }) {
  const entities = players.map(({ id, name }) => ({
    id: id || randomUUID(),
    name,
    cash: rules.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    pardonCards: 0,
    timeoutCount: 0,
    connected: true,
    bankrupt: false
  }));
  const firstPlayer = Math.floor(Math.random() * players.length);
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    status: 'active',
    winner: null,
    mapId: map.id,
    rulesId: rules.id,
    version: 1,
    turn: { index: firstPlayer, startedAt: Date.now(), deadlineAt: Date.now() + rules.turnTimeSec * 1000 },
    players: entities,
    ownership: {},
    bank: { vacationPot: 0 },
    cardDecks: { chance: shuffleDeck(17), community: shuffleDeck(17) },
    log: []
  };
}

export function currentPlayer(state) {
  return state.players[state.turn.index % state.players.length];
}
