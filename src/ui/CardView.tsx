import { memo } from 'react';
import { def, isCreature, power, toughness } from '../engine/core';
import { COUNTER_JA } from '../engine/counters';
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
  /** 相手ありモードで、相手にブロックされている */
  blocked?: boolean;
  /** 装備品が付いている */
  equipped?: boolean;
}

/** カード1枚。盤面全体の再描画を避けるため、表示に関わる値が変わったときだけ描き直す */
function CardViewInner({ card, planned, ready, blocked, equipped }: Props) {
  const images = useStore((s) => s.images);
  const select = useStore((s) => s.set);
  const d = def(card);
  const drag = useDrag((info) => handleDrop(card, info), () => select({ selected: card.id }));
  const counters = Object.entries(card.counters).filter(([, n]) => n > 0);
  const classes = ['card', card.tapped && 'tapped', ready && 'ready', planned !== undefined && 'planned', blocked && 'blocked', card.token && 'token']
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
          <div className="text-type">{d.typeJa}</div>
        </div>
      )}
      {isCreature(card) && (
        <span className="pt">
          {power(card)}/{toughness(card)}
        </span>
      )}
      {counters.length > 0 && (
        <span className="counters">{counters.map(([k, n]) => `${COUNTER_JA[k]}:${n}`).join(' ')}</span>
      )}
      {planned !== undefined && <span className="plan-badge">→{planned + 1}</span>}
      {blocked && <span className="block-badge">ブロック</span>}
      {/* クリーチャーには「装備」、付いている装備品には「装備中」 */}
      {(equipped || card.attachedTo !== null) && <span className="equip-badge">{equipped ? '装備' : '装備中'}</span>}
    </div>
  );
}

const key = (p: Props) => JSON.stringify([p.card, p.planned, p.ready, p.blocked, p.equipped]);

export const CardView = memo(CardViewInner, (a, b) => key(a) === key(b));
