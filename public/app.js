let activeSession = null;
let state = null;
let map = null;
let myPlayerId = null;
let eventSource = null;

// Stable color per player
const playerColorIdx = {};
const PCOLORS = ['p0','p1','p2','p3','p4','p5'];
function colorFor(id) {
  if (playerColorIdx[id] === undefined)
    playerColorIdx[id] = Object.keys(playerColorIdx).length % PCOLORS.length;
  return PCOLORS[playerColorIdx[id]];
}

const el = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

// ── Sessions ──────────────────────────────────────────────

async function refreshSessions() {
  const data = await api('/api/sessions');
  el('sessions').innerHTML = '';
  data.sessions.forEach((s) => {
    const li = document.createElement('li');
    const fin = s.status === 'finished' ? ' [FINISHED]' : '';
    li.innerHTML = `<span>${s.id.slice(0,8)} | ${s.players.join(' vs ')}${fin}</span>
      <button>Watch</button>`;
    li.querySelector('button').onclick = () => joinSession(s.id);
    el('sessions').appendChild(li);
  });
}

let allMaps = [];

async function joinSession(id) {
  if (eventSource) eventSource.close();
  activeSession = id;
  el('lobby').hidden = true;
  el('gameRoot').hidden = false;
  // Load all maps once; the correct one is picked when state arrives (state.mapId)
  if (allMaps.length === 0) {
    const data = await api('/api/maps');
    allMaps = data.maps;
  }
  eventSource = new EventSource(`/api/sessions/${id}/stream`);
  eventSource.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.state) {
      state = msg.state;
      // Always use the map the session was actually created with
      if (!map || map.id !== state.mapId) {
        map = allMaps.find(m => m.id === state.mapId) || allMaps[0];
      }
      render();
    }
  };
}

// ── Render ────────────────────────────────────────────────

function render() {
  renderBoard();
  renderDash();
  renderDice();
  renderActions();
  renderPropPanel();
  renderTrade();
  renderChat();
  if (state.status === 'finished') renderGameOver();
}

// ── Ring Board ────────────────────────────────────────────

// Map space index 0-39 → {row, col, side} in 11×11 CSS grid (1-based)
function boardPos(idx) {
  if (idx === 0)               return { row: 11, col: 11, side: 'corner' };
  if (idx >= 1  && idx <= 9)  return { row: 11, col: 11 - idx, side: 'bottom' };
  if (idx === 10)              return { row: 11, col: 1,  side: 'corner' };
  if (idx >= 11 && idx <= 19) return { row: 11 - (idx - 10), col: 1, side: 'left' };
  if (idx === 20)              return { row: 1,  col: 1,  side: 'corner' };
  if (idx >= 21 && idx <= 29) return { row: 1,  col: idx - 19, side: 'top' };
  if (idx === 30)              return { row: 1,  col: 11, side: 'corner' };
  if (idx >= 31 && idx <= 39) return { row: idx - 29, col: 11, side: 'right' };
  return null;
}

const CORNER_ICONS = {
  start: '🏁', jail: '⛓', freeparking: '🌴', gotojail: '👮',
};

