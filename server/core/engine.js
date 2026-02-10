import { currentPlayer } from './state.js';

// --- Card decks ---

const CHANCE_CARDS = [
  { desc: 'Advance to GO',              effect: { type: 'move',  to: 0 } },
  { desc: 'Bank pays dividend',         effect: { type: 'cash',  amount: 50 } },
  { desc: 'Go to Jail',                 effect: { type: 'jail' } },
  { desc: 'Pay poor tax',               effect: { type: 'cash',  amount: -15 } },
  { desc: 'Collect building loan',      effect: { type: 'cash',  amount: 150 } },
  { desc: 'Go back 3 spaces',           effect: { type: 'back',  amount: 3 } },
  { desc: 'Speeding fine',              effect: { type: 'cash',  amount: -15 } },
  { desc: 'Bank error in your favour',  effect: { type: 'cash',  amount: 200 } },
];

const COMMUNITY_CHEST_CARDS = [
  { desc: 'Bank error in your favour',  effect: { type: 'cash',  amount: 200 } },
  { desc: "Doctor's fee",               effect: { type: 'cash',  amount: -50 } },
  { desc: 'Income tax refund',          effect: { type: 'cash',  amount: 20 } },
  { desc: 'Inheritance',                effect: { type: 'cash',  amount: 100 } },
  { desc: 'Pay hospital fees',          effect: { type: 'cash',  amount: -100 } },
  { desc: 'Holiday fund matures',       effect: { type: 'cash',  amount: 100 } },
  { desc: 'Advance to GO',              effect: { type: 'move',  to: 0 } },
  { desc: 'Insurance premium due',      effect: { type: 'cash',  amount: -50 } },
];

// --- Dice ---

function rollDice() {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  return { d1, d2, total: d1 + d2, doubles: d1 === d2 };
}

// --- Main action dispatcher ---

export function applyAction(state, action, map, rules) {
  if (state.status === 'finished') return reject('Game is already finished');
  const player = currentPlayer(state);
  if (!player || player.bankrupt) return reject('Invalid current player');

  switch (action.type) {
    case 'ROLL':    return handleRoll(state, player, map, rules);
    case 'BUY':     return handleBuy(state, player, map, rules);
    case 'END_TURN': return handleEndTurn(state, player, rules);
    case 'PAY_JAIL': return handlePayJail(state, player, map, rules);
    default:        return reject('Unsupported action');
  }
}

// --- Action handlers ---

function handleRoll(state, player, map, rules) {
  if (player.inJail) return handleJailRoll(state, player, map, rules);

  const dice = rollDice();
  const oldPos = player.position;
  player.position = (oldPos + dice.total) % map.spaces.length;
  const passedGo = oldPos + dice.total >= map.spaces.length;
  if (passedGo || player.position === 0) {
    player.cash += rules.goSalary;
    state.log.push({ t: Date.now(), type: 'GO_SALARY', playerId: player.id, amount: rules.goSalary });
  }
  const space = map.spaces[player.position];
  state.log.push({ t: Date.now(), type: 'ROLL', playerId: player.id, d1: dice.d1, d2: dice.d2, landed: space.name });
  resolveSpace(state, player, space, rules, map);
  checkBankruptcy(state, player, map);
  checkWin(state);
  advanceTurn(state, rules);
  return accept(state, { d1: dice.d1, d2: dice.d2, space });
}

