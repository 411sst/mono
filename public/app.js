let activeSession = null;
let state = null;
let map = null;

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
    li.innerHTML = `${s.id.slice(0, 8)} | players: ${s.players.join(', ')} <button>Watch</button>`;
    li.querySelector('button').onclick = () => joinSession(s.id);
    el('sessions').appendChild(li);
  });
}

async function joinSession(id) {
  activeSession = id;
  el('gamePanel').hidden = false;
  const maps = await api('/api/maps');
  map = maps.maps[0];
  const es = new EventSource(`/api/sessions/${id}/stream`);
  es.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.state) {
      state = msg.state;
      render();
    }
  };
}

function render() {
  el('board').innerHTML = '';
  map.spaces.forEach((space) => {
    const div = document.createElement('div');
    const owned = state.ownership[space.index] ? 'owned' : '';
    div.className = `space ${owned}`;
    div.innerHTML = `<strong>${space.name}</strong><br/>${space.type}`;
    el('board').appendChild(div);
  });
  el('dash').innerHTML = state.players.map((p, i) => {
    const turn = i === state.turn.index ? '⬅️ turn' : '';
    return `${p.name}: $${p.cash} pos:${p.position} ${turn}`;
  }).join('<br/>');
}

el('queueBtn').onclick = async () => {
  const data = await api('/api/queue', { method: 'POST', body: JSON.stringify({ name: el('name').value }) });
  el('queueStatus').textContent = data.queued ? 'Queued. Refresh sessions to join game.' : 'Queue failed';
  refreshSessions();
};

el('rollBtn').onclick = () => sendAction('ROLL');
el('buyBtn').onclick = () => sendAction('BUY');
el('endBtn').onclick = () => sendAction('END_TURN');

async function sendAction(type) {
  if (!activeSession || !state) return;
  const out = await api(`/api/sessions/${activeSession}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: { type }, expectedVersion: state.version })
  });
  if (!out.ok) alert(out.reason);
}

refreshSessions();
setInterval(refreshSessions, 4000);