function renderBoard() {
  const board = el('board');
  // Remove old space elements only (keep boardCenter)
  board.querySelectorAll('.space').forEach(e => e.remove());

  if (!map || !state) return;

  map.spaces.forEach((space) => {
    const pos = boardPos(space.index);
    if (!pos) return;

    const owned = state.ownership[space.index];
    const players = state.players.filter(p => p.position === space.index && !p.bankrupt);
    const group = space.group ? map.groups?.[space.group] : null;

    const div = document.createElement('div');
    div.className = `space s-${pos.side} ${space.type.toLowerCase()}${owned ? ' owned' : ''}`;
    div.style.gridRow = pos.row;
    div.style.gridColumn = pos.col;

    if (pos.side === 'corner') {
      const typeKey = space.type.toLowerCase();
      const icon = CORNER_ICONS[typeKey] || '⭐';
      const tokens = players.map(p =>
        `<span class="token ${colorFor(p.id)}" title="${p.name}">${p.name[0]}</span>`
      ).join('');
      div.innerHTML = `<div class="corner-inner">
        <div class="corner-icon">${icon}</div>
        <div class="corner-name">${space.name}</div>
        ${tokens ? `<div class="space-tokens">${tokens}</div>` : ''}
      </div>`;
    } else {
      const stripeColor = group?.color || null;
      const stripe = stripeColor
        ? `<div class="stripe" style="background:${stripeColor}"></div>` : '';
      const ownerName = owned ? state.players.find(p => p.id === owned.ownerId)?.name : '';
      const maxH = group?.maxHouses ?? 4;
      const houses = owned?.houses > 0
        ? `<span class="space-houses">${owned.houses >= maxH ? '🏨' : '🏠'.repeat(owned.houses)}</span>` : '';
      const tokens = players.map(p =>
        `<span class="token ${colorFor(p.id)}" title="${p.name}">${p.name[0]}</span>`
      ).join('');
      div.innerHTML = `${stripe}
        <div class="space-body">
          <span class="space-name">${owned?.mortgaged ? '📌 ' : ''}${space.name}</span>
          ${space.price ? `<span class="space-price">$${space.price}</span>` : ''}
          ${ownerName ? `<span class="space-owner">${ownerName}</span>` : ''}
          ${houses}
          ${tokens ? `<div class="space-tokens">${tokens}</div>` : ''}
        </div>`;
    }

    board.appendChild(div);
  });
}

// ── Dashboard ─────────────────────────────────────────────

function renderDash() {
  el('dash').innerHTML = state.players.map((p, i) => {
    const isActive = i === state.turn.index;
    const isMe = p.id === myPlayerId;
    const cc = colorFor(p.id);
    const tags = [
      p.inJail          ? '<span class="pc-tag jail">Jail</span>' : '',
      p.pardonCards > 0 ? `<span class="pc-tag pardon">🃏×${p.pardonCards}</span>` : '',
      p.bankrupt        ? '<span class="pc-tag bankrupt">Bankrupt</span>' : '',
    ].join('');
    return `<div class="player-card${isMe ? ' me' : ''}${isActive ? ' active' : ''}${p.bankrupt ? ' bankrupt' : ''}">
      ${isActive ? '<span class="turn-indicator">Turn</span>' : ''}
      <div class="pc-name"><span class="player-avatar ${cc}">${p.name[0]}</span>
        ${p.name}${isMe ? ' <small style="color:var(--text3);font-weight:400">(you)</small>' : ''}</div>
      <div class="pc-cash">$${p.cash.toLocaleString()}</div>
      ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
    </div>`;
  }).join('');

  // Event log
  const evLog = el('eventLog');
  const lastEvent = state.log[state.log.length - 1];
  if (lastEvent) {
    const actor = state.players.find(p => p.id === lastEvent.playerId);
    const name = actor?.name || '';
    let msg = '';
    switch (lastEvent.type) {
      case 'ROLL':            msg = `🎲 ${name} rolled ${lastEvent.d1}+${lastEvent.d2}=${lastEvent.d1+lastEvent.d2} → ${lastEvent.landed}`; break;
      case 'BUY':             msg = `🏠 ${name} bought ${map?.spaces[lastEvent.space]?.name || `#${lastEvent.space}`}`; break;
      case 'RENT':            msg = `💸 ${name} paid $${lastEvent.amount} rent`; break;
      case 'GO_SALARY':       msg = `💰 ${name} collected $${lastEvent.amount} passing GO`; break;
      case 'CARD':            msg = `🃏 ${name}: "${lastEvent.desc}"`; break;
      case 'BANKRUPT':        msg = `💀 ${name} went bankrupt!`; break;
      case 'JAIL_ROLL':       msg = `🎲 ${name} rolled ${lastEvent.d1}+${lastEvent.d2} in jail`; break;
      case 'JAIL_ESCAPE':     msg = `🔓 ${name} escaped jail → ${lastEvent.landed}`; break;
      case 'PAY_JAIL':        msg = `⛓ ${name} paid $${lastEvent.fine} to leave jail`; break;
      case 'USE_PARDON':      msg = `🃏 ${name} used Pardon card`; break;
      case 'MORTGAGE':        msg = `📌 ${name} mortgaged ${map?.spaces[lastEvent.space]?.name} (+$${lastEvent.amount})`; break;
      case 'UNMORTGAGE':      msg = `✅ ${name} unmortgaged ${map?.spaces[lastEvent.space]?.name}`; break;
      case 'BUILD_HOUSE':     msg = `${lastEvent.hotel?'🏨':'🏠'} ${name} built on ${map?.spaces[lastEvent.space]?.name}`; break;
      case 'SELL_HOUSE':      msg = `💰 ${name} sold house (+$${lastEvent.refund})`; break;
      case 'TRADE_OFFER':     msg = `🤝 ${name} proposed trade`; break;
      case 'TRADE_ACCEPT':    msg = `✅ ${name} accepted trade`; break;
      case 'TRADE_REJECT':    msg = `❌ ${name} rejected trade`; break;
      case 'TRADE_CANCEL':    msg = `↩ ${name} cancelled trade`; break;
      case 'PARDON_RECEIVED': msg = `🃏 ${name} got Pardon card`; break;
      case 'EACH_PLAYER':     msg = lastEvent.amount>0 ? `💰 ${name} collected $${lastEvent.amount} each` : `💸 ${name} paid $${-lastEvent.amount} each`; break;
      case 'RENOVATION':      msg = `🔨 ${name} paid $${lastEvent.amount} renovations`; break;
      case 'RANDOM_CITY':     msg = `✈ ${name} → ${lastEvent.landed}`; break;
      case 'TIMEOUT':         msg = `⏱ ${name} timed out`; break;
      case 'GAME_OVER':       msg = `🏆 Game over!`; break;
      default:                msg = lastEvent.type;
    }
    el('lastEvent').textContent = msg;
    // Prepend to event log
    const line = document.createElement('div');
    line.className = 'ev-line';
    line.textContent = msg;
    evLog.insertBefore(line, evLog.firstChild);
    // Cap at 30 lines
    while (evLog.children.length > 30) evLog.lastChild.remove();
  }
}

