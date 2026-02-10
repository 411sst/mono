let activeSession = null;
let state = null;
let map = null;
let myPlayerId = null;
let eventSource = null;

const el = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  return res.json();
}

async function refreshSessions() {
  const data = await api('/api/sessions');
  el('sessions').innerHTML = '';
  data.sessions.forEach((s) => {
    const li = document.createElement('li');
    const status = s.status === 'finished' ? ' [FINISHED]' : '';
    li.innerHTML = `${s.id.slice(0, 8)} | ${s.players.join(' vs ')}${status} <button>Watch</button>`;
    li.querySelector('button').onclick = () => joinSession(s.id);
    el('sessions').appendChild(li);
  });
}

async function joinSession(id) {
  if (eventSource) eventSource.close();
  activeSession = id;
  el('gamePanel').hidden = false;
  const maps = await api('/api/maps');
  map = maps.maps[0];
  eventSource = new EventSource(`/api/sessions/${id}/stream`);
  eventSource.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.state) {
      state = msg.state;
      render();
    }
  };
}

// --- Rendering ---

function render() {
  renderBoard();
  renderDash();
  renderActions();
  if (state.status === 'finished') renderGameOver();
}

function renderBoard() {
  const board = el('board');
  board.innerHTML = '';
  map.spaces.forEach((space) => {
    const div = document.createElement('div');
    const owned = state.ownership[space.index];
    const players = state.players.filter((p) => p.position === space.index && !p.bankrupt);
    let cls = `space ${space.type.toLowerCase()}`;
    if (owned) cls += ' owned';
    div.className = cls;

    const colorDot = space.group && map.groups?.[space.group]?.color
      ? `<span class="group-dot" style="background:${map.groups[space.group].color}"></span>`
      : '';
    const ownerName = owned ? state.players.find((p) => p.id === owned.ownerId)?.name : '';
    const ownerTag = ownerName ? `<span class="owner">${ownerName}</span>` : '';
    const tokens = players.map((p) => {
      const isMe = p.id === myPlayerId;
      return `<span class="token${isMe ? ' mine' : ''}" title="${p.name}">${p.name[0]}</span>`;
    }).join('');

    div.innerHTML = `${colorDot}<strong>${space.name}</strong><br/><small>${space.type}</small>${ownerTag}${tokens ? `<div class="tokens">${tokens}</div>` : ''}`;
    board.appendChild(div);
  });
}

