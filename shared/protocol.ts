// Wire protocol shared by server and client.
// Everything in here is safe for any client to see; the answer key and card
// analysis live only in server/case and are sent only in the truth phase.

export type Phase = 'lobby' | 'intro' | 'evidence' | 'reveal' | 'board' | 'truth';
export type Seat = 0 | 1 | 2;
export const MAX_PLAYERS = 3;

export type RoleId = 'tech' | 'volunteer' | 'guard';
export type EventId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6';
export type QuestionId = 'cause' | 'generator' | 'visitor';
export type ConfidenceId = 'hunch' | 'fairly' | 'certain';
export type Strength = 'proves' | 'suggests';

// ---------- Evidence cards ----------

/** A line of evidence text. `refs` link the line to timeline events it speaks to. */
export interface RefLine {
  text: string;
  time?: string;
  who?: string;
  refs?: EventId[];
  mine?: boolean;
}

export type CardBody =
  | { kind: 'log'; header: string; lines: (RefLine & { tag: string })[] }
  | {
      kind: 'cuesheet';
      header: string;
      rows: { cue: string; item: string; time: string }[];
      notes: RefLine[];
    }
  | {
      kind: 'email';
      from: string;
      to: string;
      date: string;
      subject: string;
      paragraphs: RefLine[];
      signature: string;
      stamp: string;
    }
  | { kind: 'notebook'; heading: string; lines: RefLine[] }
  | {
      kind: 'panel';
      device: string;
      status: string;
      lines: RefLine[];
      annotation: string;
    }
  | { kind: 'chat'; group: string; messages: RefLine[] }
  | {
      kind: 'cctv';
      camera: string;
      stamp: string;
      inset: { stamp: string; caption: string };
      annotations: string[];
      log: RefLine[];
    }
  | { kind: 'radio'; channel: string; entries: RefLine[] }
  | {
      kind: 'report';
      fields: { label: string; value: string }[];
      narrative: RefLine[];
      recommendation: string;
    };

export type CardKind = CardBody['kind'];

export interface EvidenceCard {
  id: string;
  /** Short exhibit code shown on the card, e.g. "A·2". */
  code: string;
  roleId: RoleId;
  title: string;
  source: string;
  when: string;
  body: CardBody;
}

// ---------- Case presentation data (public) ----------

export interface RoleInfo {
  id: RoleId;
  title: string;
  post: string;
  perspective: string;
}

export interface Hypothesis {
  id: string;
  title: string;
  blurb: string;
}

export interface TimelineEvent {
  id: EventId;
  title: string;
  icon: 'alarm' | 'notice' | 'dark' | 'generator' | 'door' | 'power';
  /** Set when the public case briefing already pins this event's time. */
  briefing?: string;
}

export interface Question {
  id: QuestionId;
  prompt: string;
  options: { id: string; label: string }[];
}

export interface CasePublic {
  id: string;
  number: string;
  title: string;
  festival: string;
  venue: string;
  date: string;
  briefing: string[];
  symptoms: { time: string; label: string }[];
  dilemma: string;
  roles: RoleInfo[];
  hypotheses: Hypothesis[];
  confidences: { id: ConfidenceId; label: string }[];
  events: TimelineEvent[];
  questions: Question[];
}

// ---------- Room view (per player projection) ----------

export interface PublicPlayer {
  id: string;
  seat: Seat;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  roleId: RoleId | null;
  introDone: boolean;
  theoryLocked: boolean;
  selecting: boolean;
  revealedCardId: string | null;
  signed: boolean;
  /** A demo player driven by the server (host's demo mode). */
  bot: boolean;
}

export interface RevealedCard {
  card: EvidenceCard;
  playerId: string;
  seat: Seat;
  at: number;
  auto: boolean;
}

export interface TimelineState {
  order: EventId[];
  version: number;
  holds: Partial<Record<EventId, string>>;
  doubts: Partial<Record<EventId, string[]>>;
  lastMove: { seq: number; by: string; eventId: EventId; from: number; to: number; at: number } | null;
  /** Revealed card ids whose text speaks to each event. */
  support: Partial<Record<EventId, string[]>>;
}

export interface VerdictState {
  answers: Partial<Record<QuestionId, { optionId: string; by: string; at: number }>>;
  signatures: string[];
}

export interface RoundInfo {
  number: number;
  /** The stopwatch counts up from here. There is no countdown. */
  startedAt: number;
  phaseStartedAt: number;
  /** Set when the verdict is filed: the stopwatch stops and shows the solve time. */
  closedAt: number | null;
}

export interface ChatMessage {
  id: number;
  at: number;
  playerId: string;
  text: string;
  /** Optional link to a timeline event the message is about. */
  eventId?: EventId;
}

export interface PrivateState {
  role: RoleInfo;
  cards: EvidenceCard[];
  theory: { hypothesisId: string | null; confidence: ConfidenceId | null; lockedAt: number } | null;
}

export interface ActivityItem {
  id: number;
  at: number;
  playerId: string | null;
  kind: 'join' | 'leave' | 'ready' | 'start' | 'lock' | 'reveal' | 'move' | 'doubt' | 'verdict' | 'sign' | 'system';
  text: string;
}

