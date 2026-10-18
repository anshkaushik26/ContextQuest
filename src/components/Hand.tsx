import { motion } from 'motion/react';
import type { EvidenceCard as Card } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { EvidenceCard } from './evidence/EvidenceCard';
import { Icon } from './Icon';
import { useInspect } from './Inspector';
import './hand.css';

interface Props {
  cards: Card[];
  /** Reveal mode: cards are selectable. */
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Card already sent to the board (rendered as a gap). */
  goneId?: string | null;
  locked?: boolean;
  renderAction?: (card: Card) => React.ReactNode;
}

const TILT = [-3.5, 0, 3.5];

export function Hand({ cards, selectable, selectedId, onSelect, goneId, locked, renderAction }: Props) {
  const inspect = useInspect();
  return (
    <div className={`hand ${selectable ? 'hand--select' : ''} ${locked ? 'is-locked' : ''}`} role={selectable ? 'radiogroup' : 'list'} aria-label="Your private evidence">
      {cards.map((card, i) => {
        const gone = card.id === goneId;
        const selected = card.id === selectedId;
        return (
          <motion.div
            key={card.id}
            className={`hand__slot ${selected ? 'is-selected' : ''} ${gone ? 'is-gone' : ''}`}
            data-hand-card={card.id}
            initial={{ opacity: 0, y: 60, rotate: TILT[i] * 3 }}
            animate={{
              opacity: gone ? 0 : 1,
              y: selected ? -26 : 0,
              rotate: selected ? 0 : TILT[i],
              rotateX: selected ? 6 : 0,
              scale: selected ? 1.03 : 1,
            }}
            whileHover={!gone && !locked ? { y: selected ? -30 : -12, rotate: 0, transition: { duration: 0.25 } } : undefined}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.08 * i }}
            onHoverStart={() => !gone && !locked && sfx.hover()}
            role={selectable ? 'radio' : 'listitem'}
            aria-checked={selectable ? selected : undefined}
          >
            <button
              className="hand__hit"
              disabled={gone}
              onClick={() => {
                if (selectable && !locked && onSelect) {
                  sfx.select();
                  onSelect(card.id);
                } else inspect({ items: cards.map((c) => ({ card: c })), index: i });
              }}
              aria-label={selectable ? `Select ${card.title}` : `Read ${card.title}`}
              data-testid={`hand-${card.id}`}
            >
              <EvidenceCard card={card} size="hand" />
            </button>
            <div className="hand__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => inspect({ items: cards.map((c) => ({ card: c })), index: i })} disabled={gone}>
                <Icon name="eye" size={15} /> Read closely
              </button>
              {renderAction?.(card)}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
