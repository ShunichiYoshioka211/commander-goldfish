import { memo } from 'react';
import { def, isCreature, power, toughness } from '../engine/core';
import type { CardInstance } from '../engine/types';
import { useStore } from '../store';
import { handleDrop } from './interact';
import { useDrag } from './useDrag';

interface Props {
  card: CardInstance;
  /** 攻撃予定の対戦相手 */
  planned?: number;
  /** 唱えられる・起動できる（光らせる） */
  ready?: boolean;
}

/** カード1枚。盤面全体の再描画を避けるため、表示に関わる値が変わったときだけ描き直す */
function CardViewInner({ card, planned, ready }: Props) {
  const images = useStore((s) => s.images);
  const select = useStore((s) => s.set);
  const d = def(card);
  const drag = useDrag((info) => handleDrop(card, info), () => select({ selected: card.id }));
  const counters = Object.entries(card.counters).filter(([, n]) => n > 0);
  const classes = ['card', card.tapped && 'tapped', ready && 'ready', planned !== undefined && 'planned', card.token && 'token']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} data-card={card.id} data-name={card.name} {...drag}>
      {images && d.image ? (
        <img src={d.image.small} alt={d.jaName} loading="lazy" draggable={false} />
      ) : (
        <div className="text-card">
          <div className="text-name">{d.jaName}</div>
          <div className="text-cost">{d.manaCost}</div>
          <div className="text-type">{d.typeLine}</div>
        </div>
      )}
      {isCreature(card) && (
        <span className="pt">
          {power(card)}/{toughness(card)}
        </span>
      )}
      {counters.length > 0 && (
        <span className="counters">{counters.map(([k, n]) => `${k}:${n}`).join(' ')}</span>
      )}
      {planned !== undefined && <span className="plan-badge">→{planned + 1}</span>}
    </div>
  );
}

const key = (p: Props) => JSON.stringify([p.card, p.planned, p.ready]);

export const CardView = memo(CardViewInner, (a, b) => key(a) === key(b));
