import { currentPlayer } from './state.js';

// --- Card decks ---

// Surprise cards (Chance) — 17 cards from richup.io
// Cards 9, 12, 17 are "advance to random city" (replacing specific city advances)
const CHANCE_CARDS = [
  { desc: 'Advance to the next airport',                                  effect: { type: 'nearestRailroad' } },
  { desc: 'Go back 3 steps',                                              effect: { type: 'back',        amount: 3 } },
  { desc: 'Advance to Start',                                             effect: { type: 'move',        to: 0 } },
  { desc: 'Pay tax of $20',                                               effect: { type: 'cash',        amount: -20 } },
  { desc: 'Advance to the next company',                                  effect: { type: 'nearestUtility' } },
  { desc: 'Stock agency pays you dividend of $60',                        effect: { type: 'cash',        amount: 60 } },
  { desc: 'Got a Pardon card from the surprises stack',                   effect: { type: 'pardon' } },
  { desc: 'Go to prison',                                                 effect: { type: 'jail' } },
  { desc: 'Advance to a random city',                                     effect: { type: 'randomCity' } },
  { desc: 'You have a new investment. Receive $150',                      effect: { type: 'cash',        amount: 150 } },
  { desc: 'You lost a bet. Pay each player $50',                          effect: { type: 'eachPlayer',  amount: -50 } },
  { desc: 'Advance to a random city',                                     effect: { type: 'randomCity' } },
  { desc: 'Have a redesign for your properties. Pay $25/house $100/hotel',effect: { type: 'renovation',  houseCost: 25, hotelCost: 100 } },
  { desc: 'From a scholarship you get $100',                              effect: { type: 'cash',        amount: 100 } },
  { desc: 'Take a trip to the nearest airport',                           effect: { type: 'nearestRailroad' } },
  { desc: 'Your cousin needs some financial assistance. Pay $50',         effect: { type: 'cash',        amount: -50 } },
  { desc: 'Advance to a random city',                                     effect: { type: 'randomCity' } },
];

