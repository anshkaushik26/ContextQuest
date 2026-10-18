import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { EventId, EvidenceCard as Card } from '../../shared/protocol';
import { EvidenceCard } from './evidence/EvidenceCard';
import { Icon } from './Icon';

interface Item {
  card: Card;
  sharedBy?: { name: string; seat: number } | null;
}
interface Open {
  items: Item[];
  index: number;
  highlight?: EventId | null;
  notes?: Record<string, React.ReactNode>;
}

const Ctx = createContext<(o: Open) => void>(() => {});
export const useInspect = () => useContext(Ctx);

export function InspectorProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const show = useCallback((o: Open) => {
    lastFocus.current = document.activeElement as HTMLElement;
    setOpen(o);
  }, []);
  const close = useCallback(() => {
    setOpen(null);
    lastFocus.current?.focus?.();
  }, []);
  const step = (d: number) => setOpen((o) => (o ? { ...o, index: (o.index + d + o.items.length) % o.items.length } : o));

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const item = open?.items[open.index];
  return (
    <Ctx.Provider value={show}>
      {children}
      <AnimatePresence>
        {open && item && (
          <motion.div
            className="inspector"
            role="dialog"
            aria-modal="true"
            aria-label={`Evidence: ${item.card.title}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              key={item.card.id}
              className="inspector__card"
              initial={{ opacity: 0, y: 30, rotateX: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <EvidenceCard card={item.card} size="full" highlight={open.highlight} sharedBy={item.sharedBy} />
              {open.notes?.[item.card.id] && <div className="inspector__notes">{open.notes[item.card.id]}</div>}
            </motion.div>
            <div className="inspector__bar" onClick={(e) => e.stopPropagation()}>
              {open.items.length > 1 && (
                <button className="btn btn--icon" onClick={() => step(-1)} aria-label="Previous card">
                  <Icon name="left" />
                </button>
              )}
              <span className="chip">
                {open.index + 1} / {open.items.length}
              </span>
              {open.items.length > 1 && (
                <button className="btn btn--icon" onClick={() => step(1)} aria-label="Next card">
                  <Icon name="right" />
                </button>
              )}
              <button ref={closeBtn} className="btn btn--sm" onClick={close}>
                Close <kbd>Esc</kbd>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
