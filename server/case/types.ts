import type {
  CasePublic,
  EventId,
  EvidenceCard,
  QuestionId,
  RoleId,
  Strength,
  StoryArt,
} from '../../shared/protocol';

/** A timestamped claim a card makes about a canonical event. Used by the consistency checker. */
export interface CardFact {
  event: EventId;
  /** 24h time as written on the card, at the card's precision: "21:04" or "21:04:01". */
  time: string;
  /**
   * 'at'    — the card says the event happened at this time.
   * 'by'    — the card shows the event had already happened by this time (e.g. a chat message about it).
   * 'derived' — the time is not printed but follows directly from the card (e.g. 21:00 + 4-minute warning).
   */
  relation: 'at' | 'by' | 'derived';
}

export interface CaseCard extends EvidenceCard {
  facts: CardFact[];
  /** What this card lets a team conclude, on its own. Never sent to clients before the truth phase. */
  supports: Partial<Record<QuestionId, Strength>>;
  establishes: string[];
  suggests: string[];
  caution: string;
}

export interface CanonicalEvent {
  id: EventId;
  /** Inclusive window in HH:MM:SS. */
  window: [string, string];
  time: string;
  title: string;
  detail: string;
}

export interface Insight {
  id: string;
  title: string;
  text: string;
  /** Verdict questions that must all be answered correctly for the team to have "found" this link. */
  requires: QuestionId[];
}

export interface CaseDefinition {
  public: CasePublic;
  cards: CaseCard[];
  roleOrder: RoleId[];
  canonical: CanonicalEvent[];
  initialOrder: EventId[];
  answerKey: Record<QuestionId, string>;
  /** Which hypothesis (initial theory) corresponds to each option of the "cause" question. */
  hypothesisForCause: Record<string, string>;
  truthHypothesis: string;
  weights: { cause: number; generator: number; visitor: number; timelinePerPair: number };
  /** Why each verdict option is right or wrong. */
  explanations: Record<string, string>;
  narrative: { time: string; title: string; text: string; art: StoryArt }[];
  headline: string;
  moral: string;
  insights: Insight[];
  hypothesisReflections: Record<string, string>;
  roleNotes: Record<RoleId, string>;
  bands: { min: number; title: string; line: string }[];
}
