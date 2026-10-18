import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer, type RunningServer } from '../server/index';
import { case001 } from '../server/case/case001';
import { computeResult } from '../server/case/analysis';
import type { Ack, EventId, RoomView, SessionInfo } from '../shared/protocol';

type Client = { sock: Socket; view: () => RoomView | null; kicked: () => string | null; session?: SessionInfo };

let server: RunningServer | null = null;
const clients: Socket[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server?.close();
  server = null;
});

function client(port: number): Promise<Client> {
  const sock = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(sock);
  let last: RoomView | null = null;
  let kicked: string | null = null;
  sock.on('state', (v: RoomView) => (last = v));
  sock.on('kicked', (p: { reason: string }) => (kicked = p.reason));
  return new Promise((resolve) => sock.on('connect', () => resolve({ sock, view: () => last, kicked: () => kicked })));
}

function emit<T = unknown>(c: Client, event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (payload === undefined) c.sock.emit(event, resolve);
    else c.sock.emit(event, payload, resolve);
  });
}

async function waitFor(c: Client, pred: (v: RoomView) => boolean, ms = 5000): Promise<RoomView> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = c.view();
    if (v && pred(v)) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`timed out; last phase = ${c.view()?.phase}`);
}

async function threePlayers(timeScale = 1) {
  server = await startServer({ port: 0, timeScale });
  const [host, b, c] = await Promise.all([client(server.port), client(server.port), client(server.port)]);
  const created = await emit<SessionInfo>(host, 'room:create', { name: 'Asha' });
  if (!created.ok) throw new Error('create failed');
  host.session = created;
  for (const [cl, name] of [[b, 'Bilal'], [c, 'Chen']] as const) {
    const r = await emit<SessionInfo>(cl, 'room:join', { code: created.code.toLowerCase(), name });
    if (!r.ok) throw new Error(r.error);
    cl.session = r;
  }
  return { host, b, c, all: [host, b, c], code: created.code };
}

async function startRound(all: Client[]) {
  for (const cl of all) expect((await emit(cl, 'player:ready', { ready: true })).ok).toBe(true);
  expect((await emit(all[0], 'game:start')).ok).toBe(true);
  await Promise.all(all.map((cl) => waitFor(cl, (v) => v.phase === 'intro')));
}