// ── Dice ──────────────────────────────────────────────────

const PIP_POS = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };
function dieFace(val, rolling) {
  const cells = Array(9).fill('');
  (PIP_POS[val] || []).forEach(i => { cells[i] = '<span class="pip"></span>'; });
  return `<div class="die${rolling ? ' rolling' : ''}">${cells.join('')}</div>`;
}

let lastDice = null;
function renderDice() {
  const lastRoll = [...(state.log || [])].reverse()
    .find(e => e.type === 'ROLL' || e.type === 'JAIL_ROLL' || e.type === 'JAIL_ESCAPE');
  const row = el('diceRow');
  if (!lastRoll) { row.innerHTML = ''; return; }
  const same = lastDice && lastDice.d1 === lastRoll.d1 && lastDice.d2 === lastRoll.d2 && lastDice.t === state.turn.index;
  lastDice = { d1: lastRoll.d1, d2: lastRoll.d2, t: state.turn.index };
  row.innerHTML = dieFace(lastRoll.d1, !same) + dieFace(lastRoll.d2, !same)
    + `<span class="die-total">= ${lastRoll.d1 + lastRoll.d2}</span>`
    + (lastRoll.d1 === lastRoll.d2 ? '<span class="die-doubles">Doubles!</span>' : '');
}

// ── Actions ───────────────────────────────────────────────

function renderActions() {
  const isMyTurn = myPlayerId && state.players[state.turn.index]?.id === myPlayerId;
  const me = state.players.find(p => p.id === myPlayerId);
  const fin = state.status === 'finished';
  el('rollBtn').disabled = !isMyTurn || fin;
  el('endBtn').disabled  = !isMyTurn || fin;
  el('buyBtn').disabled  = !isMyTurn || fin;
  el('payJailBtn').hidden   = !isMyTurn || !me?.inJail || fin;
  el('usePardonBtn').hidden = !isMyTurn || !me?.inJail || !(me?.pardonCards > 0) || fin;
}

