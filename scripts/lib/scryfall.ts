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
  printed_name?: string;
  printed_type_line?: string;
  printed_text?: string;
}

export interface ScryfallCard extends ScryfallFace {
  lang?: string;
  cmc: number;
  colors?: string[];
  color_identity: string[];
  produced_mana?: string[];
  keywords: string[];
  card_faces?: ScryfallFace[];
}

/** deck/ja.json の1件。日本語の表示名・タイプ行・効果と、使い方のコツ */
export interface JaText {
  name?: string;
  type: string;
  text: string;
  tip: string;
}

const num = (v: string | undefined) => (v === undefined ? null : Number.isNaN(Number(v)) ? 0 : Number(v));

/** 印刷の画像（両面なら表面） */
export function imageOf(card: ScryfallCard) {
  const uris = card.image_uris ?? card.card_faces?.[0].image_uris;
  return uris ? { small: uris.small, normal: uris.normal } : null;
}

/** printed は日本語版の印刷。あればその画像を使う */
export function toCardDef(card: ScryfallCard, row: { jaName: string; count: number }, ja: JaText, printed?: ScryfallCard): CardDef {
  const faces = card.card_faces ?? [card];
  const front = faces[0];
  return {
    name: card.name,
    jaName: ja.name || row.jaName || card.name,
    typeJa: ja.type,
    textJa: ja.text,
    tip: ja.tip,
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
    image: (printed && imageOf(printed)) ?? imageOf(card),
  };
}

/** ふりがな「虚（きょ）空（くう）」を取り除く */
const stripRuby = (s: string) => s.replace(/（[ぁ-ゖー]+）/g, '');

/**
 * 日本語版の印刷から ja.json の下書きを作る。Scryfall の日本語データは欠けや崩れがあるので、
 * 取り込み後に人の目で直す前提（コツは空で入れる）。日本語版が無ければ英語のまま入れる。
 */
export function jaDraft(card: ScryfallCard, printed: ScryfallCard | undefined): JaText {
  const faces = printed?.card_faces ?? (printed ? [printed] : []);
  const text = faces.map((f) => (faces.length > 1 ? `【${stripRuby(f.printed_name ?? f.name)}】` : '') + stripRuby(f.printed_text ?? '')).join('\n');
  return {
    type: faces.map((f) => f.printed_type_line ?? '').join(' // ').replace(/^( \/\/ )+$/, '') || card.type_line || '',
    text: text.trim() || card.oracle_text || '',
    tip: '',
  };
}
