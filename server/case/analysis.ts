import { PACE_BANDS } from '../../shared/protocol';
import type {
  ConfidenceId,
  EventId,
  EvidenceCard,
  EvidenceLevel,
  QuestionId,
  ResultView,
  RoleId,
  Seat,
} from '../../shared/protocol';
import type { CaseCard, CaseDefinition } from './types';

const QUESTIONS: QuestionId[] = ['cause', 'generator', 'visitor'];

/** Strip server-only fields before a card goes to a client. */
export function publicCard(card: CaseCard): EvidenceCard {
  const { id, code, roleId, title, source, when, body } = card;
  return { id, code, roleId, title, source, when, body };
}

export function cardsForRole(def: CaseDefinition, roleId: RoleId): CaseCard[] {
  return def.cards.filter((c) => c.roleId === roleId);
}

/** Events a card's text speaks to (via line refs). */
export function cardEventRefs(card: CaseCard): Set<EventId> {
  const out = new Set<EventId>();
  const b = card.body;
  const lines =
    b.kind === 'log' ? b.lines
    : b.kind === 'cuesheet' ? b.notes
    : b.kind === 'email' ? b.paragraphs
    : b.kind === 'notebook' ? b.lines
    : b.kind === 'panel' ? b.lines
    : b.kind === 'chat' ? b.messages
    : b.kind === 'cctv' ? b.log
    : b.kind === 'radio' ? b.entries
    : b.narrative;
  for (const l of lines) for (const r of l.refs ?? []) out.add(r);
  return out;
}

/** Best strength among a set of cards for one conclusion. */
export function levelFor(cards: CaseCard[], q: QuestionId): EvidenceLevel {
  let level: EvidenceLevel = 'absent';
  for (const c of cards) {
    const s = c.supports[q];
    if (s === 'proves') return 'proved';
    if (s === 'suggests') level = 'suggested';
  }
  return level;
}

const LEVEL_RANK: Record<EvidenceLevel, number> = { absent: 0, suggested: 1, proved: 2 };
export function minLevel(levels: EvidenceLevel[]): EvidenceLevel {
  return levels.reduce((a, b) => (LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b), 'proved' as EvidenceLevel);
}

/** For each event, which of the given cards speak to it. */
export function eventSupport(cards: CaseCard[]): Partial<Record<EventId, string[]>> {
  const out: Partial<Record<EventId, string[]>> = {};
  for (const c of cards) {
    for (const e of cardEventRefs(c)) (out[e] ??= []).push(c.id);
  }
  return out;
}

/** Pairwise ordering comparison against the canonical order. */
export function orderingScore(def: CaseDefinition, order: EventId[]) {
  const truth = def.canonical.map((e) => e.id);
  const pos = new Map(order.map((id, i) => [id, i]));
  let correct = 0;
  let total = 0;
  for (let i = 0; i < truth.length; i++) {
    for (let j = i + 1; j < truth.length; j++) {
      total++;
      const a = pos.get(truth[i]);
      const b = pos.get(truth[j]);
      if (a !== undefined && b !== undefined && a < b) correct++;
    }
  }
  return { correct, total };
}

export interface ScoringPlayer {
  id: string;
  name: string;
  seat: Seat;
  roleId: RoleId;
  theory: { hypothesisId: string | null; confidence: ConfidenceId | null } | null;
}

export interface ScoringInput {
  order: EventId[];
  answers: Partial<Record<QuestionId, { optionId: string; by: string }>>;
  revealed: { cardId: string; playerId: string }[];
  players: ScoringPlayer[];
  startedAt: number;
  submittedAt: number;
  auto: boolean;
}

/**
 * Deterministic result. The score depends only on the team's submitted answers and timeline
 * compared with the answer key. Unrevealed cards never affect the score; they only appear in
 * the post-game analysis.
 */
