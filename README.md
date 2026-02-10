# 🐱 Meownopoly

A fully playable, server-authoritative multiplayer Monopoly-style game. Built with Node.js 22, vanilla JS, and Server-Sent Events — no build step, no external dependencies.

---

## Features

- **7 maps** — Classic, Classic World, Mr. Worldwide, Death Valley, Lucky Wheel, Asian Adventure, Mediterranean
- **Full Monopoly ruleset** — GO salary, jail, doubles, Chance & Community Chest (17 cards each), railroads, utilities
- **Houses & hotels** per color group, mortgage / unmortgage
- **Multi-trade** — multiple simultaneous trade offers with cash + properties + pardon cards
- **In-game chat**
- **Animated dice**, color-coded player tokens, premium dark UI

---

## Play locally

```bash
node --version   # needs v22+
npm start
```

Open **http://localhost:3000** in two browser tabs (or two machines on the same network).

1. Both players enter a name, pick the same map, click **Join Queue**
2. Once two players queue the game starts automatically
3. The active player's dashboard card pulses green — only they can roll/buy/act

---

## Play with friends online (quick — no server needed)

Use **ngrok** to share your local server with a public URL.

```bash
# Install ngrok: https://ngrok.com/download (free account)
npm start &
ngrok http 3000
```

ngrok prints a public URL like `https://abc123.ngrok-free.app`. Share that link — your friends connect directly to your machine. Free tier gives ~2 hours per session.

---

## Deploy for free (permanent, always-on)

> **Important:** This game keeps state in memory and uses persistent SSE streams.
> Serverless platforms (Vercel, Netlify, Cloudflare Workers) will **not** work.
> Use a platform that runs a real Node process.

### Railway (recommended — easiest)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
3. Select the repo — Railway auto-detects Node and runs `npm start`
4. Click **Settings → Networking → Generate Domain** to get a public `*.up.railway.app` URL
5. Share that URL with your friends

Free tier gives **$5 credit/month** — enough for many hours of play. No sleep/spin-down.

### Fly.io (alternative)

```bash
# Install flyctl: https://fly.io/docs/flyctl/install/
fly launch          # auto-detects Node, creates fly.toml
fly deploy
fly open
```

Free tier includes 3 shared-CPU machines. Machines pause when idle but wake in ~1 second.

### Render

Works but the **free tier spins down after 15 min of inactivity**, which drops all SSE connections and breaks games in progress. Use only if you start a game before the first request triggers a wake-up.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |

---

## Development

```bash
npm run dev    # auto-restarts on file changes (Node --watch)
npm test       # run engine tests
```

---

## Architecture

```
server/
  index.js            HTTP server + routes (queue, action, SSE, chat)
  core/
    engine.js         Pure game logic — applyAction(), applyTimeout()
    state.js          Initial state factory, shuffled card decks
    sessionManager.js Session lifecycle + SSE broadcast
  rules/
    richupPreset.js   All game constants (salaries, rents, ratios)
  maps/
    catalog.js        Auto-loads & validates all maps/*.json
  persistence/
    store.js          File-based session store (sessions.json)
public/
  index.html          Single-page game client
  app.js              Frontend JS (rendering, SSE, actions)
  styles.css          Dark theme UI
maps/
  classic.json        Cat-themed 40-space board
  *.json              6 additional themed boards
```

State is kept in memory and flushed to `sessions.json` after each action. On restart, sessions are reloaded but SSE clients must reconnect.