function renderGameOver() {
  const winner = state.players.find(p => p.id === state.winner);
  const div = el('gameOver');
  div.hidden = false;
  div.textContent = winner ? `🏆 ${winner.name} wins!` : '🏁 Game over!';
}

// ── Property Panel ────────────────────────────────────────

function getHousePrice(space) {
  const g = space.group ? map?.groups?.[space.group] : null;
  return g?.housePrice ?? Math.max(50, Math.round(space.price * 0.5 / 50) * 50);
}

function hasFullGroup(idx) {
  const space = map?.spaces[idx];
  if (!space?.group) return false;
  return map.spaces
    .filter(s => s.group === space.group && s.type === 'Property')
    .every(s => state.ownership[s.index]?.ownerId === myPlayerId);
}

function renderPropPanel() {
  if (!state || !myPlayerId || !map) return;
  const isMyTurn = state.players[state.turn.index]?.id === myPlayerId;
  const panel = el('propPanel');
  if (!isMyTurn || state.status === 'finished') { panel.hidden = true; return; }

  const myProps = Object.entries(state.ownership)
    .filter(([, o]) => o.ownerId === myPlayerId)
    .map(([idx, ownership]) => ({ idx: Number(idx), space: map.spaces[Number(idx)], ownership }))
    .filter(p => p.space)
    .sort((a, b) => a.idx - b.idx);

  if (myProps.length === 0) { panel.hidden = true; return; }
  panel.hidden = false;

  el('propList').innerHTML = myProps.map(({ idx, space, ownership }) => {
    const g = space.group ? map.groups?.[space.group] : null;
    const maxH = g?.maxHouses ?? 4;
    const price = space.type === 'Property' ? getHousePrice(space) : 0;
    const canBuild  = space.type === 'Property' && !ownership.mortgaged && ownership.houses < maxH && hasFullGroup(idx);
    const canSell   = space.type === 'Property' && ownership.houses > 0;
    const canMort   = !ownership.mortgaged && ownership.houses === 0;
    const canUnmort = ownership.mortgaged;
    const houses = ownership.houses >= maxH ? '🏨' : '🏠'.repeat(ownership.houses);
    const dot = g?.color ? `<span class="prop-dot" style="background:${g.color}"></span>` : '';
    return `<div class="prop-row">
      <span class="prop-name">${dot}${space.name}${ownership.mortgaged?' [M]':''}${houses ? ` ${houses}` : ''}</span>
      <div class="prop-btns">
        ${canBuild  ? `<button class="prop-build"    data-idx="${idx}" title="$${price}">🏠+</button>` : ''}
        ${canSell   ? `<button class="prop-sell"     data-idx="${idx}" title="+$${Math.floor(price/2)}">🏠−</button>` : ''}
        ${canMort   ? `<button class="prop-mortgage" data-idx="${idx}" title="+$${Math.floor(space.price*.5)}">Mortgage</button>` : ''}
        ${canUnmort ? `<button class="prop-unmortgage" data-idx="${idx}" title="-$${Math.floor(space.price*.55)}">Unmortgage</button>` : ''}
      </div>
    </div>`;
  }).join('');

  el('propList').querySelectorAll('.prop-build').forEach(b =>
    b.addEventListener('click', () => sendAction('BUILD_HOUSE', { spaceIndex: Number(b.dataset.idx) })));
  el('propList').querySelectorAll('.prop-sell').forEach(b =>
    b.addEventListener('click', () => sendAction('SELL_HOUSE', { spaceIndex: Number(b.dataset.idx) })));
  el('propList').querySelectorAll('.prop-mortgage').forEach(b =>
    b.addEventListener('click', () => sendAction('MORTGAGE', { spaceIndex: Number(b.dataset.idx) })));
  el('propList').querySelectorAll('.prop-unmortgage').forEach(b =>
    b.addEventListener('click', () => sendAction('UNMORTGAGE', { spaceIndex: Number(b.dataset.idx) })));
}

