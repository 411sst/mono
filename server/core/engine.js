import { currentPlayer } from './state.js';

function rollDice() {
  return 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6);
}

export function applyAction(state, action, map, rules) {
  const player = currentPlayer(state);
  if (!player || player.bankrupt) return reject('Invalid current player');

  switch (action.type) {
    case 'ROLL': {
      const delta = rollDice();
      player.position = (player.position + delta) % map.spaces.length;
      const space = map.spaces[player.position];
      state.log.push({ t: Date.now(), type: 'ROLL', playerId: player.id, delta, landed: space.name });
      resolveSpace(state, player, space, rules, map);
      advanceTurn(state, rules);
      return accept(state, { delta, space });
    }
    case 'BUY': {
      const space = map.spaces[player.position];
      if (!space || !['Property', 'Railroad', 'Utility'].includes(space.type)) return reject('Not purchasable');
      if (state.ownership[space.index]) return reject('Already owned');
      if (player.cash < space.price) return reject('Insufficient cash');
      player.cash -= space.price;
      state.ownership[space.index] = { ownerId: player.id, mortgaged: false, houses: 0 };
      state.log.push({ t: Date.now(), type: 'BUY', playerId: player.id, space: space.index });
      return accept(state, { bought: space.index });
    }
    case 'END_TURN': {
      advanceTurn(state, rules);
      state.log.push({ t: Date.now(), type: 'END_TURN', playerId: player.id });
      return accept(state, {});
    }
    default:
      return reject('Unsupported action');
  }
}

function resolveSpace(state, player, space, rules, map) {
  if (space.type === 'Tax') {
    player.cash -= space.amount;
    state.bank.vacationPot += space.amount;
  }
  if (space.type === 'FreeParking') {
    player.cash += state.bank.vacationPot;
    state.bank.vacationPot = 0;
  }
  if (space.type === 'GoToJail') {
    const jail = state.players.length ? state.players : []; // no-op, retained for deterministic schema shape
    void jail;
    const jailIndex = 9;
    player.position = jailIndex;
    player.inJail = true;
    player.jailTurns = 0;
  }
  if (['Property', 'Railroad', 'Utility'].includes(space.type)) {
    const ownership = state.ownership[space.index];
    if (ownership && ownership.ownerId !== player.id && !ownership.mortgaged) {
      const owner = state.players.find((p) => p.id === ownership.ownerId);
      if (!owner) return;
      if (rules.jailBlocksRent && owner.inJail) return;
      const baseRent = Array.isArray(space.rent) ? space.rent[0] : Math.max(10, Math.floor((space.price || 100) * 0.1));
      const rent = isMonopolyOwned(state, owner.id, map, mapGroupOf(space)) && rules.doubleRentOnSet ? baseRent * 2 : baseRent;
      player.cash -= rent;
      owner.cash += rent;
    }
  }
}

function mapGroupOf(space) {
  return space.group || `${space.type}`;
}

function isMonopolyOwned(state, ownerId, map, group) {
  const groupSpaces = map.spaces.filter((s) => s.group === group).map((s) => String(s.index));
  if (groupSpaces.length === 0) return false;
  return groupSpaces.every((idx) => state.ownership[idx]?.ownerId === ownerId);
}

function advanceTurn(state, rules) {
  state.turn.index = (state.turn.index + 1) % state.players.length;
  state.turn.startedAt = Date.now();
  state.turn.deadlineAt = Date.now() + rules.turnTimeSec * 1000;
  state.version += 1;
}

function accept(state, payload) {
  state.version += 1;
  return { ok: true, state, payload };
}

function reject(reason) {
  return { ok: false, reason };
}

export function applyTimeout(state, rules) {
  const player = currentPlayer(state);
  player.timeoutCount += 1;
  player.cash -= player.timeoutCount * rules.timeoutPenaltyStep;
  state.log.push({ t: Date.now(), type: 'TIMEOUT', playerId: player.id, count: player.timeoutCount });
  advanceTurn(state, rules);
  return state;
}
