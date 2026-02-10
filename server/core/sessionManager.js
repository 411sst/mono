import { randomUUID } from 'node:crypto';
import { createInitialState, currentPlayer } from './state.js';
import { applyAction, applyTimeout } from './engine.js';

export class SessionManager {
  constructor({ mapCatalog, rules, store }) {
    this.mapCatalog = mapCatalog;
    this.rules = rules;
    this.store = store;
    this.queue = [];
    this.sessions = new Map();
    this.streams = new Map();
    setInterval(() => this.tickTimeouts(), 1000);
  }

  enqueue(name, mapId) {
    const map = mapId ? this.mapCatalog.get(mapId) : this.mapCatalog.values().next().value;
    if (!map) return null;
    const player = { id: randomUUID(), name, joinedAt: Date.now(), mapId: map.id };
    this.queue.push(player);
    if (this.queue.length >= 2) this.createMatch();
    return player;
  }

  createMatch() {
    const players = this.queue.splice(0, 2);
    const mapId = players[0].mapId;
    const map = this.mapCatalog.get(mapId) || this.mapCatalog.values().next().value;
    // Pass full player objects so their IDs are preserved in state
    const state = createInitialState({ map, rules: this.rules, players });
    const session = { id: state.id, mapId: map.id, state, reconnect: {} };
    this.sessions.set(session.id, session);
    this.store.saveSession(session);
    return session;
  }

  listSessions() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      players: s.state.players.map((p) => p.name),
      version: s.state.version,
      status: s.state.status,
      winner: s.state.winner
    }));
  }

  getSession(id) {
    return this.sessions.get(id) || this.store.getSession(id);
  }

  attachStream(sessionId, res) {
    if (!this.streams.has(sessionId)) this.streams.set(sessionId, new Set());
    this.streams.get(sessionId).add(res);
    // Send current state immediately on connect
    const session = this.sessions.get(sessionId);
    if (session) res.write(`data: ${JSON.stringify({ type: 'STATE', state: session.state })}\n\n`);
    res.on('close', () => this.streams.get(sessionId)?.delete(res));
  }

  broadcast(sessionId, event) {
    const clients = this.streams.get(sessionId);
    if (!clients) return;
    for (const res of clients) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  act(sessionId, action, expectedVersion, playerId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, reason: 'Session not found' };

    const tradeTypes = new Set(['TRADE_OFFER', 'TRADE_ACCEPT', 'TRADE_REJECT', 'TRADE_CANCEL']);
    const isTrade = tradeTypes.has(action.type);

    // Trade responses (accept/reject/cancel) skip version check — they reference pendingTrade directly
    if (!isTrade && expectedVersion !== session.state.version) {
      return { ok: false, reason: 'Version conflict' };
    }

    // Non-trade actions require it to be the player's turn
    if (!isTrade) {
      const current = currentPlayer(session.state);
      if (playerId && current.id !== playerId) return { ok: false, reason: 'Not your turn' };
    }

    const map = this.mapCatalog.get(session.mapId);
    const result = applyAction(session.state, action, map, this.rules, playerId);
    if (!result.ok) return result;
    this.store.saveSession(session);
    this.broadcast(sessionId, { type: 'STATE', state: session.state });
    return { ok: true, state: session.state };
  }

  chat(sessionId, playerId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, reason: 'Session not found' };
    const player = session.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, reason: 'Player not found' };
    const entry = { t: Date.now(), playerId, name: player.name, text: String(message).slice(0, 300) };
    session.state.chat.push(entry);
    if (session.state.chat.length > 50) session.state.chat.shift();
    this.store.saveSession(session);
    this.broadcast(sessionId, { type: 'STATE', state: session.state });
    return { ok: true };
  }

  tickTimeouts() {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.state.status === 'finished') continue;
      if (Date.now() > session.state.turn.deadlineAt) {
        applyTimeout(session.state, this.rules);
        this.store.saveSession(session);
        this.broadcast(sessionId, { type: 'STATE', state: session.state });
      }
    }
  }
}