function handleJailRoll(state, player, map, rules) {
  const dice = rollDice();
  state.log.push({ t: Date.now(), type: 'JAIL_ROLL', playerId: player.id, d1: dice.d1, d2: dice.d2 });

  if (dice.doubles) {
    // Escape on doubles — move without collecting GO salary
    player.inJail = false;
    player.jailTurns = 0;
    player.position = (rules.jailIndex + dice.total) % map.spaces.length;
    const space = map.spaces[player.position];
    state.log.push({ t: Date.now(), type: 'JAIL_ESCAPE', playerId: player.id, landed: space.name });
    resolveSpace(state, player, space, rules, map);
    checkBankruptcy(state, player, map);
    checkWin(state);
    advanceTurn(state, rules);
    return accept(state, { d1: dice.d1, d2: dice.d2, space, jailEscape: true });
  }

  player.jailTurns += 1;
  if (player.jailTurns >= 3) {
    // Force out after 3 turns — pay fine
    player.cash -= rules.jailFine;
    player.inJail = false;
    player.jailTurns = 0;
    player.position = (rules.jailIndex + dice.total) % map.spaces.length;
    const space = map.spaces[player.position];
    state.log.push({ t: Date.now(), type: 'JAIL_FORCE_OUT', playerId: player.id, fine: rules.jailFine, landed: space.name });
    resolveSpace(state, player, space, rules, map);
    checkBankruptcy(state, player, map);
    checkWin(state);
    advanceTurn(state, rules);
    return accept(state, { d1: dice.d1, d2: dice.d2, space, jailForceOut: true });
  }

  // Stay in jail — turn wasted
  advanceTurn(state, rules);
  return accept(state, { d1: dice.d1, d2: dice.d2, stayedInJail: true });
}

function handlePayJail(state, player, map, rules) {
  if (!player.inJail) return reject('Not in jail');
  player.cash -= rules.jailFine;
  player.inJail = false;
  player.jailTurns = 0;
  state.log.push({ t: Date.now(), type: 'PAY_JAIL', playerId: player.id, fine: rules.jailFine });
  // Don't advance turn — player now rolls
  state.version += 1;
  return { ok: true, state, payload: { paidJail: true } };
}

function handleBuy(state, player, map, rules) {
  const space = map.spaces[player.position];
  if (!space || !['Property', 'Railroad', 'Utility'].includes(space.type)) return reject('Not purchasable');
  if (state.ownership[space.index]) return reject('Already owned');
  if (player.cash < space.price) return reject('Insufficient cash');
  player.cash -= space.price;
  state.ownership[space.index] = { ownerId: player.id, mortgaged: false, houses: 0 };
  state.log.push({ t: Date.now(), type: 'BUY', playerId: player.id, space: space.index });
  state.version += 1;
  return { ok: true, state, payload: { bought: space.index } };
}

function handleEndTurn(state, player, rules) {
  state.log.push({ t: Date.now(), type: 'END_TURN', playerId: player.id });
  advanceTurn(state, rules);
  return accept(state, {});
}

// --- Space resolution ---

function resolveSpace(state, player, space, rules, map) {
  switch (space.type) {
    case 'Tax':
      player.cash -= space.amount;
      state.bank.vacationPot += space.amount;
      break;
    case 'FreeParking':
      player.cash += state.bank.vacationPot;
      state.bank.vacationPot = 0;
      break;
    case 'GoToJail':
      player.position = rules.jailIndex;
      player.inJail = true;
      player.jailTurns = 0;
      break;
    case 'Chance':
      applyCard(state, player, map, rules, 'chance');
      break;
    case 'CommunityChest':
      applyCard(state, player, map, rules, 'community');
      break;
    case 'Property':
    case 'Railroad':
    case 'Utility':
      resolveOwnable(state, player, space, rules, map);
      break;
  }
}

function applyCard(state, player, map, rules, deck) {
  const cards = deck === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
  const idx = state.cardIndex[deck] % cards.length;
  state.cardIndex[deck] = (idx + 1) % cards.length;
  const card = cards[idx];
  state.log.push({ t: Date.now(), type: 'CARD', playerId: player.id, deck, desc: card.desc });

  const { effect } = card;
  if (effect.type === 'cash') {
    player.cash += effect.amount;
    if (effect.amount < 0) state.bank.vacationPot -= effect.amount;
  } else if (effect.type === 'move') {
    const oldPos = player.position;
    player.position = effect.to;
    if (effect.to < oldPos) {
      player.cash += rules.goSalary;
      state.log.push({ t: Date.now(), type: 'GO_SALARY', playerId: player.id, amount: rules.goSalary });
    }
    const space = map.spaces[player.position];
    resolveSpace(state, player, space, rules, map);
  } else if (effect.type === 'back') {
    const newPos = (player.position - effect.amount + map.spaces.length) % map.spaces.length;
    player.position = newPos;
    const space = map.spaces[newPos];
    resolveSpace(state, player, space, rules, map);
  } else if (effect.type === 'jail') {
    player.position = rules.jailIndex;
    player.inJail = true;
    player.jailTurns = 0;
  }
}

