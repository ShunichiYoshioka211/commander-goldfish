// デッキの一覧とカード目録。どこにも依存しない葉のモジュールにしておく（循環 import の初期化順対策）。
//
// デッキは src/data/decks/<id>.json（npm run import-deck が decks/<id>/ から作る）を自動で読み込む。
// ファイルを置けば一覧に出るので、デッキを足すときにこのファイルを書き換える必要はない。
// @extra-decks は e2e・ユニットテストのときだけテスト用デッキの置き場を指す（vite.config.ts）。
import { TOKENS } from '../cards/tokens';
import type { CardDef, DeckData } from './types';

const files = {
  ...import.meta.glob<DeckData>('../data/decks/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<DeckData>('@extra-decks/*.json', { eager: true, import: 'default' }),
};

/** 選べるデッキ。先頭が既定のデッキ */
export const DECKS: DeckData[] = Object.values(files);

/** 知らない ID なら既定のデッキ */
export const deckById = (id: string): DeckData => DECKS.find((d) => d.id === id) ?? DECKS[0];

// カード目録：全デッキのカードを名前でまとめる。ルールと表示に使う情報はデッキに依らず同じ
// （デッキごとに違うのは枚数と使い方のコツだけ。コツは tipOf で引く）
const DEFS: Record<string, CardDef> = { ...TOKENS };
for (const deck of DECKS) {
  for (const card of deck.cards) DEFS[card.name] ??= card;
}

export const defByName = (name: string): CardDef => DEFS[name];

/** そのデッキでの使い方のコツ。トークンなどデッキに無いものは空 */
export const tipOf = (deckId: string, name: string) => deckById(deckId).cards.find((c) => c.name === name)?.tip ?? '';
