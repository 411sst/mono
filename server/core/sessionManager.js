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

  enqueue(name) {
    const player = { id: randomUUID(), name, joinedAt: Date.now() };
    this.queue.push(player);
    if (this.queue.length >= 2) this.createMatch();
    return player;
  }

  createMatch() {
    const players = this.queue.splice(0, 2);
    const map = this.mapCatalog.values().next().value;
    const state = createInitialState({ map, rules: this.rules, players: players.map((p) => p.name) });
    const session = { id: state.id, mapId: map.id, state, reconnect: {} };
    this.sessions.set(session.id, session);
    this.store.saveSession(session);
    return session;
  }

  listSessions() {
    return [...this.sessions.values()].map((s) => ({ id: s.id, players: s.state.players.map((p) => p.name), version: s.state.version }));
  }

  getSession(id) {
    return this.sessions.get(id) || this.store.getSession(id);
  }

  attachStream(sessionId, res) {
    if (!this.streams.has(sessionId)) this.streams.set(sessionId, new Set());
    this.streams.get(sessionId).add(res);
    res.on('close', () => this.streams.get(sessionId)?.delete(res));
  }

  broadcast(sessionId, event) {
    const clients = this.streams.get(sessionId);
    if (!clients) return;
    for (const res of clients) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  act(sessionId, action, expectedVersion) {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, reason: 'Session not found' };
    if (expectedVersion !== session.state.version) return { ok: false, reason: 'Version conflict' };
    const map = this.mapCatalog.get(session.mapId);
    const result = applyAction(session.state, action, map, this.rules);
    if (!result.ok) return result;
    this.store.saveSession(session);
    this.broadcast(sessionId, { type: 'STATE', state: session.state, actor: currentPlayer(session.state)?.name || null });
    return { ok: true, state: session.state };
  }

  tickTimeouts() {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (Date.now() > session.state.turn.deadlineAt) {
        applyTimeout(session.state, this.rules);
        this.store.saveSession(session);
        this.broadcast(sessionId, { type: 'TIMEOUT', state: session.state });
      }
    }
  }
}