// Treasure cards (Community Chest) — 17 cards from richup.io
const COMMUNITY_CHEST_CARDS = [
  { desc: 'Happy holidays — receive $20',                                 effect: { type: 'cash',        amount: 20 } },
  { desc: 'From trading stocks you earned $50',                           effect: { type: 'cash',        amount: 50 } },
  { desc: 'You received $100 from your sibling',                          effect: { type: 'cash',        amount: 100 } },
  { desc: 'Advance to Start',                                             effect: { type: 'move',        to: 0 } },
  { desc: 'Go to prison',                                                 effect: { type: 'jail' } },
  { desc: 'From gift cards you get $100',                                 effect: { type: 'cash',        amount: 100 } },
  { desc: 'You found a wallet containing some cash. Collect $200',        effect: { type: 'cash',        amount: 200 } },
  { desc: 'You have won third prize in a lottery. Collect $15',           effect: { type: 'cash',        amount: 15 } },
  { desc: "It's time to renovate. Pay $30/house $120/hotel",              effect: { type: 'renovation',  houseCost: 30, hotelCost: 120 } },
  { desc: 'Beneficial business decisions. You made a profit of $25',      effect: { type: 'cash',        amount: 25 } },
  { desc: 'Tax refund. Collect $100',                                     effect: { type: 'cash',        amount: 100 } },
  { desc: 'Your phone died. Pay $50 for a repair',                        effect: { type: 'cash',        amount: -50 } },
  { desc: 'Got a Pardon card from the treasures stack',                   effect: { type: 'pardon' } },
  { desc: 'You host a party. Collect $50 from every player',              effect: { type: 'eachPlayer',  amount: 50 } },
  { desc: 'Your car has run out of gas. Pay $50',                         effect: { type: 'cash',        amount: -50 } },
  { desc: 'Happy birthday! Collect $10 from every player',                effect: { type: 'eachPlayer',  amount: 10 } },
  { desc: 'Car rental insurance. Pay $60',                                effect: { type: 'cash',        amount: -60 } },
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
    case 'ROLL':      return handleRoll(state, player, map, rules);
    case 'BUY':       return handleBuy(state, player, map, rules);
    case 'END_TURN':  return handleEndTurn(state, player, rules);
    case 'PAY_JAIL':  return handlePayJail(state, player, map, rules);
    case 'USE_PARDON': return handleUsePardon(state, player, map, rules);
    default:          return reject('Unsupported action');
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

function handleUsePardon(state, player, map, rules) {
  if (!player.inJail) return reject('Not in jail');
  if (!player.pardonCards || player.pardonCards < 1) return reject('No Pardon card');
  player.pardonCards -= 1;
  player.inJail = false;
  player.jailTurns = 0;
  state.log.push({ t: Date.now(), type: 'USE_PARDON', playerId: player.id });
  // Player now rolls freely next action — don't advance turn
  state.version += 1;
  return { ok: true, state, payload: { usedPardon: true } };
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
    case 'TaxRefund':
      player.cash += space.amount;
      state.log.push({ t: Date.now(), type: 'TAX_REFUND', playerId: player.id, amount: space.amount });
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

function shuffleDeck(n) {
  const deck = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function applyCard(state, player, map, rules, deck) {
  const cards = deck === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
  const deckState = state.cardDecks[deck];
  if (deckState.length === 0) {
    // Deck exhausted — reshuffle
    deckState.push(...shuffleDeck(cards.length));
  }
  const idx = deckState.shift();
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

  } else if (effect.type === 'pardon') {
    player.pardonCards = (player.pardonCards || 0) + 1;
    state.log.push({ t: Date.now(), type: 'PARDON_RECEIVED', playerId: player.id });

  } else if (effect.type === 'eachPlayer') {
    // Positive amount = collect from each other; negative = pay each other
    const others = state.players.filter((p) => !p.bankrupt && p.id !== player.id);
    for (const other of others) {
      player.cash += effect.amount;
      other.cash -= effect.amount;
    }
    state.log.push({ t: Date.now(), type: 'EACH_PLAYER', playerId: player.id, amount: effect.amount });

  } else if (effect.type === 'renovation') {
    let total = 0;
    for (const [idx, ownership] of Object.entries(state.ownership)) {
      if (ownership.ownerId !== player.id) continue;
      const space = map.spaces[Number(idx)];
      const group = space && space.group ? map.groups?.[space.group] : null;
      const maxHouses = group?.maxHouses ?? 4;
      if (ownership.houses >= maxHouses) {
        total += effect.hotelCost;  // max houses = hotel
      } else {
        total += ownership.houses * effect.houseCost;
      }
    }
    player.cash -= total;
    if (total > 0) state.bank.vacationPot += total;
    state.log.push({ t: Date.now(), type: 'RENOVATION', playerId: player.id, amount: total });

  } else if (effect.type === 'nearestRailroad') {
    const pos = player.position;
    const railroads = map.spaces
      .filter((s) => s.type === 'Railroad')
      .map((s) => s.index)
      .sort((a, b) => a - b);
    if (railroads.length > 0) {
      const next = railroads.find((r) => r > pos) ?? railroads[0];
      if (next <= pos) {
        player.cash += rules.goSalary;
        state.log.push({ t: Date.now(), type: 'GO_SALARY', playerId: player.id, amount: rules.goSalary });
      }
      player.position = next;
      resolveSpace(state, player, map.spaces[next], rules, map);
    }

  } else if (effect.type === 'nearestUtility') {
    const pos = player.position;
    const utilities = map.spaces
      .filter((s) => s.type === 'Utility')
      .map((s) => s.index)
      .sort((a, b) => a - b);
    if (utilities.length > 0) {
      const next = utilities.find((u) => u > pos) ?? utilities[0];
      if (next <= pos) {
        player.cash += rules.goSalary;
        state.log.push({ t: Date.now(), type: 'GO_SALARY', playerId: player.id, amount: rules.goSalary });
      }
      player.position = next;
      resolveSpace(state, player, map.spaces[next], rules, map);
    }

  } else if (effect.type === 'randomCity') {
    const properties = map.spaces.filter((s) => s.type === 'Property');
    if (properties.length > 0) {
      const target = properties[Math.floor(Math.random() * properties.length)];
      const oldPos = player.position;
      player.position = target.index;
      if (target.index < oldPos) {
        player.cash += rules.goSalary;
        state.log.push({ t: Date.now(), type: 'GO_SALARY', playerId: player.id, amount: rules.goSalary });
      }
      state.log.push({ t: Date.now(), type: 'RANDOM_CITY', playerId: player.id, landed: target.name });
      resolveSpace(state, player, target, rules, map);
    }
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
