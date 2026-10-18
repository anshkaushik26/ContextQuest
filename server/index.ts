import express from 'express';
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServer, ServerToClient, SessionInfo } from '../shared/protocol';
import { case001 } from './case/case001';
import { ABANDONED_ROOM_MS, MAX_ROOM_AGE_MS } from './config';
import { Room, type Player } from './room';

type IO = Server<ClientToServer, ServerToClient, Record<string, never>, { code?: string; playerId?: string }>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, { code?: string; playerId?: string }>;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface StartOptions {
  port?: number;
  /** Multiplies every game duration. Tests use small values; production uses 1. */
  timeScale?: number;
  serveClient?: boolean;
}

export interface RunningServer {
  port: number;
  http: HttpServer;
  io: IO;
  rooms: Map<string, Room>;
  close: () => Promise<void>;
}

export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const timeScale = opts.timeScale ?? 1;
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  const http = createServer(app);
  const io: IO = new Server(http, { cors: { origin: false }, pingInterval: 10_000, pingTimeout: 8_000 });
  const rooms = new Map<string, Room>();

  if (opts.serveClient) {
    const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    if (existsSync(dist)) {
      app.use(express.static(dist, { index: false, maxAge: '1h' }));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
        res.sendFile(join(dist, 'index.html'));
      });
    } else {
      console.warn('[context-quest] dist/ not found — run `npm run build` first.');
    }
  }

  const broadcast = (room: Room) => {
    for (const p of room.players) {
      if (p.socketId && !p.bot) io.to(p.socketId).emit('state', room.viewFor(p.id));
    }
  };
  // Coalesce several state changes in the same tick into one broadcast per player.
  const pending = new Set<Room>();
  const scheduleBroadcast = (room: Room) => {
    if (pending.has(room)) return;
    pending.add(room);
    queueMicrotask(() => {
      pending.delete(room);
      if (rooms.get(room.code) === room) broadcast(room);
    });
  };

  const newCode = () => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  };

  const session = (room: Room, p: Player): SessionInfo => ({ code: room.code, token: p.token, playerId: p.id });

  const bind = (socket: Sock, room: Room, p: Player) => {
    // A socket can only hold one seat at a time.
    if (socket.data.code && (socket.data.code !== room.code || socket.data.playerId !== p.id)) unbind(socket);
    // Latest connection wins; the old one is told why it went quiet (its handlers stop matching).
    if (p.socketId && p.socketId !== socket.id) {
      io.to(p.socketId).emit('kicked', { reason: 'This seat was opened in another tab or device.' });
    }
    socket.data.code = room.code;
    socket.data.playerId = p.id;
    room.attach(p, socket.id);
  };

  const unbind = (socket: Sock) => {
    const room = socket.data.code ? rooms.get(socket.data.code) : undefined;
    if (room) room.detach(socket.id);
    socket.data = {};
  };

  const fail = (code: string, error: string) => ({ ok: false as const, code, error });

  io.on('connection', (socket: Sock) => {
    const ctx = () => {
      const room = socket.data.code ? rooms.get(socket.data.code) : undefined;
      const player = room && socket.data.playerId ? room.player(socket.data.playerId) : undefined;
      if (!room || !player || player.socketId !== socket.id) return null;
      return { room, player };
    };
    /** Wraps a handler: requires a bound session, validates the ack, never throws. */
    const guarded =
      <A extends unknown[]>(fn: (c: { room: Room; player: Player }, ...args: A) => Ack) =>
      (...args: [...A, (r: Ack) => void]) => {
        const ack = args[args.length - 1];
        const reply = typeof ack === 'function' ? (ack as (r: Ack) => void) : () => {};
        try {
          const c = ctx();
          if (!c) return reply(fail('NO_SESSION', 'You are not in a room.'));
          reply(fn(c, ...(args.slice(0, -1) as A)));
        } catch (e) {
          console.error('[context-quest] handler error', e);
          reply(fail('SERVER', 'Something went wrong on the server.'));
        }
      };

    socket.on('time:sync', (p, ack) => {
      if (typeof ack === 'function') ack({ t0: Number(p?.t0) || 0, server: Date.now() });
    });

    socket.on('room:create', (p, ack) => {
      if (typeof ack !== 'function') return;
      const room = new Room(newCode(), case001, timeScale, scheduleBroadcast);
      rooms.set(room.code, room);
      const res = room.addPlayer(p?.name ?? '', socket.id);
      if ('ok' in res) return ack(res as never);
      bind(socket, room, res);
      ack({ ok: true, ...session(room, res) });
    });

    socket.on('room:join', (p, ack) => {
      if (typeof ack !== 'function') return;
      const code = String(p?.code ?? '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return ack(fail('NOT_FOUND', `No case room called “${code || '—'}”. Check the code.`));
      const res = room.addPlayer(p?.name ?? '', socket.id);
      if ('ok' in res) return ack(res as never);
      bind(socket, room, res);
      ack({ ok: true, ...session(room, res) });
    });

    socket.on('room:resume', (p, ack) => {
      if (typeof ack !== 'function') return;
      const room = rooms.get(String(p?.code ?? '').toUpperCase());
      const player = room && typeof p?.token === 'string' ? room.playerByToken(p.token) : undefined;
      if (!room || !player) return ack(fail('NO_SESSION', 'That seat is no longer available.'));
      bind(socket, room, player);
      ack({ ok: true, ...session(room, player) });
    });

    socket.on(
      'room:leave',
      guarded(({ room, player }) => {
        const r = room.leave(player.id);
        socket.data = {};
        return r;
      }),
    );
    socket.on('player:rename', guarded(({ room, player }, p: { name: string }) => room.rename(player.id, p?.name)));
    socket.on('player:ready', guarded(({ room, player }, p: { ready: boolean }) => room.setReady(player.id, !!p?.ready)));
    socket.on('game:start', guarded(({ room, player }) => room.start(player.id)));
    socket.on('intro:done', guarded(({ room, player }) => room.introDone(player.id)));
    socket.on(
      'theory:lock',
      guarded(({ room, player }, p: { hypothesisId: string; confidence: string }) =>
        room.lockTheory(player.id, p?.hypothesisId, p?.confidence),
      ),
    );
    socket.on('reveal:selecting', (p) => {
      const c = ctx();
      if (c) c.room.setSelecting(c.player.id, !!p?.on);
    });
    socket.on('reveal:card', guarded(({ room, player }, p: { cardId: string }) => room.revealCard(player.id, p?.cardId)));
    socket.on('timeline:hold', (p) => {
      const c = ctx();
      if (c) c.room.hold(c.player.id, p?.eventId ?? null);
    });
    socket.on(
      'timeline:move',
      guarded(({ room, player }, p: { eventId: string; toIndex: number }) => room.move(player.id, p?.eventId, p?.toIndex)),
    );
    socket.on(
      'timeline:doubt',
      guarded(({ room, player }, p: { eventId: string; on: boolean }) => room.doubt(player.id, p?.eventId, p?.on)),
    );
    socket.on(
      'verdict:set',
      guarded(({ room, player }, p: { questionId: string; optionId: string }) =>
        room.setAnswer(player.id, p?.questionId, p?.optionId),
      ),
    );
    socket.on('verdict:sign', guarded(({ room, player }, p: { signed: boolean }) => room.sign(player.id, p?.signed)));
    socket.on('round:again', guarded(({ room, player }) => room.newRound(player.id)));
    socket.on('chat:clear', guarded(({ room, player }) => room.clearChat(player.id)));
    socket.on('demo:start', guarded(({ room, player }) => room.startDemo(player.id)));
    socket.on('demo:stop', guarded(({ room, player }) => room.stopDemo(player.id)));
    socket.on('demo:step', guarded(({ room, player }) => room.demoStep(player.id)));
    socket.on(
      'chat:send',
      guarded(({ room, player }, p: { text: string; eventId?: string }) => room.sendChat(player.id, p?.text, p?.eventId)),
    );

    socket.on('disconnect', () => unbind(socket));
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      room.sweep(now);
      const nobody = room.players.every((p) => p.socketId === null || p.bot);
      const lastSeen = Math.max(room.lastActivityAt, ...room.players.map((p) => p.disconnectedAt ?? 0));
      if (
        room.players.length === 0 ||
        (nobody && now - lastSeen > ABANDONED_ROOM_MS) ||
        now - room.createdAt > MAX_ROOM_AGE_MS
      ) {
        room.dispose();
        rooms.delete(code);
      }
    }
  }, 1_000);

  await new Promise<void>((resolve) => http.listen(opts.port ?? 0, resolve));
  const addr = http.address();
  const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 0);

  return {
    port,
    http,
    io,
    rooms,
    close: async () => {
      clearInterval(sweeper);
      for (const r of rooms.values()) r.dispose();
      io.close();
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}

// Run directly: `tsx server/index.ts`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prod = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT ?? (prod ? 3000 : (process.env.CQ_SERVER_PORT ?? 3001)));
  const timeScale = Number(process.env.CQ_TIME_SCALE ?? 1) || 1;
  startServer({ port, timeScale, serveClient: prod }).then((s) => {
    console.log(`[context-quest] ${prod ? 'serving game' : 'game server'} on http://localhost:${s.port}` + (timeScale !== 1 ? ` (time ×${timeScale})` : ''));
  });
}
