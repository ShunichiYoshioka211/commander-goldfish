// マナコストの解釈と支払い。マナ・プールを先に使い、足りない分は未タップの発生源を自動でタップする。
import { scriptOf } from '../cards/registry';
import { battlefield, hasKeyword, isCreature, log } from './core';
import { DECK, defByName } from './deck';
import type { CardInstance, GameState, ManaColor } from './types';

export interface Cost {
  generic: number;
  colors: ManaColor[];
  x: number;
}

export interface ManaOption {
  label: string;
  produce: ManaColor[];
  /** 自動支払いに使わない（生け贄やプールからの支払いを伴うもの） */
  manual?: boolean;
  /** 追加のコスト。払えなければ false を返す */
  extra?: (s: GameState, card: CardInstance) => boolean;
}

export const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
export const emptyPool = (): Record<ManaColor, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

/** 統率者の固有色 */
export const IDENTITY: ManaColor[] = COLORS.filter((c) => DECK.commanders.some((n) => defByName(n).colors.includes(c)));

export function parseCost(text: string): Cost {
  const cost: Cost = { generic: 0, colors: [], x: 0 };
  for (const [, sym] of text.matchAll(/\{([^}]+)\}/g)) {
    if (sym === 'X') cost.x++;
    else if (/^\d+$/.test(sym)) cost.generic += Number(sym);
    else cost.colors.push(sym as ManaColor);
  }
  return cost;
}

export const costText = (c: Cost) => (c.generic > 0 || c.colors.length === 0 ? `{${c.generic}}` : '') + c.colors.map((x) => `{${x}}`).join('');

/** スクリプトが無いカードは Scryfall の produced_mana から「{T}: どれか1つ」を作る */
export function manaOptions(s: GameState, card: CardInstance): ManaOption[] {
  const custom = scriptOf(card).mana;
  if (custom) return custom(s, card);
  const colors = defByName(card.name).producedMana.filter((c) => c === 'C' || IDENTITY.includes(c as ManaColor)) as ManaColor[];
  return colors.map((c) => ({ label: `{${c}}`, produce: [c] }));
}

export const canTapForMana = (card: CardInstance) =>
  !card.tapped && !(isCreature(card) && card.sick && !card.haste && !hasKeyword(card, 'Haste'));

/**
 * 自動支払いに使える発生源と、それぞれが出せる色。
 * 出せる色が少ない（ありふれた）発生源ほど先に使い、二色土地や少ない色の土地を後に残す。
 */
function autoSources(s: GameState): { id: string; colors: ManaColor[] }[] {
  const sources = battlefield(s)
    .filter(canTapForMana)
    .map((c) => ({ id: c.id, colors: manaOptions(s, c).filter((o) => !o.manual).flatMap((o) => o.produce) }))
    .filter((src) => src.colors.length > 0);
  const supply = (color: ManaColor) => sources.filter((src) => src.colors.includes(color)).length;
  const precious = (src: { colors: ManaColor[] }) => src.colors.reduce((n, c) => n + (c === 'C' ? 0 : 1 / supply(c)), 0);
  return sources.sort((a, b) => precious(a) - precious(b));
}

/** 二部マッチング（増加路法）で、必要な色の枠に発生源を1つずつ割り当てる */
function assign(slots: (ManaColor | '*')[], sources: { id: string; colors: ManaColor[] }[]): string[] | null {
  const owner: number[] = sources.map(() => -1);
  const fits = (slot: ManaColor | '*', j: number) => slot === '*' || sources[j].colors.includes(slot);
  const tryAssign = (i: number, seen: boolean[]): boolean => {
    for (let j = 0; j < sources.length; j++) {
      if (seen[j] || !fits(slots[i], j)) continue;
      seen[j] = true;
      if (owner[j] === -1 || tryAssign(owner[j], seen)) {
        owner[j] = i;
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < slots.length; i++) {
    if (!tryAssign(i, sources.map(() => false))) return null;
  }
  return sources.filter((_, j) => owner[j] !== -1).map((src) => src.id);
}

function plan(s: GameState, cost: Cost) {
  const pool = { ...s.pool };
  const slots: (ManaColor | '*')[] = [];
  for (const c of cost.colors) {
    if (pool[c] > 0) pool[c]--;
    else slots.push(c);
  }
  let generic = cost.generic;
  for (const c of ['C', ...COLORS] as ManaColor[]) {
    const use = Math.min(pool[c], generic);
    pool[c] -= use;
    generic -= use;
  }
  for (let i = 0; i < generic; i++) slots.push('*');
  const taps = assign(slots, autoSources(s));
  return taps && { pool, taps };
}

export const canPay = (s: GameState, cost: Cost) => plan(s, cost) !== null;

export function pay(s: GameState, cost: Cost): boolean {
  const p = plan(s, cost);
  if (!p) {
    log(s, `マナが足りない（${costText(cost)}）`);
    return false;
  }
  for (const id of p.taps) s.cards[id].tapped = true;
  s.pool = p.pool;
  return true;
}

/** 手動でマナ能力を起動する */
export function tapForMana(s: GameState, id: string, option: number) {
  const card = s.cards[id];
  const opt = manaOptions(s, card)[option];
  if (opt.extra && !opt.extra(s, card)) return;
  card.tapped = true;
  for (const c of opt.produce) s.pool[c]++;
}
