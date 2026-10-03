// 切削とRADカウンターの誘発。あなたのライブラリーは実物を、対戦相手のライブラリーは枚数だけを持ち、中身は近似で数える。
import { scriptOf } from '../cards/registry';
import { battlefield, isLand, log, moveTo } from './core';
import { oppLoseLife, youLoseLife } from './damage';
import type { GameState } from './types';

/** 1回の切削（同時に切削したものはまとめて1回。賢きモスマンは1回だけ誘発し、X はその合計） */
export interface MillEvent {
  /** あなたのライブラリーから墓地に置いたカード */
  you: string[];
  /** 対戦相手ごとの枚数（土地でないカードの数は近似） */
  opps: { opp: number; total: number; nonland: number }[];
  /** 土地でないカードの合計 */
  nonland: number;
}

/**
 * 対戦相手のライブラリーで、土地でないカードの割合の近似（5枚に3枚）。乱数は使わず、それまでに切削された枚数から
 * 決まった並びで数える（同じ操作なら同じ結果になり、長く見ると割合がちょうど 3/5 になる）
 */
const OPP_NONLAND = { num: 3, den: 5 };
const nonlandUpTo = (milled: number) => Math.floor((milled * OPP_NONLAND.num) / OPP_NONLAND.den);

function fire(s: GameState, ev: MillEvent) {
  for (const p of battlefield(s)) scriptOf(p).onMilled?.(s, p, ev);
  for (const id of [...s.zones.graveyard]) scriptOf(s.cards[id]).onMilledInGraveyard?.(s, s.cards[id], ev);
  return ev;
}

/** あなたがカードを n 枚切削する（ライブラリーが足りなければあるだけ） */
export function millYou(s: GameState, n: number): MillEvent {
  const ids = s.zones.library.slice(0, n);
  for (const id of ids) moveTo(s, id, 'graveyard');
  const nonland = ids.filter((id) => !isLand(s.cards[id])).length;
  log(s, `あなたは${ids.length}枚を切削（土地でないカード${nonland}枚）`);
  return fire(s, { you: ids, opps: [], nonland });
}

/** 対戦相手たちがカードを n 枚ずつ切削する（同時の1回）。水のクリスタルがあれば1人ごとに4枚多く切削する */
export function millOpponents(s: GameState, opps: number[], n: number): MillEvent {
  const bonus = battlefield(s).reduce((sum, p) => sum + (scriptOf(p).oppMillBonus ?? 0), 0);
  const milled = opps
    .filter((opp) => s.opponents[opp].deadTurn === null)
    .map((opp) => {
      const o = s.opponents[opp];
      const total = Math.min(n + bonus, o.library);
      const nonland = nonlandUpTo(o.milled + total) - nonlandUpTo(o.milled);
      Object.assign(o, { library: o.library - total, milled: o.milled + total, graveyard: o.graveyard + total });
      log(s, `対戦相手${opp + 1} は${total}枚を切削（土地でないカード${nonland}枚とみなす）`);
      return { opp, total, nonland };
    });
  return fire(s, { you: [], opps: milled, nonland: milled.reduce((sum, m) => sum + m.nonland, 0) });
}

/**
 * RADカウンターの誘発（CR 728.1）：最初のメイン・フェイズの開始時に、RADカウンターの数だけ切削し、
 * 土地でないカード1枚につき1点のライフを失ってRADカウンターを1個取り除く（取り除けるのは持っている数まで）
 */
export function radYou(s: GameState) {
  if (s.rad === 0) return;
  const ev = millYou(s, s.rad);
  s.rad = Math.max(0, s.rad - ev.nonland);
  youLoseLife(s, ev.nonland);
}

export function radOpponent(s: GameState, opp: number) {
  const o = s.opponents[opp];
  if (o.rad === 0) return;
  const ev = millOpponents(s, [opp], o.rad);
  o.rad = Math.max(0, o.rad - ev.nonland);
  oppLoseLife(s, opp, ev.nonland, 'RADカウンター');
}