function resolveOwnable(state, player, space, rules, map) {
  const ownership = state.ownership[space.index];
  if (!ownership || ownership.ownerId === player.id || ownership.mortgaged) return;
  const owner = state.players.find((p) => p.id === ownership.ownerId);
  if (!owner) return;
  if (rules.jailBlocksRent && owner.inJail) return;

  let rent;
  if (space.type === 'Railroad') {
    const ownedRailroads = Object.entries(state.ownership)
      .filter(([, o]) => o.ownerId === owner.id)
      .map(([idx]) => map.spaces[Number(idx)])
      .filter((s) => s?.type === 'Railroad').length;
    rent = space.rent[Math.min(ownedRailroads - 1, space.rent.length - 1)];
  } else if (space.type === 'Utility') {
    const ownedUtils = Object.entries(state.ownership)
      .filter(([, o]) => o.ownerId === owner.id)
      .map(([idx]) => map.spaces[Number(idx)])
      .filter((s) => s?.type === 'Utility').length;
    // Use a fresh dice roll for utility rent
    const dice = rollDice();
    const multiplier = ownedUtils >= 2 ? rules.utilityDiceMultiplierBoth : rules.utilityDiceMultiplierOne;
    rent = dice.total * multiplier;
    state.log.push({ t: Date.now(), type: 'UTILITY_ROLL', playerId: player.id, d1: dice.d1, d2: dice.d2 });
  } else {
    const baseRent = Array.isArray(space.rent) ? space.rent[ownership.houses] : Math.max(10, Math.floor((space.price || 100) * 0.1));
    const monopoly = isMonopolyOwned(state, owner.id, map, space.group);
    rent = (ownership.houses === 0 && monopoly && rules.doubleRentOnSet) ? baseRent * 2 : baseRent;
  }

  player.cash -= rent;
  owner.cash += rent;
  state.log.push({ t: Date.now(), type: 'RENT', playerId: player.id, ownerId: owner.id, space: space.index, amount: rent });
}

// --- Bankruptcy & win ---

function checkBankruptcy(state, player, map) {
  if (player.cash >= 0) return;
  player.bankrupt = true;
  player.cash = 0;
  // Forfeit all owned properties back to the bank
  for (const [idx, ownership] of Object.entries(state.ownership)) {
    if (ownership.ownerId === player.id) delete state.ownership[idx];
  }
  state.log.push({ t: Date.now(), type: 'BANKRUPT', playerId: player.id });
}

function checkWin(state) {
  const active = state.players.filter((p) => !p.bankrupt);
  if (active.length === 1) {
    state.status = 'finished';
    state.winner = active[0].id;
    state.log.push({ t: Date.now(), type: 'GAME_OVER', winnerId: active[0].id });
  }
}

// --- Helpers ---

function isMonopolyOwned(state, ownerId, map, group) {
  const groupSpaces = map.spaces.filter((s) => s.group === group).map((s) => String(s.index));
  if (groupSpaces.length === 0) return false;
  return groupSpaces.every((idx) => state.ownership[idx]?.ownerId === ownerId);
}

function advanceTurn(state, rules) {
  // Skip bankrupt players
  let next = (state.turn.index + 1) % state.players.length;
  let safety = 0;
  while (state.players[next].bankrupt && safety++ < state.players.length) {
    next = (next + 1) % state.players.length;
  }
  state.turn.index = next;
  state.turn.startedAt = Date.now();
  state.turn.deadlineAt = Date.now() + rules.turnTimeSec * 1000;
  state.version += 1;
}

function accept(state, payload) {
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
  checkBankruptcy(state, player);
  checkWin(state);
  advanceTurn(state, rules);
  return state;
}
