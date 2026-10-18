# Context Quest

A short (about five minutes), real-time cooperative mystery for exactly three players.
**Three witnesses. Nine clues. One shared truth.**

Each player sees three private clues about the same incident, locks a theory alone, reveals
**exactly one** card to a shared pinboard, and then the team rebuilds the timeline and signs a
verdict together. The truth reveal compares the team's answer with an authored answer key.

Built for Devlympics — Shunya 2026.

## Run it

Requires Node 20+ (tested on Node 24).

```bash
npm install
npm run dev          # game server on :3001 + Vite client on :5173 (proxied)
```

Open <http://localhost:5173>. Vite listens on all interfaces, so phones on the same Wi-Fi can
join through `http://<your-LAN-IP>:5173`. The invite link uses whatever address the host opened.

Production (one process serves the built client and the game socket):

```bash
npm run build
npm start            # http://localhost:3000  (PORT=... to change)
```

**No environment variables are required.** There is no database or external service: rooms
live in the server's memory. Optional settings:

| Variable         | Default            | Purpose                                                       |
| ---------------- | ------------------ | ------------------------------------------------------------- |
| `PORT`           | `3000` (prod)      | HTTP port in production                                       |
| `CQ_SERVER_PORT` | `3001`             | Game server port in dev (Vite proxies to it)                  |
| `CQ_TIME_SCALE`  | `1`                | Multiplies internal grace periods (used by tests)             |

## Play with three people

1. Player 1 enters a name and clicks **Create a case room**. They become the host *and* a
   normal player with their own private evidence.
2. Share the four-letter code or the **invite link** (`/r/CODE`).
3. Everyone clicks **I'm ready**. The host clicks **Open the case file**. The stopwatch starts.
4. Read your clues → lock a private theory → pin exactly one card → order the timeline and
   answer the three verdict questions → everyone signs → truth reveal.
5. The host can start a new round. Roles rotate, so each player gets a new perspective.

To test alone, open three **separate tabs or windows**. Each tab is its own player (the
session lives in `sessionStorage`), and refreshing a tab keeps your seat.

## Tests

```bash
npm test             # case integrity, all 27 reveal combinations, scoring, 3-client multiplayer
npm run build && npm run e2e      # three real browser sessions (2 desktop + 1 touch phone)
```

Screenshots from the browser runs land in `e2e-shots/`.

## How it works

```
server/
  index.ts          Express + Socket.IO, session binding, room sweeper
  room.ts           authoritative state machine, per-player projection (viewFor)
  config.ts         phase caps and timings
  case/case001.ts   the authored mystery: cards, canonical timeline, answer key, narrative
  case/analysis.ts  deterministic scoring and evidence analysis
shared/protocol.ts  every type that crosses the wire
src/                React client (Motion for animation, WebAudio-synthesised sound)
```

- **Server-authoritative.** Every rule is validated on the server: one reveal per player,
  theory lock before reveal, phase order, deadlines, duplicate submits, drag holds on
  timeline tiles. Clients send intents ("move e3 to slot 2"), never state.
- **Privacy.** `Room.viewFor(player)` is the only path out of the server. It contains your
  own cards and nobody else's. Other players' theories, the answer key and the card analysis
  only exist on the server until the truth phase. The host gets no extra information.
- **One stopwatch.** The server stores the round's start time. Clients estimate their offset
  from the server clock with NTP-style pings, so every screen shows the same time on the case.
  It counts up, and stops when the verdict is filed. That's the team's solve time.
- **No countdown.** Each step moves on as soon as everyone is done. If a player has been
  disconnected for 20 seconds, the game handles their turn for them (no theory; one of their
  cards is pinned at random), so the team is never stuck.
- **Team chat** opens with the shared board. A "discuss" button on each timeline event starts
  a message about that event.
- **Resilience.** Refresh or reconnect resumes your seat with a token. A newer tab on the same
  seat takes over and the old one is told why. Disconnected players never block the team's
  signatures.
  Abandoned rooms are deleted after 15 minutes.

## The case and its scoring

`server/case/case001.ts` holds the whole mystery: nine cards, each with timestamped facts, and
a canonical timeline of six events. `tests/case.test.ts` checks every card timestamp against
the canonical timeline. It also checks all **27** possible one-card-per-player reveals: every
combination contains evidence for each verdict question and each event. Each role
"specialises" in one of the three conclusions, so no combination is unsolvable, and no single
card proves everything.

Match % = main cause (30) + generator (20) + electrical-room visitor (20) + timeline (2 points
for each of the 15 event pairs in the right order). It is computed only from the team's
submission and the answer key. Unshared cards never affect it.

## Limitations

- Rooms are held in memory: restarting the server ends games in progress. A single Node
  process handles many rooms, but horizontal scaling would need a shared store such as Redis.
- One case is authored. The case format is data-driven, so adding Case 002 means adding a
  file and its tests.
