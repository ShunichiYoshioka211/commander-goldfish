// カードの中身の表示。カード詳細と選択画面（占術でめくったカード・選択肢のカード）で共通に使う。
import { isScripted, scriptOf } from '../cards/registry';
import { def } from '../engine/core';
import { tipOf } from '../engine/deck';
import type { CardInstance } from '../engine/types';
import { useStore } from '../store';

const automation = (card: CardInstance) => {
  if (!isScripted(card.name)) return '効果は手動で処理';
  return scriptOf(card).rivalsOnly ? '相手ありモードで自動処理' : '自動処理あり';
};

/** 大きな絵と、名前・マナ・コスト・タイプ行・効果・使い方のコツ */
export function CardInfo({ card, deckId }: { card: CardInstance; deckId: string }) {
  const d = def(card);
  const tip = tipOf(deckId, card.name);
  return (
    <div className="detail-body">
      {d.image && <img src={d.image.normal} alt="" className="detail-image" />}
      <div>
        <h2>{d.jaName}</h2>
        <div className="muted">{d.manaCost}</div>
        <div>{d.typeJa}</div>
        <p className="oracle">{d.textJa}</p>
        {tip && <p className="note">コツ：{tip}</p>}
        <span className="badge">{automation(card)}</span>
      </div>
    </div>
  );
}

/** 選択肢に付ける小さなカードの絵（画像を出さない設定なら名前とタイプ行）。読み上げは選択肢の文字に任せる */
export function CardThumb({ card }: { card: CardInstance }) {
  const images = useStore((s) => s.images);
  const d = def(card);
  return (
    <span className="card-thumb" aria-hidden="true">
      {images && d.image ? (
        <img src={d.image.small} alt="" loading="lazy" draggable={false} />
      ) : (
        <span className="text-card">
          <span className="text-name">{d.jaName}</span>
          <span className="text-type">{d.typeJa}</span>
        </span>
      )}
    </span>
  );
}