describe('three-player room', () => {
  it('runs a complete round with privacy, one-card rule, concurrent edits and a deterministic score', async () => {
    const { host, b, c, all, code } = await threePlayers();

    // A fourth investigator cannot join.
    const extra = await client(server!.port);
    const full = await emit(extra, 'room:join', { code, name: 'Dee' });
    expect(full.ok === false && full.code).toBe('ROOM_FULL');

    // The host is a normal player in seat 0.
    await waitFor(host, (v) => v.players.length === 3);
    expect(host.view()!.players.map((p) => p.name)).toEqual(['Asha', 'Bilal', 'Chen']);
    expect(host.view()!.players[0].isHost).toBe(true);

    // Start rules.
    const early = await emit(host, 'game:start');
    expect(early.ok === false && early.code).toBe('NOT_READY');
    for (const cl of all) await emit(cl, 'player:ready', { ready: true });
    const notHost = await emit(b, 'game:start');
    expect(notHost.ok === false && notHost.code).toBe('NOT_HOST');
    expect((await emit(host, 'game:start')).ok).toBe(true);
    await Promise.all(all.map((cl) => waitFor(cl, (v) => v.phase === 'intro' && !!v.private)));

    // Everyone — including the host — holds exactly their own three cards, and nobody else's.
    const roles = all.map((cl) => cl.view()!.private!.role.id);
    expect(new Set(roles).size).toBe(3);
    for (const cl of all) {
      const v = cl.view()!;
      expect(v.private!.cards).toHaveLength(3);
      const json = JSON.stringify(v);
      for (const card of case001.cards.filter((k) => k.roleId !== v.private!.role.id)) {
        expect(json.includes(`"${card.id}"`), `${card.id} leaked`).toBe(false);
        expect(json.includes(card.title), `${card.title} leaked`).toBe(false);
      }
      // No answer key or analysis before the truth phase.
      expect(v.result).toBeNull();
      for (const card of case001.cards) expect(json.includes(card.caution)).toBe(false);
      expect(json.includes(case001.headline)).toBe(false);
    }

    // Can't reveal before theories are locked.
    const tooSoon = await emit(host, 'reveal:card', { cardId: host.view()!.private!.cards[0].id });
    expect(tooSoon.ok === false && tooSoon.code).toBe('PHASE');

    for (const cl of all) await emit(cl, 'intro:done');
    await Promise.all(all.map((cl) => waitFor(cl, (v) => v.phase === 'evidence')));

    // Theory lock: validated, then immutable.
    const bad = await emit(host, 'theory:lock', { hypothesisId: 'nope', confidence: 'hunch' });
    expect(bad.ok).toBe(false);
    await emit(host, 'theory:lock', { hypothesisId: 'h-sabotage', confidence: 'certain' });
    await emit(host, 'theory:lock', { hypothesisId: 'h-system', confidence: 'hunch' });
    await waitFor(host, (v) => v.private!.theory?.hypothesisId === 'h-sabotage');
    // Other players see that the host locked, but not what.
    const seenByB = await waitFor(b, (v) => v.players[0].theoryLocked);
    expect(JSON.stringify({ ...seenByB, case: null }).includes('h-sabotage')).toBe(false);
    expect(seenByB.private!.theory).toBeNull();
    await emit(b, 'theory:lock', { hypothesisId: 'h-failure', confidence: 'fairly' });
    await emit(c, 'theory:lock', { hypothesisId: 'h-system', confidence: 'hunch' });
    await Promise.all(all.map((cl) => waitFor(cl, (v) => v.phase === 'reveal')));

    // One card each. Not someone else's, not twice.
    const otherCard = b.view()!.private!.cards[0].id;
    const steal = await emit(host, 'reveal:card', { cardId: otherCard });
    expect(steal.ok === false && steal.code).toBe('BAD_INPUT');
    const picks = all.map((cl) => cl.view()!.private!.cards[1].id);
    expect((await emit(host, 'reveal:card', { cardId: picks[0] })).ok).toBe(true);
    expect((await emit(host, 'reveal:card', { cardId: picks[0] })).ok).toBe(true); // idempotent retry
    const second = await emit(host, 'reveal:card', { cardId: host.view()!.private!.cards[2].id });
    expect(second.ok === false && second.code).toBe('ALREADY_REVEALED');
    // Everyone sees the host's card on the board.
    await Promise.all(all.map((cl) => waitFor(cl, (v) => v.revealed.some((r) => r.card.id === picks[0]))));
    await emit(b, 'reveal:card', { cardId: picks[1] });
    await emit(c, 'reveal:card', { cardId: picks[2] });
    await Promise.all(all.map((cl) => waitFor(cl, (v) => v.phase === 'board')));
    for (const cl of all) expect(cl.view()!.revealed.map((r) => r.card.id).sort()).toEqual([...picks].sort());

    // Three players hammer the timeline at the same time.
    const events: EventId[] = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
    await Promise.all(
      all.flatMap((cl) =>
        Array.from({ length: 12 }, (_, i) =>
          emit(cl, 'timeline:move', { eventId: events[(i * 7 + cl.sock.id!.length) % 6], toIndex: (i * 5) % 6 }),
        ),
      ),
    );
    const settled = await Promise.all(all.map((cl) => waitFor(cl, (v) => v.timeline!.version === host.view()!.timeline!.version)));
    const finalOrder = settled[0].timeline!.order;
    expect([...finalOrder].sort()).toEqual(events);
    for (const v of settled) expect(v.timeline!.order).toEqual(finalOrder);

    // A tile being dragged by one player can't be moved by another.
    host.sock.emit('timeline:hold', { eventId: 'e1' });
    await waitFor(b, (v) => v.timeline!.holds.e1 === host.session!.playerId);
    const blocked = await emit(b, 'timeline:move', { eventId: 'e1', toIndex: 0 });
    expect(blocked.ok === false && blocked.code).toBe('HELD');
    host.sock.emit('timeline:hold', { eventId: null });

    // Arrange the true order.
    const truth = case001.canonical.map((e) => e.id);
    for (let i = 0; i < truth.length; i++) await emit(c, 'timeline:move', { eventId: truth[i], toIndex: i });
    await waitFor(host, (v) => JSON.stringify(v.timeline!.order) === JSON.stringify(truth));

    // Verdict + signatures.
    const incomplete = await emit(host, 'verdict:sign', { signed: true });
    expect(incomplete.ok === false && incomplete.code).toBe('INCOMPLETE');
    await emit(host, 'verdict:set', { questionId: 'cause', optionId: 'cause-maintenance' });
    await emit(b, 'verdict:set', { questionId: 'generator', optionId: 'gen-blocked' });
    await emit(c, 'verdict:set', { questionId: 'visitor', optionId: 'vis-restorer' });
    await emit(host, 'verdict:sign', { signed: true });
    await waitFor(b, (v) => v.verdict!.signatures.length === 1);
    // Any change clears every signature.
    await emit(b, 'verdict:set', { questionId: 'visitor', optionId: 'vis-botched' });
    await waitFor(host, (v) => v.verdict!.signatures.length === 0);
    await emit(b, 'verdict:set', { questionId: 'visitor', optionId: 'vis-restorer' });

    // Reconnect mid-board: a new socket resumes the same seat with the same private state.
    const before = c.view()!;
    c.sock.disconnect();
    await waitFor(host, (v) => !v.players[2].connected);
    const c2 = await client(server!.port);
    const resumed = await emit<SessionInfo>(c2, 'room:resume', { code, token: c.session!.token });
    expect(resumed.ok && resumed.playerId).toBe(c.session!.playerId);
    const after = await waitFor(c2, (v) => v.phase === 'board');
    expect(after.private!.cards.map((k) => k.id)).toEqual(before.private!.cards.map((k) => k.id));
    expect(after.players[2].revealedCardId).toBe(before.players[2].revealedCardId);
    expect(after.revealed).toHaveLength(3);

    // Opening the same seat elsewhere kicks the older connection.
    const c3 = await client(server!.port);
    await emit(c3, 'room:resume', { code, token: c.session!.token });
    await new Promise((r) => setTimeout(r, 80));
    expect(c2.kicked()).toMatch(/another tab/);
    const stale = await emit(c2, 'verdict:sign', { signed: true });
    expect(stale.ok === false && stale.code).toBe('NO_SESSION');

    // Everyone signs → filed exactly once.
    for (const cl of [host, b, c3]) await emit(cl, 'verdict:sign', { signed: true });
    const done = await waitFor(host, (v) => v.phase === 'truth');
    const dup = await emit(host, 'verdict:sign', { signed: true });
    expect(dup.ok === false && dup.code).toBe('PHASE');

    // The score is exactly what the answer key says for this submission.
    const expected = computeResult(case001, {
      order: truth,
      answers: {
        cause: { optionId: 'cause-maintenance', by: '' },
        generator: { optionId: 'gen-blocked', by: '' },
        visitor: { optionId: 'vis-restorer', by: '' },
      },
      revealed: [],
      players: [],
      startedAt: 0,
      submittedAt: 0,
      auto: false,
    });
    expect(done.result!.score.total).toBe(expected.score.total);
    expect(done.result!.score.total).toBe(30 + 0 + 20 + 30);
    expect(done.result!.auto).toBe(false);
    // Initial theories are revealed only now.
    expect(done.result!.theories.map((t) => t.hypothesisId)).toEqual(['h-sabotage', 'h-failure', 'h-system']);
    // All clients agree.
    for (const cl of [b, c3]) expect((await waitFor(cl, (v) => v.phase === 'truth')).result!.score.total).toBe(80);

    // New round: host only, roles rotate.
    const nope = await emit(b, 'round:again');
    expect(nope.ok === false && nope.code).toBe('NOT_HOST');
    expect((await emit(host, 'round:again')).ok).toBe(true);
    await waitFor(host, (v) => v.phase === 'lobby');
    await startRound([host, b, c3]);
    expect(host.view()!.private!.role.id).not.toBe(roles[0]);
  }, 20_000);

  it('has no countdown: phases wait for everyone, and a player who is gone is handled after the grace period', async () => {
    const { host, b, c, all } = await threePlayers(0.01); // grace period = 200 ms
    await startRound(all);
    const v0 = host.view()!;
    expect(v0.round).not.toHaveProperty('endsAt');
    // Nobody acts: the briefing never ends on its own.
    await new Promise((r) => setTimeout(r, 1200));
    expect(host.view()!.phase).toBe('intro');
    // Two finish the briefing; the third drops out and stays away.
    await emit(host, 'intro:done');
    await emit(b, 'intro:done');
    await new Promise((r) => setTimeout(r, 400));
    expect(host.view()!.phase).toBe('intro'); // still waiting for Chen, who is connected
    c.sock.disconnect();
    await waitFor(host, (v) => v.phase === 'evidence', 4000);
    await emit(host, 'theory:lock', { hypothesisId: 'h-system', confidence: 'hunch' });
    await emit(b, 'theory:lock', { hypothesisId: 'h-failure', confidence: 'fairly' });
    await waitFor(host, (v) => v.phase === 'reveal');
    await emit(host, 'reveal:card', { cardId: host.view()!.private!.cards[0].id });
    await emit(b, 'reveal:card', { cardId: b.view()!.private!.cards[0].id });
    const board = await waitFor(host, (v) => v.phase === 'board', 4000);
    // Chen's card was pulled for them.
    expect(board.revealed).toHaveLength(3);
    expect(board.revealed.filter((r) => r.auto)).toHaveLength(1);
    // Chat works on the board.
    expect((await emit(b, 'chat:send', { text: 'I think it was the check-up', eventId: 'e2' })).ok).toBe(true);
    const chatted = await waitFor(host, (v) => v.chat.length === 1);
    expect(chatted.chat[0]).toMatchObject({ text: 'I think it was the check-up', eventId: 'e2' });
    // Only the host can clear it.
    const notHost = await emit(b, 'chat:clear');
    expect(notHost.ok === false && notHost.code).toBe('NOT_HOST');
    expect((await emit(host, 'chat:clear')).ok).toBe(true);
    await waitFor(b, (v) => v.chat.length === 0);
    // Two signatures are enough when the third player is gone; the stopwatch stops.
    for (const q of [
      ['cause', 'cause-maintenance'],
      ['generator', 'gen-fault'],
      ['visitor', 'vis-restorer'],
    ]) {
      await emit(host, 'verdict:set', { questionId: q[0], optionId: q[1] });
    }
    await emit(host, 'verdict:sign', { signed: true });
    await emit(b, 'verdict:sign', { signed: true });
    const done = await waitFor(host, (v) => v.phase === 'truth', 4000);
    expect(done.round!.closedAt).toBeGreaterThan(done.round!.startedAt);
    expect(done.result!.theories.find((t) => t.name === 'Chen')!.hypothesisId).toBeNull();
  }, 15_000);

  it('a disconnected player cannot block the verdict', async () => {
    const { host, b, c, all } = await threePlayers(0.01);
    await startRound(all);
    for (const cl of all) await emit(cl, 'intro:done');
    for (const cl of all) await waitFor(cl, (v) => v.phase === 'evidence');
    for (const cl of all) await emit(cl, 'theory:lock', { hypothesisId: 'h-system', confidence: 'hunch' });
    for (const cl of all) await waitFor(cl, (v) => v.phase === 'reveal');
    for (const cl of all) await emit(cl, 'reveal:card', { cardId: cl.view()!.private!.cards[0].id });
    await waitFor(host, (v) => v.phase === 'board');
    await emit(host, 'verdict:set', { questionId: 'cause', optionId: 'cause-maintenance' });
    await emit(host, 'verdict:set', { questionId: 'generator', optionId: 'gen-fault' });
    await emit(host, 'verdict:set', { questionId: 'visitor', optionId: 'vis-restorer' });
    c.sock.disconnect();
    await waitFor(host, (v) => !v.players[2].connected);
    await emit(host, 'verdict:sign', { signed: true });
    await emit(b, 'verdict:sign', { signed: true });
    const done = await waitFor(host, (v) => v.phase === 'truth', 4000);
    expect(done.result!.score.parts.slice(0, 3).every((p) => p.earned === p.max)).toBe(true);
  }, 15_000);

  it('demo mode: the host plays a whole round alone with server-driven demo players', async () => {
    server = await startServer({ port: 0, timeScale: 0.1 });
    const host = await client(server.port);
    const created = await emit<SessionInfo>(host, 'room:create', { name: 'Ansh' });
    expect(created.ok).toBe(true);
    const outsider = await client(server.port);
    // Only the host can start it.
    const joined = await emit<SessionInfo>(outsider, 'room:join', { code: created.ok ? created.code : '', name: 'X' });
    const notHost = await emit(outsider, 'demo:start');
    expect(notHost.ok === false && notHost.code).toBe('NOT_HOST');
    expect(joined.ok).toBe(true);
    outsider.sock.disconnect();
    await emit(host, 'room:leave').catch(() => {});
    // Fresh room for the solo demo.
    const solo = await client(server.port);
    await emit<SessionInfo>(solo, 'room:create', { name: 'Ansh' });
    expect((await emit(solo, 'demo:start')).ok).toBe(true);
    const lobby = await waitFor(solo, (v) => v.players.length === 3);
    expect(lobby.demo).toBe(true);
    expect(lobby.players.filter((p) => p.bot)).toHaveLength(2);
    expect(lobby.players.find((p) => p.isHost)!.bot).toBe(false);
    // One button walks the host through every stage; demo players act on their own.
    for (let i = 0; i < 20; i++) {
      const v = solo.view()!;
      if (v.phase === 'truth') break;
      await emit(solo, 'demo:step');
      await new Promise((r) => setTimeout(r, 450));
    }
    const done = await waitFor(solo, (v) => v.phase === 'truth', 8000);
    expect(done.revealed).toHaveLength(3);
    expect(done.revealed.every((r) => !r.auto)).toBe(true);
    expect(done.result!.score.total).toBe(80); // cause ✓, generator ✗ (deliberate), visitor ✓, timeline ✓
    expect(done.chat.length).toBeGreaterThanOrEqual(1);
    expect(done.result!.theories.map((t) => t.hypothesisId).every(Boolean)).toBe(true);
  }, 20_000);

  it('rejects joining a game in progress and unknown rooms', async () => {
    const { all, code } = await threePlayers();
    await startRound(all);
    const late = await client(server!.port);
    const r = await emit(late, 'room:join', { code, name: 'Late' });
    expect(r.ok === false && r.code).toBe('IN_PROGRESS');
    const r2 = await emit(late, 'room:join', { code: 'ZZZZ', name: 'Late' });
    expect(r2.ok === false && r2.code).toBe('NOT_FOUND');
  });
});