export interface RoomView {
  code: string;
  phase: Phase;
  you: string;
  hostId: string;
  players: PublicPlayer[];
  round: RoundInfo | null;
  case: CasePublic | null;
  private: PrivateState | null;
  revealed: RevealedCard[];
  timeline: TimelineState | null;
  verdict: VerdictState | null;
  result: ResultView | null;
  activity: ActivityItem[];
  /** Team chat — available once the shared board is open. */
  chat: ChatMessage[];
  /** Host has filled empty seats with demo players. */
  demo: boolean;
  serverNow: number;
}

// ---------- Result (truth phase only) ----------

export type EvidenceLevel = 'proved' | 'suggested' | 'absent';
export type StoryArt = 'schedule' | 'charger' | 'warning' | 'blackout' | 'visitor' | 'fix';
export type PaceId = 'swift' | 'fair' | 'slow' | 'long';
/** Pace bands in minutes: under 5 swift, under 10 fair, under 15 slow, otherwise too long. */
export const PACE_BANDS: { id: PaceId; underMin: number; title: string; line: string }[] = [
  { id: 'swift', underMin: 5, title: 'Well done', line: 'Solved in under 5 minutes.' },
  { id: 'fair', underMin: 10, title: 'Fair pace', line: 'Solved in under 10 minutes.' },
  { id: 'slow', underMin: 15, title: 'A bit slow', line: 'Solved in under 15 minutes.' },
  { id: 'long', underMin: Infinity, title: 'Took too long', line: 'Over 15 minutes on the case.' },
];

export interface ScorePart {
  id: 'cause' | 'generator' | 'visitor' | 'timeline';
  label: string;
  earned: number;
  max: number;
  detail: string;
}

export interface ResultView {
  submittedAt: number;
  auto: boolean;
  elapsedMs: number;
  score: { total: number; parts: ScorePart[] };
  band: { title: string; line: string };
  headline: string;
  moral: string;
  official: { id: EventId; time: string; title: string; detail: string }[];
  teamOrder: EventId[];
  correctPairs: number;
  totalPairs: number;
  verdict: {
    questionId: QuestionId;
    prompt: string;
    team: { optionId: string; label: string; by: string | null } | null;
    truth: { optionId: string; label: string };
    correct: boolean;
    explanation: string;
    boardCards: string[];
  }[];
  narrative: { time: string; title: string; text: string; art: StoryArt }[];
  /** How quickly the team solved it. Never affects the match %. */
  pace: { id: PaceId; title: string; line: string };
  insights: {
    id: string;
    title: string;
    text: string;
    found: boolean;
    level: EvidenceLevel;
    boardCards: string[];
    hiddenCards: string[];
  }[];
  theories: {
    playerId: string;
    name: string;
    seat: Seat;
    roleId: RoleId;
    hypothesisId: string | null;
    hypothesisTitle: string;
    confidence: ConfidenceId | null;
    matchesTeam: boolean;
    matchesTruth: boolean;
    reflection: string;
    roleNote: string;
  }[];
  teamHypothesisId: string | null;
  truthHypothesisId: string;
  cards: {
    card: EvidenceCard;
    revealedBy: string | null;
    establishes: string[];
    suggests: string[];
    caution: string;
  }[];
}

// ---------- Socket messages ----------

export type Ack<T = unknown> = ({ ok: true } & T) | { ok: false; code: string; error: string };

export interface SessionInfo {
  code: string;
  token: string;
  playerId: string;
}

export interface ClientToServer {
  'room:create': (p: { name: string }, ack: (r: Ack<SessionInfo>) => void) => void;
  'room:join': (p: { code: string; name: string }, ack: (r: Ack<SessionInfo>) => void) => void;
  'room:resume': (p: { code: string; token: string }, ack: (r: Ack<SessionInfo>) => void) => void;
  'room:leave': (ack: (r: Ack) => void) => void;
  'player:rename': (p: { name: string }, ack: (r: Ack) => void) => void;
  'player:ready': (p: { ready: boolean }, ack: (r: Ack) => void) => void;
  'game:start': (ack: (r: Ack) => void) => void;
  'intro:done': (ack: (r: Ack) => void) => void;
  'theory:lock': (p: { hypothesisId: string; confidence: ConfidenceId }, ack: (r: Ack) => void) => void;
  'reveal:selecting': (p: { on: boolean }) => void;
  'reveal:card': (p: { cardId: string }, ack: (r: Ack) => void) => void;
  'timeline:hold': (p: { eventId: EventId | null }) => void;
  'timeline:move': (p: { eventId: EventId; toIndex: number }, ack: (r: Ack) => void) => void;
  'timeline:doubt': (p: { eventId: EventId; on: boolean }, ack: (r: Ack) => void) => void;
  'verdict:set': (p: { questionId: QuestionId; optionId: string }, ack: (r: Ack) => void) => void;
  'verdict:sign': (p: { signed: boolean }, ack: (r: Ack) => void) => void;
  'round:again': (ack: (r: Ack) => void) => void;
  'chat:send': (p: { text: string; eventId?: EventId }, ack: (r: Ack) => void) => void;
  'chat:clear': (ack: (r: Ack) => void) => void;
  'demo:start': (ack: (r: Ack) => void) => void;
  'demo:stop': (ack: (r: Ack) => void) => void;
  'demo:step': (ack: (r: Ack) => void) => void;
  'time:sync': (p: { t0: number }, ack: (r: { t0: number; server: number }) => void) => void;
}

export interface ServerToClient {
  state: (view: RoomView) => void;
  kicked: (p: { reason: string }) => void;
}
