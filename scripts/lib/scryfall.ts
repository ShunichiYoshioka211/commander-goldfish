// Scryfall のカードオブジェクトを、アプリが使う CardDef に変換する。
import type { CardDef } from '../../src/engine/types.ts';

export interface ScryfallFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: { small: string; normal: string };
}

export interface ScryfallCard extends ScryfallFace {
  cmc: number;
  colors?: string[];
  color_identity: string[];
  produced_mana?: string[];
  keywords: string[];
  card_faces?: ScryfallFace[];
}

const num = (v: string | undefined) => (v === undefined ? null : Number.isNaN(Number(v)) ? 0 : Number(v));

export function toCardDef(card: ScryfallCard, row: { jaName: string; note: string; count: number }): CardDef {
  const faces = card.card_faces ?? [card];
  const front = faces[0];
  return {
    name: card.name,
    jaName: row.jaName || card.name,
    note: row.note,
    count: row.count,
    manaCost: card.mana_cost ?? faces.map((f) => f.mana_cost ?? '').join(' // '),
    cmc: card.cmc,
    typeLine: card.type_line ?? front.type_line ?? '',
    oracle: faces.map((f) => (faces.length > 1 ? `【${f.name}】${f.oracle_text ?? ''}` : (f.oracle_text ?? ''))).join('\n'),
    power: num(card.power ?? front.power),
    toughness: num(card.toughness ?? front.toughness),
    colors: card.colors ?? card.color_identity,
    producedMana: card.produced_mana ?? [],
    keywords: card.keywords,
    image: card.image_uris ?? front.image_uris ?? null,
  };
}
