import { randomUUID } from 'node:crypto';

// players: array of { id, name }
export function createInitialState({ map, rules, players }) {
  const entities = players.map(({ id, name }) => ({
    id: id || randomUUID(),
    name,
    cash: rules.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    timeoutCount: 0,
    connected: true,
    bankrupt: false
  }));
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    status: 'active',
    winner: null,
    mapId: map.id,
    rulesId: rules.id,
    version: 1,
    turn: { index: 0, startedAt: Date.now(), deadlineAt: Date.now() + rules.turnTimeSec * 1000 },
    players: entities,
    ownership: {},
    bank: { vacationPot: 0 },
    cardIndex: { chance: 0, community: 0 },
    log: []
  };
}

export function currentPlayer(state) {
  return state.players[state.turn.index % state.players.length];
}
