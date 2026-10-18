import { randomBytes } from 'node:crypto';
import type {
  ActivityItem,
  Ack,
  ChatMessage,
  ConfidenceId,
  EventId,
  Phase,
  PublicPlayer,
  QuestionId,
  ResultView,
  RoleId,
  RoomView,
  Seat,
  TimelineState,
} from '../shared/protocol';
import { MAX_PLAYERS } from '../shared/protocol';
import { cardsForRole, computeResult, eventSupport, publicCard } from './case/analysis';
import type { CaseDefinition } from './case/types';
import { CHAT_KEEP, CHAT_MAX_LEN, CHAT_MIN_GAP_MS, DROP_GRACE_MS, HOLD_MS, LOBBY_GRACE_MS, REVEAL_SETTLE_MS } from './config';

export interface Player {
  id: string;
  token: string;
  seat: Seat;
  name: string;
  socketId: string | null;
  disconnectedAt: number | null;
  ready: boolean;
  roleId: RoleId | null;
  introDone: boolean;
  theory: { hypothesisId: string | null; confidence: ConfidenceId | null; lockedAt: number } | null;
  selecting: boolean;
  revealedCardId: string | null;
  lastChatAt: number;
  /** Demo player driven by the server. */
  bot?: boolean;
  /** Bot bookkeeping: which one-off actions it has already done this round. */
  botDone?: Set<string>;
}

type Result = Ack;
const ok = (): Result => ({ ok: true });
const err = (code: string, error: string): Result => ({ ok: false, code, error });

export const newId = (bytes = 9) => randomBytes(bytes).toString('base64url');

