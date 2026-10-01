// デッキとトークンの定義。どこにも依存しない葉のモジュールにしておく（循環 import の初期化順対策）。
import deckJson from '../data/deck.json';
import { TOKENS } from '../cards/tokens';
import type { CardDef, DeckData } from './types';

export const DECK = deckJson as DeckData;
const DEFS: Record<string, CardDef> = { ...Object.fromEntries(DECK.cards.map((c) => [c.name, c])), ...TOKENS };

export const defByName = (name: string): CardDef => DEFS[name];