export function computeResult(def: CaseDefinition, input: ScoringInput): ResultView {
  const cardById = new Map(def.cards.map((c) => [c.id, c]));
  const revealedBy = new Map(input.revealed.map((r) => [r.cardId, r.playerId]));
  const boardCards = input.revealed.map((r) => cardById.get(r.cardId)!).filter(Boolean);
  const hiddenCards = def.cards.filter((c) => !revealedBy.has(c.id));
  const q = Object.fromEntries(def.public.questions.map((x) => [x.id, x]));
  const optionLabel = (qid: QuestionId, oid: string) =>
    q[qid].options.find((o) => o.id === oid)?.label ?? oid;

  const correct: Record<QuestionId, boolean> = {
    cause: input.answers.cause?.optionId === def.answerKey.cause,
    generator: input.answers.generator?.optionId === def.answerKey.generator,
    visitor: input.answers.visitor?.optionId === def.answerKey.visitor,
  };

  const { correct: pairs, total: totalPairs } = orderingScore(def, input.order);
  const w = def.weights;
  const parts: ResultView['score']['parts'] = [
    {
      id: 'cause',
      label: 'Main cause',
      earned: correct.cause ? w.cause : 0,
      max: w.cause,
      detail: correct.cause ? 'Scheduled maintenance identified' : 'Cause misidentified',
    },
    {
      id: 'generator',
      label: 'Backup generator',
      earned: correct.generator ? w.generator : 0,
      max: w.generator,
      detail: correct.generator ? 'Its own fault, found' : 'Generator failure misread',
    },
    {
      id: 'visitor',
      label: 'Electrical-room visitor',
      earned: correct.visitor ? w.visitor : 0,
      max: w.visitor,
      detail: correct.visitor ? 'Recognised as the fixer' : 'Visitor misread',
    },
    {
      id: 'timeline',
      label: 'Timeline order',
      earned: pairs * w.timelinePerPair,
      max: totalPairs * w.timelinePerPair,
      detail: `${pairs} of ${totalPairs} event pairs in the right order`,
    },
  ];
  const total = parts.reduce((s, p) => s + p.earned, 0);
  const elapsedMs = input.submittedAt - input.startedAt;
  const paceBand = PACE_BANDS.find((b) => elapsedMs < b.underMin * 60_000)!;
  const band = def.bands.find((b) => total >= b.min)!;

  const verdict = QUESTIONS.map((qid) => {
    const team = input.answers[qid];
    const truthId = def.answerKey[qid];
    return {
      questionId: qid,
      prompt: q[qid].prompt,
      team: team ? { optionId: team.optionId, label: optionLabel(qid, team.optionId), by: team.by } : null,
      truth: { optionId: truthId, label: optionLabel(qid, truthId) },
      correct: correct[qid],
      explanation: team && !correct[qid] ? def.explanations[team.optionId] : def.explanations[truthId],
      boardCards: boardCards.filter((c) => c.supports[qid]).map((c) => c.id),
    };
  });

  const insights = def.insights.map((ins) => ({
    id: ins.id,
    title: ins.title,
    text: ins.text,
    found: ins.requires.every((r) => correct[r]),
    level: minLevel(ins.requires.map((r) => levelFor(boardCards, r))),
    boardCards: boardCards.filter((c) => ins.requires.some((r) => c.supports[r])).map((c) => c.id),
    hiddenCards: hiddenCards.filter((c) => ins.requires.some((r) => c.supports[r])).map((c) => c.id),
  }));

  const teamHypothesisId = input.answers.cause ? def.hypothesisForCause[input.answers.cause.optionId] ?? null : null;
  const hypTitle = (id: string | null) => def.public.hypotheses.find((h) => h.id === id)?.title ?? 'No theory locked';

  const theories = [...input.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const hid = p.theory?.hypothesisId ?? null;
      return {
        playerId: p.id,
        name: p.name,
        seat: p.seat,
        roleId: p.roleId,
        hypothesisId: hid,
        hypothesisTitle: hypTitle(hid),
        confidence: p.theory?.confidence ?? null,
        matchesTeam: hid !== null && hid === teamHypothesisId,
        matchesTruth: hid === def.truthHypothesis,
        reflection: def.hypothesisReflections[hid ?? 'none'],
        roleNote: def.roleNotes[p.roleId],
      };
    });

  return {
    submittedAt: input.submittedAt,
    auto: input.auto,
    elapsedMs,
    pace: { id: paceBand.id, title: paceBand.title, line: paceBand.line },
    score: { total, parts },
    band: { title: band.title, line: band.line },
    headline: def.headline,
    moral: def.moral,
    official: def.canonical.map((e) => ({ id: e.id, time: e.time, title: e.title, detail: e.detail })),
    teamOrder: [...input.order],
    correctPairs: pairs,
    totalPairs,
    verdict,
    narrative: def.narrative,
    insights,
    theories,
    teamHypothesisId,
    truthHypothesisId: def.truthHypothesis,
    cards: def.cards.map((c) => ({
      card: publicCard(c),
      revealedBy: revealedBy.get(c.id) ?? null,
      establishes: c.establishes,
      suggests: c.suggests,
      caution: c.caution,
    })),
  };
}