export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return s || fallback;
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  lastActivityAt = Date.now();
  players: Player[] = [];
  hostId = '';
  phase: Phase = 'lobby';
  demo = false;

  roundNumber = 0;
  startedAt = 0;
  phaseStartedAt = 0;
  closedAt: number | null = null;
  private settling = false;

  revealed: { cardId: string; playerId: string; at: number; auto: boolean }[] = [];
  order: EventId[] = [];
  version = 0;
  private moveSeq = 0;
  holds = new Map<EventId, { playerId: string; until: number }>();
  doubts = new Map<EventId, Set<string>>();
  lastMove: TimelineState['lastMove'] = null;
  answers: Partial<Record<QuestionId, { optionId: string; by: string; at: number }>> = {};
  signatures = new Set<string>();
  result: ResultView | null = null;

  chat: ChatMessage[] = [];
  private chatSeq = 0;
  private activity: ActivityItem[] = [];
  private activitySeq = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    code: string,
    private readonly def: CaseDefinition,
    private readonly timeScale: number,
    private readonly onChange: (room: Room) => void,
  ) {
    this.code = code;
  }

  // ───────────────────────── helpers ─────────────────────────

  private scaled(ms: number) {
    return Math.round(ms * this.timeScale);
  }
  player(id: string) {
    return this.players.find((p) => p.id === id);
  }
  playerByToken(token: string) {
    return this.players.find((p) => p.token === token);
  }
  connected() {
    return this.players.filter((p) => p.socketId !== null);
  }
  private changed() {
    this.lastActivityAt = Date.now();
    this.onChange(this);
  }
  private log(kind: ActivityItem['kind'], text: string, playerId: string | null = null) {
    this.activity.push({ id: ++this.activitySeq, at: Date.now(), playerId, kind, text });
    if (this.activity.length > 40) this.activity.shift();
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private schedule(at: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, Math.max(0, at - Date.now()));
  }
  dispose() {
    this.clearTimer();
  }
  private enterPhase(phase: Phase) {
    this.phase = phase;
    this.phaseStartedAt = Date.now();
  }

  /** A player who has been offline past the grace period no longer holds the team up. */
  private gone(p: Player, now = Date.now()) {
    return p.socketId === null && p.disconnectedAt !== null && now - p.disconnectedAt > this.scaled(DROP_GRACE_MS);
  }

  /**
   * No countdown: a phase ends when every present player is done. Players who are gone get
   * their turn handled for them (no theory; a random card revealed) so nobody is stuck.
   */
  private checkAdvance(now = Date.now()) {
    const waiting = (done: (p: Player) => boolean) => this.players.some((p) => !done(p) && !this.gone(p, now));
    if (this.players.every((p) => this.gone(p, now))) return; // nobody left to play
    switch (this.phase) {
      case 'intro':
        if (!waiting((p) => p.introDone)) this.enterPhase('evidence');
        break;
      case 'evidence':
        if (waiting((p) => !!p.theory)) return;
        for (const p of this.players) {
          if (!p.theory) {
            p.theory = { hypothesisId: null, confidence: null, lockedAt: now };
            this.log('lock', `${p.name} was away — no theory locked`, p.id);
          }
        }
        this.enterPhase('reveal');
        break;
      case 'reveal':
        if (this.settling || waiting((p) => !!p.revealedCardId)) return;
        for (const p of this.players) {
          if (!p.revealedCardId) {
            const hand = cardsForRole(this.def, p.roleId!);
            this.doReveal(p, hand[Math.floor(Math.random() * hand.length)].id, true);
          }
        }
        this.settleReveal();
        break;
      case 'board':
        this.maybeSubmit();
        break;
      default:
        break;
    }
  }

  // ───────────────────────── lobby ─────────────────────────

  addPlayer(name: string, socketId: string): Player | Result {
    if (this.phase !== 'lobby') return err('IN_PROGRESS', 'That case is already under way. Ask the team for a new room.');
    if (this.players.length >= MAX_PLAYERS) return err('ROOM_FULL', 'This room already has three investigators.');
    const taken = new Set(this.players.map((p) => p.seat));
    const seat = ([0, 1, 2] as Seat[]).find((s) => !taken.has(s))!;
    const p: Player = {
      id: newId(6),
      token: newId(24),
      seat,
      name: cleanName(name, `Investigator ${seat + 1}`),
      socketId,
      disconnectedAt: null,
      ready: false,
      roleId: null,
      introDone: false,
      theory: null,
      selecting: false,
      revealedCardId: null,
      lastChatAt: 0,
    };
    this.players.push(p);
    this.players.sort((a, b) => a.seat - b.seat);
    if (!this.hostId) this.hostId = p.id;
    this.log('join', `${p.name} joined the case room`, p.id);
    this.changed();
    return p;
  }

  attach(p: Player, socketId: string) {
    const wasAway = p.socketId === null;
    p.socketId = socketId;
    p.disconnectedAt = null;
    if (wasAway && this.phase !== 'lobby') this.log('join', `${p.name} reconnected`, p.id);
    this.changed();
  }

  detach(socketId: string) {
    const p = this.players.find((x) => x.socketId === socketId);
    if (!p) return;
    p.socketId = null;
    p.disconnectedAt = Date.now();
    p.selecting = false;
    for (const [e, h] of this.holds) if (h.playerId === p.id) this.holds.delete(e);
    if (this.phase === 'lobby') p.ready = false;
    this.log('leave', `${p.name} lost connection`, p.id);
    this.changed();
  }

  leave(playerId: string): Result {
    const p = this.player(playerId);
    if (!p) return ok();
    if (this.phase === 'lobby') {
      this.removePlayer(p);
      this.log('leave', `${p.name} left the room`, p.id);
    } else {
      p.socketId = null;
      p.disconnectedAt = Date.now();
      this.log('leave', `${p.name} stepped away`, p.id);
    }
    this.changed();
    return ok();
  }

  private removePlayer(p: Player) {
    this.players = this.players.filter((x) => x.id !== p.id);
    // Demo players never outlive the humans (and never become host).
    if (!this.players.some((x) => !x.bot)) {
      this.players = [];
      this.demo = false;
    }
    if (this.hostId === p.id) {
      const next = this.connected().find((x) => !x.bot) ?? this.players.find((x) => !x.bot);
      this.hostId = next?.id ?? '';
      if (next) this.log('system', `${next.name} is now the host`, next.id);
    }
  }

  /** Called periodically: drops lobby players who never came back, expires drag holds. */
  sweep(now: number) {
    let dirty = false;
    if (this.phase === 'lobby') {
      for (const p of [...this.players]) {
        if (p.socketId === null && p.disconnectedAt !== null && now - p.disconnectedAt > LOBBY_GRACE_MS) {
          this.removePlayer(p);
          this.log('leave', `${p.name}'s seat was freed`, p.id);
          dirty = true;
        }
      }
    }
    for (const [e, h] of this.holds) {
      if (h.until < now) {
        this.holds.delete(e);
        dirty = true;
      }
    }
    if (this.demo) this.driveBots(now);
    if (this.phase !== 'lobby' && this.phase !== 'truth') {
      const before = `${this.phase}|${this.revealed.length}`;
      this.checkAdvance(now);
      if (`${this.phase}|${this.revealed.length}` !== before) dirty = true;
    }
    if (dirty) this.changed();
  }

  rename(playerId: string, name: string): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'lobby') return err('PHASE', 'Names are fixed once the case opens.');
    p.name = cleanName(name, p.name);
    this.changed();
    return ok();
  }

  setReady(playerId: string, ready: boolean): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'lobby') return err('PHASE', 'The case is already open.');
    if (p.ready === !!ready) return ok();
    p.ready = !!ready;
    if (p.ready) this.log('ready', `${p.name} is ready`, p.id);
    this.changed();
    return ok();
  }

  // ───────────────────────── round ─────────────────────────

  start(playerId: string): Result {
    if (this.phase !== 'lobby') return err('PHASE', 'The case is already open.');
    if (playerId !== this.hostId) return err('NOT_HOST', 'Only the host can open the case.');
    if (this.players.length !== MAX_PLAYERS) return err('NEED_THREE', 'Exactly three investigators are needed.');
    if (this.players.some((p) => p.socketId === null)) return err('DISCONNECTED', 'Someone is disconnected.');
    if (this.players.some((p) => !p.ready)) return err('NOT_READY', 'Everyone must be ready first.');

    this.roundNumber++;
    this.startedAt = Date.now();
    this.closedAt = null;
    this.chat = [];
    this.settling = false;
    this.revealed = [];
    this.order = [...this.def.initialOrder];
    this.version = 0;
    this.holds.clear();
    this.doubts.clear();
    this.lastMove = null;
    this.answers = {};
    this.signatures.clear();
    this.result = null;
    for (const p of this.players) {
      // Roles rotate every round so replays show a new perspective.
      p.roleId = this.def.roleOrder[(p.seat + this.roundNumber - 1) % 3];
      p.introDone = false;
      p.theory = null;
      p.selecting = false;
      p.revealedCardId = null;
      if (p.bot) p.botDone = new Set();
    }
    this.log('start', `Case ${this.def.public.number} opened — the stopwatch is running`);
    this.enterPhase('intro');
    this.changed();
    return ok();
  }

  introDone(playerId: string): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'intro') return ok();
    p.introDone = true;
    this.checkAdvance();
    this.changed();
    return ok();
  }

  lockTheory(playerId: string, hypothesisId: unknown, confidence: unknown): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'evidence') return err('PHASE', 'Theories can only be locked before evidence is shared.');
    if (p.theory) return ok(); // already locked — idempotent, never editable
    if (!this.def.public.hypotheses.some((h) => h.id === hypothesisId)) return err('BAD_INPUT', 'Pick a theory first.');
    if (!this.def.public.confidences.some((c) => c.id === confidence)) return err('BAD_INPUT', 'Pick a confidence.');
    p.theory = { hypothesisId: hypothesisId as string, confidence: confidence as ConfidenceId, lockedAt: Date.now() };
    this.log('lock', `${p.name} locked a private theory`, p.id);
    this.checkAdvance();
    this.changed();
    return ok();
  }

  setSelecting(playerId: string, on: boolean) {
    const p = this.player(playerId)!;
    if (this.phase !== 'reveal' || p.revealedCardId) return;
    if (p.selecting === !!on) return;
    p.selecting = !!on;
    this.changed();
  }

  revealCard(playerId: string, cardId: unknown): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'reveal' || this.settling) return err('PHASE', 'Evidence can only be shared during the reveal.');
    if (p.revealedCardId) {
      return p.revealedCardId === cardId ? ok() : err('ALREADY_REVEALED', 'You have already shared your one card.');
    }
    const hand = cardsForRole(this.def, p.roleId!);
    if (!hand.some((c) => c.id === cardId)) return err('BAD_INPUT', 'That card is not in your hand.');
    this.doReveal(p, cardId as string, false);
    this.checkAdvance();
    this.changed();
    return ok();
  }

  private doReveal(p: Player, cardId: string, auto: boolean) {
    p.revealedCardId = cardId;
    p.selecting = false;
    this.revealed.push({ cardId, playerId: p.id, at: Date.now(), auto });
    const card = this.def.cards.find((c) => c.id === cardId)!;
    this.log('reveal', auto ? `${p.name} was away — “${card.title}” was pulled from their hand` : `${p.name} pinned “${card.title}”`, p.id);
  }

  private settleReveal() {
    if (this.settling) return;
    this.settling = true;
    this.schedule(Date.now() + this.scaled(REVEAL_SETTLE_MS), () => {
      this.settling = false;
      this.enterPhase('board');
      this.log('system', 'All evidence is on the board. Rebuild the timeline.');
      this.changed();
    });
  }

  // ───────────────────────── board ─────────────────────────

  private validEvent(e: unknown): e is EventId {
    return typeof e === 'string' && this.order.includes(e as EventId);
  }
  private heldByOther(e: EventId, playerId: string) {
    const h = this.holds.get(e);
    return h && h.playerId !== playerId && h.until > Date.now() ? h : null;
  }
  private clearSignatures(reason: string, by: Player) {
    if (this.signatures.size === 0) return;
    this.signatures.clear();
    this.log('sign', `Signatures cleared — ${by.name} ${reason}`, by.id);
  }

  hold(playerId: string, eventId: unknown) {
    if (this.phase !== 'board') return;
    for (const [e, h] of this.holds) if (h.playerId === playerId) this.holds.delete(e);
    if (eventId !== null && this.validEvent(eventId) && !this.heldByOther(eventId, playerId)) {
      this.holds.set(eventId, { playerId, until: Date.now() + HOLD_MS });
    }
    this.changed();
  }

  move(playerId: string, eventId: unknown, toIndex: unknown): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'board') return err('PHASE', 'The timeline is closed.');
    if (!this.validEvent(eventId)) return err('BAD_INPUT', 'Unknown event.');
    if (typeof toIndex !== 'number' || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this.order.length) {
      return err('BAD_INPUT', 'Bad position.');
    }
    const other = this.heldByOther(eventId, playerId);
    if (other) return err('HELD', `${this.player(other.playerId)?.name ?? 'Someone'} is moving that event.`);
    const from = this.order.indexOf(eventId);
    if (this.holds.get(eventId)?.playerId === playerId) this.holds.delete(eventId);
    if (from === toIndex) {
      this.changed();
      return ok();
    }
    this.order.splice(from, 1);
    this.order.splice(toIndex, 0, eventId);
    this.version++;
    this.lastMove = { seq: ++this.moveSeq, by: playerId, eventId, from, to: toIndex, at: Date.now() };
    const title = this.def.public.events.find((e) => e.id === eventId)!.title;
    this.log('move', `${p.name} moved “${title}” to #${toIndex + 1}`, p.id);
    this.clearSignatures('changed the timeline', p);
    this.changed();
    return ok();
  }

  doubt(playerId: string, eventId: unknown, on: unknown): Result {
    if (this.phase !== 'board') return err('PHASE', 'The timeline is closed.');
    if (!this.validEvent(eventId)) return err('BAD_INPUT', 'Unknown event.');
    const set = this.doubts.get(eventId) ?? new Set<string>();
    if (on) set.add(playerId);
    else set.delete(playerId);
    this.doubts.set(eventId, set);
    if (on) {
      const p = this.player(playerId)!;
      const title = this.def.public.events.find((e) => e.id === eventId)!.title;
      this.log('doubt', `${p.name} disputes the position of “${title}”`, p.id);
    }
    this.changed();
    return ok();
  }

  setAnswer(playerId: string, questionId: unknown, optionId: unknown): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'board') return err('PHASE', 'The verdict is closed.');
    const q = this.def.public.questions.find((x) => x.id === questionId);
    if (!q || !q.options.some((o) => o.id === optionId)) return err('BAD_INPUT', 'Unknown answer.');
    if (this.answers[q.id]?.optionId === optionId) return ok();
    this.answers[q.id] = { optionId: optionId as string, by: playerId, at: Date.now() };
    this.log('verdict', `${p.name} set “${q.prompt}”`, p.id);
    this.clearSignatures('changed the verdict', p);
    this.changed();
    return ok();
  }

  sign(playerId: string, signed: unknown): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'board') return err('PHASE', 'The verdict is closed.');
    if (signed) {
      if (this.def.public.questions.some((q) => !this.answers[q.id])) {
        return err('INCOMPLETE', 'Answer all three questions before signing.');
      }
      if (this.signatures.has(playerId)) return ok();
      this.signatures.add(playerId);
      this.log('sign', `${p.name} signed the case file`, p.id);
      this.maybeSubmit();
    } else {
      if (!this.signatures.delete(playerId)) return ok();
      this.log('sign', `${p.name} withdrew their signature`, p.id);
    }
    this.changed();
    return ok();
  }

  /** Files once every present investigator has signed. Players who are gone can't block the team. */
  private maybeSubmit() {
    if (this.phase !== 'board' || this.signatures.size === 0) return;
    if (this.players.every((p) => this.signatures.has(p.id) || this.gone(p))) this.submit(false);
  }

  private submit(auto: boolean) {
    if (this.phase !== 'board') return; // never twice
    const now = Date.now();
    this.closedAt = now;
    this.holds.clear();
    this.result = computeResult(this.def, {
      order: this.order,
      answers: this.answers,
      revealed: this.revealed.map((r) => ({ cardId: r.cardId, playerId: r.playerId })),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        roleId: p.roleId!,
        theory: p.theory,
      })),
      startedAt: this.startedAt,
      submittedAt: now,
      auto,
    });
    this.log('system', 'Case filed. The truth is coming out.');
    this.enterPhase('truth');
  }

  sendChat(playerId: string, text: unknown, eventId: unknown): Result {
    const p = this.player(playerId)!;
    if (this.phase !== 'board' && this.phase !== 'truth') return err('PHASE', 'Chat opens once the shared board is up.');
    if (typeof text !== 'string') return err('BAD_INPUT', 'Empty message.');
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!clean) return err('BAD_INPUT', 'Empty message.');
    const now = Date.now();
    if (now - p.lastChatAt < CHAT_MIN_GAP_MS) return err('SLOW_DOWN', 'Slow down a little.');
    p.lastChatAt = now;
    const ev = typeof eventId === 'string' && this.def.public.events.some((e) => e.id === eventId) ? (eventId as EventId) : undefined;
    this.chat.push({ id: ++this.chatSeq, at: now, playerId, text: clean, ...(ev ? { eventId: ev } : {}) });
    if (this.chat.length > CHAT_KEEP) this.chat.shift();
    this.changed();
    return ok();
  }

  /** Host only: wipe the team chat for everyone. */
  clearChat(playerId: string): Result {
    if (playerId !== this.hostId) return err('NOT_HOST', 'Only the host can clear the chat.');
    if (this.chat.length === 0) return ok();
    this.chat = [];
    const p = this.player(playerId)!;
    this.log('system', `${p.name} cleared the team chat`, p.id);
    this.changed();
    return ok();
  }

  // ───────────────────────── demo mode (host only) ─────────────────────────

  private static BOT_NAMES = ['Meera', 'Arjun'];
  /** The theory each role finds most tempting from its own clues. */
  private static BOT_THEORY: Record<RoleId, string> = { tech: 'h-system', volunteer: 'h-failure', guard: 'h-sabotage' };
  private static BOT_LINE: Record<RoleId, string> = {
    tech: 'My card: the power box warned about a check-up at 9:00 — four minutes before the lights went out.',
    volunteer: 'The generator tried to start 3 times right after 9:04. Its battery was flat.',
    guard: 'The hooded guy went in at 9:06 — the lights were already out by then.',
  };

  /** Fill the empty seats with server-driven demo players. */
  startDemo(playerId: string): Result {
    if (playerId !== this.hostId) return err('NOT_HOST', 'Only the host can start demo mode.');
    if (this.phase !== 'lobby') return err('PHASE', 'Start demo mode from the lobby.');
    const names = Room.BOT_NAMES.filter((n) => !this.players.some((p) => p.name === n));
    while (this.players.length < MAX_PLAYERS) {
      const added = this.addPlayer(names.shift() ?? 'Demo', `bot:${newId(4)}`);
      if ('ok' in added) break;
      added.bot = true;
      added.ready = true;
      added.botDone = new Set();
    }
    this.demo = this.players.some((p) => p.bot);
    this.log('system', 'Demo mode: two demo investigators joined. They play their own turns.');
    this.changed();
    return ok();
  }

  stopDemo(playerId: string): Result {
    if (playerId !== this.hostId) return err('NOT_HOST', 'Only the host can end demo mode.');
    if (this.phase !== 'lobby') return err('PHASE', 'Demo players can only leave from the lobby.');
    this.players = this.players.filter((p) => !p.bot);
    this.demo = false;
    this.log('system', 'Demo players left. Seats are open again.');
    this.changed();
    return ok();
  }

  /** Does the host's next move for them, so a demo can run start to finish with one button. */
  demoStep(playerId: string): Result {
    if (!this.demo) return err('NOT_DEMO', 'Demo mode is off.');
    if (playerId !== this.hostId) return err('NOT_HOST', 'Only the host can drive the demo.');
    const me = this.player(playerId)!;
    switch (this.phase) {
      case 'lobby':
        if (!me.ready) return this.setReady(playerId, true);
        return this.start(playerId);
      case 'intro':
        return this.introDone(playerId);
      case 'evidence':
        return this.lockTheory(playerId, Room.BOT_THEORY[me.roleId!], 'fairly');
      case 'reveal':
        if (me.revealedCardId) return ok();
        return this.revealCard(playerId, this.bestCard(me));
      case 'board': {
        const truth = this.def.canonical.map((e) => e.id);
        const solved = truth.every((id, i) => this.order[i] === id);
        const answered = this.def.public.questions.every((q) => this.answers[q.id]);
        if (!solved || !answered) {
          for (let i = 0; i < truth.length; i++) {
            if (this.order[i] !== truth[i]) this.move(playerId, truth[i], i);
          }
          // A realistic demo answer: two right, one common mistake, so the truth screen shows both.
          this.setAnswer(playerId, 'cause', this.def.answerKey.cause);
          this.setAnswer(playerId, 'generator', 'gen-blocked');
          this.setAnswer(playerId, 'visitor', this.def.answerKey.visitor);
          return ok();
        }
        return this.sign(playerId, true);
      }
      default:
        return ok();
    }
  }

  private bestCard(p: Player) {
    const hand = cardsForRole(this.def, p.roleId!);
    return (hand.find((c) => Object.values(c.supports).includes('proves')) ?? hand[0]).id;
  }

  /** Bots act on a short, staggered delay after each phase starts, so their moves are visible. */
  private driveBots(now: number) {
    const since = now - this.phaseStartedAt;
    for (const b of this.players.filter((p) => p.bot)) {
      const lag = this.scaled((b.seat + 1) * 1200);
      const once = (key: string, after: number, fn: () => void) => {
        if (since < after || b.botDone?.has(key)) return;
        b.botDone?.add(key);
        fn();
      };
      switch (this.phase) {
        case 'lobby':
          if (!b.ready) this.setReady(b.id, true);
          break;
        case 'intro':
          once('intro', this.scaled(1500) + lag, () => this.introDone(b.id));
          break;
        case 'evidence':
          once('theory', this.scaled(2500) + lag, () => this.lockTheory(b.id, Room.BOT_THEORY[b.roleId!], 'hunch'));
          break;
        case 'reveal':
          once('reveal', this.scaled(2000) + lag * 1.5, () => this.revealCard(b.id, this.bestCard(b)));
          break;
        case 'board': {
          once('chat', this.scaled(2500) + lag * 2, () => this.sendChat(b.id, Room.BOT_LINE[b.roleId!], undefined));
          const humans = this.players.filter((p) => !p.bot);
          if (!this.signatures.has(b.id) && humans.length > 0 && humans.every((h) => this.signatures.has(h.id))) {
            this.sign(b.id, true);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  newRound(playerId: string): Result {
    if (this.phase !== 'truth') return err('PHASE', 'Finish this case first.');
    const host = this.player(this.hostId);
    if (playerId !== this.hostId && host?.socketId) return err('NOT_HOST', 'Only the host can start a new round.');
    if (playerId !== this.hostId) this.hostId = playerId;
    this.phase = 'lobby';
    this.clearTimer();
    this.result = null;
    this.chat = [];
    this.revealed = [];
    for (const p of this.players) {
      p.ready = !!p.bot;
      p.roleId = null;
      p.theory = null;
      p.revealedCardId = null;
      p.introDone = false;
      p.selecting = false;
    }
    this.signatures.clear();
    this.log('system', 'New round — get ready. Roles will rotate.');
    this.changed();
    return ok();
  }

  // ───────────────────────── projection ─────────────────────────

  /** The only way state leaves the server. Private cards and theories are included for their owner only. */
  viewFor(playerId: string): RoomView {
    const me = this.player(playerId)!;
    const now = Date.now();
    const pub = this.def.public;
    const cardById = new Map(this.def.cards.map((c) => [c.id, c]));
    const onBoard = this.phase === 'board' || this.phase === 'truth';

    const players: PublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      name: p.name,
      isHost: p.id === this.hostId,
      connected: p.socketId !== null,
      ready: p.ready,
      roleId: p.roleId,
      introDone: p.introDone,
      theoryLocked: !!p.theory,
      selecting: p.selecting,
      revealedCardId: p.revealedCardId,
      signed: this.signatures.has(p.id),
      bot: !!p.bot,
    }));

    const holds: Partial<Record<EventId, string>> = {};
    for (const [e, h] of this.holds) if (h.until > now) holds[e] = h.playerId;
    const doubts: Partial<Record<EventId, string[]>> = {};
    for (const [e, s] of this.doubts) if (s.size) doubts[e] = [...s];

    const role = me.roleId ? pub.roles.find((r) => r.id === me.roleId)! : null;

    return {
      code: this.code,
      phase: this.phase,
      you: me.id,
      hostId: this.hostId,
      players,
      round:
        this.roundNumber === 0 || this.phase === 'lobby'
          ? null
          : { number: this.roundNumber, startedAt: this.startedAt, phaseStartedAt: this.phaseStartedAt, closedAt: this.closedAt },
      case: pub,
      private:
        role && this.phase !== 'lobby'
          ? {
              role,
              cards: cardsForRole(this.def, role.id).map(publicCard),
              theory: me.theory,
            }
          : null,
      revealed: this.revealed.map((r) => ({
        card: publicCard(cardById.get(r.cardId)!),
        playerId: r.playerId,
        seat: this.player(r.playerId)?.seat ?? 0,
        at: r.at,
        auto: r.auto,
      })),
      timeline: onBoard
        ? {
            order: [...this.order],
            version: this.version,
            holds,
            doubts,
            lastMove: this.lastMove,
            support: eventSupport(this.revealed.map((r) => cardById.get(r.cardId)!)),
          }
        : null,
      verdict: onBoard ? { answers: { ...this.answers }, signatures: [...this.signatures] } : null,
      result: this.phase === 'truth' ? this.result : null,
      activity: this.activity.slice(-14),
      chat: onBoard ? this.chat.slice(-60) : [],
      demo: this.demo,
      serverNow: now,
    };
  }
}
