import { describe, expect, it } from 'vitest';
import { case001 as def } from '../server/case/case001';
import {
  cardEventRefs,
  cardsForRole,
  computeResult,
  eventSupport,
  levelFor,
  orderingScore,
  type ScoringInput,
} from '../server/case/analysis';
import type { EventId, QuestionId } from '../shared/protocol';

/** Accepts "21:04", "21:04:01" or "9:04 PM". */
const toSec = (t: string) => {
  const m = t.trim().match(/^(\d+):(\d+)(?::(\d+))?\s*([AP]M)?$/i);
  if (!m) throw new Error(`bad time ${t}`);
  let h = Number(m[1]);
  if (m[4]) h = (h % 12) + (m[4].toUpperCase() === 'PM' ? 12 : 0);
  return h * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
};
/** A written time covers its whole precision: "21:04" means 21:04:00–21:04:59. */
const span = (t: string): [number, number] => {
  const start = toSec(t);
  return [start, start + (/\d+:\d+:\d+/.test(t) ? 0 : 59)];
};

const QUESTIONS: QuestionId[] = ['cause', 'generator', 'visitor'];
const roles = def.roleOrder;
const combos: string[][] = [];
for (const a of cardsForRole(def, roles[0]))
  for (const b of cardsForRole(def, roles[1]))
    for (const c of cardsForRole(def, roles[2])) combos.push([a.id, b.id, c.id]);

describe('Case 001 — authored content', () => {
  it('has three roles with three distinct cards each', () => {
    expect(def.cards).toHaveLength(9);
    expect(new Set(def.cards.map((c) => c.id)).size).toBe(9);
    for (const r of roles) expect(cardsForRole(def, r)).toHaveLength(3);
  });

  it('canonical events are strictly chronological', () => {
    for (let i = 1; i < def.canonical.length; i++) {
      expect(toSec(def.canonical[i].window[0])).toBeGreaterThan(toSec(def.canonical[i - 1].window[1]));
    }
    expect(def.canonical.map((e) => e.id).sort()).toEqual(def.public.events.map((e) => e.id).sort());
  });

  it('every timestamp on every card agrees with the canonical timeline', () => {
    const win = new Map(def.canonical.map((e) => [e.id, e.window.map(toSec) as [number, number]]));
    for (const card of def.cards) {
      for (const f of card.facts) {
        const [ws, we] = win.get(f.event)!;
        const [fs, fe] = span(f.time);
        const ok = f.relation === 'by' ? ws <= fe : fs <= we && fe >= ws;
        expect(ok, `${card.id}: ${f.event} @ ${f.time} (${f.relation}) vs window ${ws}-${we}`).toBe(true);
      }
    }
  });

  it('every event a card line points at is backed by a checked fact on that card', () => {
    for (const card of def.cards) {
      const factEvents = new Set(card.facts.map((f) => f.event));
      for (const e of cardEventRefs(card)) expect(factEvents.has(e), `${card.id} refs ${e}`).toBe(true);
    }
  });

  it('briefing anchors match the canonical times', () => {
    for (const ev of def.public.events.filter((e) => e.briefing)) {
      const c = def.canonical.find((x) => x.id === ev.id)!;
      const [bs, be] = span(ev.briefing!);
      expect(bs <= toSec(c.window[1]) && be >= toSec(c.window[0])).toBe(true);
    }
  });

  it('answer key, explanations and hypothesis mapping are complete', () => {
    for (const q of def.public.questions) {
      expect(q.options.map((o) => o.id)).toContain(def.answerKey[q.id]);
      for (const o of q.options) expect(def.explanations[o.id], o.id).toBeTruthy();
    }
    const causeOpts = def.public.questions.find((q) => q.id === 'cause')!.options;
    for (const o of causeOpts) expect(def.hypothesisForCause[o.id]).toBeTruthy();
    for (const h of def.public.hypotheses) expect(def.hypothesisReflections[h.id]).toBeTruthy();
    expect(def.hypothesisForCause[def.answerKey.cause]).toBe(def.truthHypothesis);
  });
});

