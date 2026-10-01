// マナコストの解釈と支払い。マナ・プールを先に使い、足りない分は未タップの発生源を自動でタップする。
import { scriptOf } from '../cards/registry';
import { battlefield, hasKeyword, isCreature, log, nameJa } from './core';
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
  /** 使うと1点のダメージを受ける */
  pain?: boolean;
  /** 自動支払いだけで使う近似（カード詳細には出さない） */
  auto?: boolean;
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

/** 自動支払いで割り当てる1マナぶんの単位。Sol Ring のように一度に2マナ出すものは2単位になる */
interface Unit {
  id: string;
  colors: ManaColor[];
  /** この色で使うと1点のダメージを受ける（ペインランド・タリスマン） */
  pain: ManaColor[];
}

/**
 * 自動支払いに使える単位。
 * 出せる色が少ない（ありふれた）発生源ほど先に使い、二色土地や少ない色の土地を後に残す。
 */
function autoUnits(s: GameState): Unit[] {
  const units: Unit[] = [];
  for (const card of battlefield(s).filter(canTapForMana)) {
    const options = manaOptions(s, card).filter((o) => !o.manual);
    const singles = options.filter((o) => o.produce.length === 1);
    if (singles.length > 0) {
      units.push({ id: card.id, colors: singles.map((o) => o.produce[0]), pain: singles.filter((o) => o.pain).map((o) => o.produce[0]) });
    }
    for (const o of options.filter((x) => x.produce.length > 1)) {
      for (const color of o.produce) units.push({ id: card.id, colors: [color], pain: [] });
    }
  }
  const supply = (color: ManaColor) => units.filter((u) => u.colors.includes(color)).length;
  const precious = (u: Unit) => u.colors.reduce((n, c) => n + (c === 'C' ? 0 : 1 / supply(c)), 0);
  return units.sort((a, b) => precious(a) - precious(b));
}

type Slot = ManaColor | '*';

/** 二部マッチング（増加路法）で、必要な色の枠に単位を1つずつ割り当てる。戻り値は単位ごとの枠（未使用は -1） */
function assign(slots: Slot[], units: Unit[]): number[] | null {
  const owner: number[] = units.map(() => -1);
  const fits = (slot: Slot, j: number) => slot === '*' || units[j].colors.includes(slot);
  const tryAssign = (i: number, seen: boolean[]): boolean => {
    for (let j = 0; j < units.length; j++) {
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
    if (!tryAssign(i, units.map(() => false))) return null;
  }
  return owner;
}

function plan(s: GameState, cost: Cost) {
  const pool = { ...s.pool };
  const slots: Slot[] = [];
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
  const units = autoUnits(s);
  const owner = assign(slots, units);
  return owner && { pool, units, owner, slots };
}

export const canPay = (s: GameState, cost: Cost) => plan(s, cost) !== null;

export function pay(s: GameState, cost: Cost): boolean {
  const p = plan(s, cost);
  if (!p) {
    log(s, `マナが足りない（${costText(cost)}）`);
    return false;
  }
  const tapped = new Set<string>();
  p.units.forEach((u, j) => {
    if (p.owner[j] === -1) return;
    tapped.add(u.id);
    const slot = p.slots[p.owner[j]];
    const color = slot === '*' ? (u.colors.includes('C') ? 'C' : u.colors[0]) : slot;
    if (u.pain.includes(color)) {
      s.life -= 1;
      log(s, `${nameJa(s.cards[u.id])} で1点のダメージ`);
    }
  });
  s.pool = p.pool;
  // 一度に複数マナ出す発生源の、使わなかった分はプールに残る
  p.units.forEach((u, j) => {
    if (p.owner[j] === -1 && tapped.has(u.id)) s.pool[u.colors[0]]++;
  });
  for (const id of tapped) s.cards[id].tapped = true;
  return true;
}

/** 手動でマナ能力を起動する */
export function tapForMana(s: GameState, id: string, option: number) {
  const card = s.cards[id];
  const opt = manaOptions(s, card)[option];
  if (opt.extra && !opt.extra(s, card)) return;
  card.tapped = true;
  if (opt.pain) s.life -= 1;
  for (const c of opt.produce) s.pool[c]++;
}