function renderDash() {
  const me = state.players.find((p) => p.id === myPlayerId);
  el('dash').innerHTML = state.players.map((p, i) => {
    const isActive = i === state.turn.index;
    const isBankrupt = p.bankrupt;
    const isMe = p.id === myPlayerId;
    const jailTag = p.inJail ? ' [JAIL]' : '';
    const pardonTag = p.pardonCards > 0 ? ` [PARDON x${p.pardonCards}]` : '';
    const bankruptTag = isBankrupt ? ' [BANKRUPT]' : '';
    const turnTag = isActive ? ' <span class="turn-arrow">&#8592; TURN</span>' : '';
    return `<div class="player-row${isMe ? ' me' : ''}${isBankrupt ? ' bankrupt' : ''}">
      ${p.name}: $${p.cash}${jailTag}${pardonTag}${bankruptTag}${turnTag}
    </div>`;
  }).join('');

  // Show last log entry
  const lastEvent = state.log[state.log.length - 1];
  if (lastEvent) {
    const actor = state.players.find((p) => p.id === lastEvent.playerId);
    const name = actor?.name || '';
    let msg = '';
    switch (lastEvent.type) {
      case 'ROLL':       msg = `${name} rolled ${lastEvent.d1}+${lastEvent.d2}=${lastEvent.d1+lastEvent.d2} → ${lastEvent.landed}`; break;
      case 'BUY':        msg = `${name} bought space #${lastEvent.space}`; break;
      case 'RENT':       msg = `${name} paid $${lastEvent.amount} rent`; break;
      case 'GO_SALARY':  msg = `${name} collected $${lastEvent.amount} passing GO`; break;
      case 'CARD':       msg = `${name} drew ${lastEvent.deck} card: "${lastEvent.desc}"`; break;
      case 'BANKRUPT':   msg = `${name} went bankrupt!`; break;
      case 'JAIL_ROLL':  msg = `${name} rolled ${lastEvent.d1}+${lastEvent.d2} in jail`; break;
      case 'JAIL_ESCAPE':msg = `${name} escaped jail! → ${lastEvent.landed}`; break;
      case 'PAY_JAIL':        msg = `${name} paid $${lastEvent.fine} to leave jail`; break;
      case 'USE_PARDON':      msg = `${name} used a Pardon card to leave jail`; break;
      case 'PARDON_RECEIVED': msg = `${name} received a Pardon (Get Out of Jail Free) card`; break;
      case 'EACH_PLAYER':     msg = lastEvent.amount > 0 ? `${name} collected $${lastEvent.amount} from each player` : `${name} paid $${-lastEvent.amount} to each player`; break;
      case 'RENOVATION':      msg = `${name} paid $${lastEvent.amount} for property renovations`; break;
      case 'RANDOM_CITY':     msg = `${name} advanced to ${lastEvent.landed}`; break;
      case 'TIMEOUT':         msg = `${name} timed out (penalty: $${lastEvent.count * 50})`; break;
      case 'GAME_OVER':       msg = `Game over!`; break;
      default:                msg = lastEvent.type;
    }
    el('lastEvent').textContent = msg;
  }
}

function renderActions() {
  const isMyTurn = myPlayerId && state.players[state.turn.index]?.id === myPlayerId;
  const me = state.players.find((p) => p.id === myPlayerId);
  const finished = state.status === 'finished';

  el('rollBtn').disabled = !isMyTurn || finished;
  el('endBtn').disabled = !isMyTurn || finished;
  el('buyBtn').disabled = !isMyTurn || finished;
  el('payJailBtn').hidden = !isMyTurn || !me?.inJail || finished;
  el('usePardonBtn').hidden = !isMyTurn || !me?.inJail || !(me?.pardonCards > 0) || finished;
  el('rollBtn').hidden = false;
  el('endBtn').hidden = false;
}

function renderGameOver() {
  const winner = state.players.find((p) => p.id === state.winner);
  el('gameOver').hidden = false;
  el('gameOver').textContent = winner ? `Game over! ${winner.name} wins!` : 'Game over!';
}

// --- Queue ---

el('queueBtn').onclick = async () => {
  const name = el('name').value.trim() || 'Guest';
  const mapId = el('mapSelect').value;
  const data = await api('/api/queue', { method: 'POST', body: JSON.stringify({ name, mapId }) });
  myPlayerId = data.player?.id || null;
  el('queueStatus').textContent = data.queued
    ? `Queued as "${data.player.name}" (id: ${data.player.id.slice(0, 8)}…). Waiting for opponent…`
    : 'Queue failed';
  refreshSessions();
};

// --- Actions ---

el('rollBtn').onclick       = () => sendAction('ROLL');
el('buyBtn').onclick        = () => sendAction('BUY');
el('endBtn').onclick        = () => sendAction('END_TURN');
el('payJailBtn').onclick    = () => sendAction('PAY_JAIL');
el('usePardonBtn').onclick  = () => sendAction('USE_PARDON');

async function sendAction(type) {
  if (!activeSession || !state) return;
  const out = await api(`/api/sessions/${activeSession}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: { type }, expectedVersion: state.version, playerId: myPlayerId })
  });
  if (!out.ok) alert(out.reason);
}

// --- Boot ---

async function loadMaps() {
  const data = await api('/api/maps');
  const sel = el('mapSelect');
  sel.innerHTML = '';
  data.maps.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
}

loadMaps();
refreshSessions();
setInterval(refreshSessions, 4000);
