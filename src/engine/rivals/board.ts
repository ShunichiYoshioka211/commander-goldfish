// 相手の盤面を読むだけの関数。engine/play.ts からも使うので、ほかのエンジンのモジュールを import しない。
import type { GameState, PromptOption, RivalPermanent } from '../types';
import { KEYWORD_JA, KINDS } from './kinds';

export const kindOf = (p: RivalPermanent) => KINDS[p.kind];

/** 全相手のクリーチャー */
export const rivalCreatures = (s: GameState) => s.opponents.flatMap((o, opp) => o.board.map((p) => ({ opp, p })));

export const findRival = (s: GameState, id: string) => rivalCreatures(s).find((x) => x.p.id === id);

/** 表示の部品：名前（統率者は★付き）・P/T（受けたダメージがあれば「4/4（2）」）・能力 */
export function rivalParts(p: RivalPermanent) {
  const k = kindOf(p);
  return {
    name: `${k.commander ? '★' : ''}${k.name}`,
    pt: `${k.power}/${k.toughness}${p.damage > 0 ? `（${p.damage}）` : ''}`,
    keywords: k.keywords.map((kw) => KEYWORD_JA[kw]),
  };
}

/** 「熊 2/2」「★統率者 4/4 飛行」 */
export function rivalLabel(p: RivalPermanent) {
  const { name, pt, keywords } = rivalParts(p);
  return [name, pt, ...keywords.map((k) => k.name)].join(' ');
}

/** 相手のクリーチャーを選ぶ選択肢（選択画面にチップを出す） */
export const rivalOptions = (s: GameState): PromptOption[] =>
  rivalCreatures(s).map(({ opp, p }) => ({ label: `相手${opp + 1}の ${rivalLabel(p)}`, value: p.id, rival: { opp, id: p.id } }));