// ── Trade ─────────────────────────────────────────────────

function tradeCardHtml(trade) {
  const from = state.players.find(p => p.id === trade.fromId);
  const to   = state.players.find(p => p.id === trade.toId);
  const offerProps   = trade.offer.properties.map(i => map?.spaces[i]?.name || `#${i}`).join(', ') || '—';
  const requestProps = trade.request.properties.map(i => map?.spaces[i]?.name || `#${i}`).join(', ') || '—';
  const isMeRcpt  = myPlayerId && trade.toId   === myPlayerId;
  const isMeOffer = myPlayerId && trade.fromId === myPlayerId;
  const btns = [
    isMeRcpt  ? `<button class="trade-accept-btn" data-id="${trade.id}">Accept</button>` : '',
    isMeRcpt  ? `<button class="trade-reject-btn" data-id="${trade.id}">Reject</button>` : '',
    isMeOffer ? `<button class="trade-cancel-btn" data-id="${trade.id}">Cancel</button>` : '',
  ].join('');
  return `<div class="pending-trade-card" data-id="${trade.id}">
    <div class="trade-header"><strong>${from?.name}</strong> → <strong>${to?.name}</strong>
      ${trade.message ? `<span class="trade-msg">"${escHtml(trade.message)}"</span>` : ''}
    </div>
    <div class="trade-cols">
      <div class="trade-section"><strong>${from?.name} offers</strong>
        <div>💵 $${trade.offer.cash}</div><div>🏠 ${offerProps}</div>
        ${trade.offer.pardonCards ? `<div>🃏 ${trade.offer.pardonCards} pardon(s)</div>` : ''}
      </div>
      <div class="trade-section"><strong>${from?.name} wants</strong>
        <div>💵 $${trade.request.cash}</div><div>🏠 ${requestProps}</div>
        ${trade.request.pardonCards ? `<div>🃏 ${trade.request.pardonCards} pardon(s)</div>` : ''}
      </div>
    </div>
    ${btns ? `<div class="pending-trade-actions">${btns}</div>` : ''}
  </div>`;
}

function renderTrade() {
  if (!state) return;
  const trades = (state.pendingTrades || []).filter(t => t.fromId === myPlayerId || t.toId === myPlayerId);
  el('pendingTrade').hidden = trades.length === 0;
  el('pendingTradeDetails').innerHTML = trades.map(tradeCardHtml).join('');

  el('pendingTradeDetails').querySelectorAll('.trade-accept-btn').forEach(b =>
    b.addEventListener('click', () => sendTradeAction('TRADE_ACCEPT', { tradeId: b.dataset.id })));
  el('pendingTradeDetails').querySelectorAll('.trade-reject-btn').forEach(b =>
    b.addEventListener('click', () => sendTradeAction('TRADE_REJECT', { tradeId: b.dataset.id })));
  el('pendingTradeDetails').querySelectorAll('.trade-cancel-btn').forEach(b =>
    b.addEventListener('click', () => sendTradeAction('TRADE_CANCEL', { tradeId: b.dataset.id })));

  const targetSel = el('tradeTarget');
  const prev = targetSel.value;
  targetSel.innerHTML = '';
  state.players.filter(p => !p.bankrupt && p.id !== myPlayerId).forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    targetSel.appendChild(o);
  });
  if (prev) targetSel.value = prev;

  const myProps = Object.entries(state.ownership || {})
    .filter(([, o]) => o.ownerId === myPlayerId)
    .map(([idx]) => ({ idx: Number(idx), name: map?.spaces[Number(idx)]?.name || `#${idx}` }));
  el('tradePropsOffer').innerHTML = myProps.map(p =>
    `<label><input type="checkbox" class="prop-offer" value="${p.idx}"> ${p.name}</label>`
  ).join('');

  populateRequestProps();
}