describe('Case 001 — solvability of every reveal combination', () => {
  it('there are 27 one-card-per-player combinations', () => expect(combos).toHaveLength(27));

  it.each(combos.map((c) => [c.join(' + '), c]))('%s supports every conclusion and every event', (_n, ids) => {
    const cards = (ids as string[]).map((id) => def.cards.find((c) => c.id === id)!);
    for (const q of QUESTIONS) expect(levelFor(cards, q), `${q} unsupported`).not.toBe('absent');
    const support = eventSupport(cards);
    for (const ev of def.public.events) {
      const backed = (support[ev.id]?.length ?? 0) > 0 || !!ev.briefing;
      expect(backed, `${ev.id} has no evidence on the board`).toBe(true);
    }
  });

  it('each role is the specialist for one conclusion: all of its cards speak to it', () => {
    const specialist: Record<string, QuestionId> = { tech: 'cause', volunteer: 'generator', guard: 'visitor' };
    for (const r of roles) for (const c of cardsForRole(def, r)) expect(c.supports[specialist[r]]).toBeTruthy();
  });

  it('no single card proves every conclusion (sharing is necessary)', () => {
    for (const c of def.cards) expect(QUESTIONS.every((q) => c.supports[q] === 'proves')).toBe(false);
  });
});

describe('Scoring', () => {
  const players: ScoringInput['players'] = [
    { id: 'p1', name: 'A', seat: 0, roleId: 'tech', theory: { hypothesisId: 'h-system', confidence: 'fairly' } },
    { id: 'p2', name: 'B', seat: 1, roleId: 'volunteer', theory: { hypothesisId: 'h-failure', confidence: 'hunch' } },
    { id: 'p3', name: 'C', seat: 2, roleId: 'guard', theory: { hypothesisId: 'h-sabotage', confidence: 'certain' } },
  ];
  const truthOrder = def.canonical.map((e) => e.id) as EventId[];
  const base = (over: Partial<ScoringInput>): ScoringInput => ({
    order: truthOrder,
    answers: {
      cause: { optionId: 'cause-maintenance', by: 'p1' },
      generator: { optionId: 'gen-fault', by: 'p2' },
      visitor: { optionId: 'vis-restorer', by: 'p3' },
    },
    revealed: [
      { cardId: 'tech-log', playerId: 'p1' },
      { cardId: 'vol-photo', playerId: 'p2' },
      { cardId: 'sec-radio', playerId: 'p3' },
    ],
    players,
    startedAt: 0,
    submittedAt: 230_000,
    auto: false,
    ...over,
  });

  it('weights total 100', () => {
    const w = def.weights;
    expect(w.cause + w.generator + w.visitor + 15 * w.timelinePerPair).toBe(100);
  });

  it('a perfect answer scores 100', () => {
    expect(computeResult(def, base({})).score.total).toBe(100);
  });

  it('maintenance right, generator misread, one swap in the timeline → calculated, not hardcoded', () => {
    const order: EventId[] = ['e1', 'e2', 'e4', 'e3', 'e5', 'e6']; // e3/e4 swapped → 14/15 pairs
    const r = computeResult(
      def,
      base({ order, answers: { ...base({}).answers, generator: { optionId: 'gen-blocked', by: 'p2' } } }),
    );
    expect(orderingScore(def, order)).toEqual({ correct: 14, total: 15 });
    expect(r.score.parts.map((p) => p.earned)).toEqual([30, 0, 20, 28]);
    expect(r.score.total).toBe(78);
    expect(r.insights.find((i) => i.id === 'k-both')!.found).toBe(false);
    expect(r.verdict.find((v) => v.questionId === 'generator')!.explanation).toBe(def.explanations['gen-blocked']);
  });

  it('pace bands: under 5 / 10 / 15 minutes, and never affects the score', () => {
    const at = (min: number) => computeResult(def, base({ submittedAt: min * 60_000 }));
    expect([4.9, 5, 9.99, 14.5, 15, 40].map((m) => at(m).pace.id)).toEqual(['swift', 'fair', 'fair', 'slow', 'long', 'long']);
    expect(new Set([1, 7, 12, 30].map((m) => at(m).score.total)).size).toBe(1);
  });

  it('the untouched starting order earns exactly 5 of 15 pairs', () => {
    expect(orderingScore(def, def.initialOrder)).toEqual({ correct: 5, total: 15 });
  });

  it('a fully reversed timeline earns 0 timeline points', () => {
    expect(orderingScore(def, [...truthOrder].reverse()).correct).toBe(0);
  });

  it('unrevealed cards never change the score', () => {
    const totals = combos.map(
      (ids) =>
        computeResult(def, base({ revealed: ids.map((cardId, k) => ({ cardId, playerId: players[k].id })) })).score
          .total,
    );
    expect(new Set(totals).size).toBe(1);
  });

  it('missing answers score zero for that part and do not crash', () => {
    const r = computeResult(def, base({ answers: {} }));
    expect(r.score.total).toBe(30);
    expect(r.verdict.every((v) => v.team === null)).toBe(true);
  });

  it('theories are compared with the team answer and the truth', () => {
    const r = computeResult(def, base({}));
    expect(r.theories.map((t) => [t.matchesTeam, t.matchesTruth])).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ]);
  });
});
