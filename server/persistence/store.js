import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('.data');
const STATE_FILE = path.join(DATA_DIR, 'sessions.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify({ sessions: {} }, null, 2));
}

export class FileStore {
  constructor() {
    ensure();
  }

  loadAll() {
    ensure();
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }

  saveSession(session) {
    const db = this.loadAll();
    db.sessions[session.id] = session;
    fs.writeFileSync(STATE_FILE, JSON.stringify(db, null, 2));
  }

  getSession(id) {
    return this.loadAll().sessions[id] || null;
  }
}