function populateRequestProps() {
  const tid = el('tradeTarget').value;
  const tProps = Object.entries(state.ownership || {})
    .filter(([, o]) => o.ownerId === tid)
    .map(([idx]) => ({ idx: Number(idx), name: map?.spaces[Number(idx)]?.name || `#${idx}` }));
  el('tradePropsRequest').innerHTML = tProps.map(p =>
    `<label><input type="checkbox" class="prop-request" value="${p.idx}"> ${p.name}</label>`
  ).join('');
}

el('tradeTarget')?.addEventListener('change', populateRequestProps);

el('tradeOfferBtn').onclick = () => {
  if (!myPlayerId || !activeSession) return;
  sendTradeAction('TRADE_OFFER', {
    toId: el('tradeTarget').value,
    offer:   { cash: Number(el('tradeCashOffer').value)||0,
               properties: [...document.querySelectorAll('.prop-offer:checked')].map(c => Number(c.value)),
               pardonCards: el('tradePardonOffer').checked ? 1 : 0 },
    request: { cash: Number(el('tradeCashRequest').value)||0,
               properties: [...document.querySelectorAll('.prop-request:checked')].map(c => Number(c.value)),
               pardonCards: el('tradePardonRequest').checked ? 1 : 0 },
    message: el('tradeMessage').value.trim() || null,
  });
};

// ── Chat ──────────────────────────────────────────────────

function renderChat() {
  if (!state?.chat) return;
  const box = el('chatMessages');
  box.innerHTML = state.chat.map(m => {
    const isMe = m.playerId === myPlayerId;
    return `<div class="chat-msg${isMe ? ' mine' : ''}"><strong>${m.name}:</strong>${escHtml(m.text)}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function sendChat() {
  const input = el('chatInput');
  const text = input.value.trim();
  if (!text || !activeSession || !myPlayerId) return;
  input.value = '';
  await api(`/api/sessions/${activeSession}/chat`, {
    method: 'POST',
    body: JSON.stringify({ playerId: myPlayerId, message: text }),
  });
}

el('chatSendBtn').onclick = sendChat;
el('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

// ── Queue ─────────────────────────────────────────────────

el('queueBtn').onclick = async () => {
  const name = el('name').value.trim() || 'Guest';
  const mapId = el('mapSelect').value;
  const data = await api('/api/queue', { method: 'POST', body: JSON.stringify({ name, mapId }) });
  myPlayerId = data.player?.id || null;
  el('queueStatus').textContent = data.queued
    ? `Queued as "${data.player.name}" (id: ${data.player.id.slice(0,8)}…). Waiting for opponent…`
    : 'Queue failed';
  refreshSessions();
};

// ── Actions ───────────────────────────────────────────────

el('rollBtn').onclick      = () => sendAction('ROLL');
el('buyBtn').onclick       = () => sendAction('BUY');
el('endBtn').onclick       = () => sendAction('END_TURN');
el('payJailBtn').onclick   = () => sendAction('PAY_JAIL');
el('usePardonBtn').onclick = () => sendAction('USE_PARDON');

async function sendAction(type, extra = {}) {
  if (!activeSession || !state) return;
  const out = await api(`/api/sessions/${activeSession}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: { type, ...extra }, expectedVersion: state.version, playerId: myPlayerId }),
  });
  if (!out.ok) alert(out.reason);
}

async function sendTradeAction(type, extra = {}) {
  if (!activeSession) return;
  const out = await api(`/api/sessions/${activeSession}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: { type, ...extra }, expectedVersion: state?.version, playerId: myPlayerId }),
  });
  if (!out.ok) alert(out.reason);
}

// ── Boot ──────────────────────────────────────────────────

async function loadMaps() {
  const data = await api('/api/maps');
  allMaps = data.maps;
  const sel = el('mapSelect');
  sel.innerHTML = '';
  allMaps.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.name;
    sel.appendChild(o);
  });
}

loadMaps();
refreshSessions();
setInterval(refreshSessions, 4000);
