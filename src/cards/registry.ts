// カード名 → スクリプト。デッキを差し替えたら、自動化したいカードだけここに足す。
// 無いカードは効果テキストを表示するだけで、処理は編集モードで手動で行う。
import type { CardInstance } from '../engine/types';
import { DAMAGE_SCRIPTS } from './scripts/damage';
import { ENGINE_SCRIPTS } from './scripts/engines';
import { LAND_SCRIPTS } from './scripts/lands';
import { MILL_SCRIPTS } from './scripts/mill';
import { SPELL_SCRIPTS } from './scripts/spells';
import type { CardScript } from './types';

const SCRIPTS: Record<string, CardScript> = { ...LAND_SCRIPTS, ...DAMAGE_SCRIPTS, ...ENGINE_SCRIPTS, ...SPELL_SCRIPTS, ...MILL_SCRIPTS };
const NONE: CardScript = {};

export const scriptByName = (name: string): CardScript => SCRIPTS[name] ?? NONE;
export const scriptOf = (card: CardInstance): CardScript => scriptByName(card.name);
export const isScripted = (name: string) => name in SCRIPTS;
