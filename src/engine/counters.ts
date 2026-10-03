// カウンター：あなたのパーマネントに置く（+1/+1 の置換効果を通す）、プレイヤーが得る（RAD）、増殖。
import { scriptOf } from '../cards/registry';
import { aliveOpponents, battlefield, log, nameJa } from './core';
import type { CardInstance, GameState } from './types';

/** カウンターの置き先。'you' はあなた（プレイヤー） */
export type CounterTarget = CardInstance | 'you';

export const COUNTER_JA: Record<string, string> = {
  '+1/+1': '+1/+1',
  loyalty: '忠誠',
  fire: '炎',
  oil: '油',
  quest: '探索',
};

/**
 * あなたのパーマネントにカウンターを置き、置いた個数を返す。
 * 足す置換（硬化した鱗・巻きつき蛇・囁かれる希望の神）を先に、倍にする置換（屍体屋の脅威・枝分かれの進化）を後に適用する。
 * 置換の順は影響を受けるもののコントローラー（あなた）が選べるので、いちばん多くなる順にする（CR 616.1）
 */
export function addCounters(s: GameState, card: CardInstance, kind: string, n: number): number {
  // 0個を置くときは置換も効かない（搭載歩行機械の X=0 など）。戦場を離れたカードには置けない（墓地のカードは別のオブジェクト。CR 400.7）
  if (n <= 0 || card.zone !== 'battlefield') return 0;
  const field = battlefield(s);
  const plus = field.reduce((sum, p) => sum + (scriptOf(p).moreCounters?.(s, p, card, kind) ?? 0), 0);
  const doubles = field.filter((p) => scriptOf(p).doubleCounters?.(s, p, card, kind)).length;
  const total = (n + plus) * 2 ** doubles;
  card.counters[kind] = (card.counters[kind] ?? 0) + total;
  log(s, `${nameJa(card)} に${COUNTER_JA[kind]}カウンター${total}個`);
  for (const p of field) scriptOf(p).onCountersPut?.(s, p, card, kind, total);
  return total;
}

/** あなたがRADカウンターを得る。巻きつき蛇の「あなたがカウンターを得るなら1個多く」が効く */
export function youGetRad(s: GameState, n: number) {
  if (n <= 0) return;
  const plus = battlefield(s).reduce((sum, p) => sum + (scriptOf(p).moreCounters?.(s, p, 'you', 'rad') ?? 0), 0);
  s.rad += n + plus;
  log(s, `あなたはRADカウンター${n + plus}個を得た（${s.rad}個）`);
}

export function oppGetsRad(s: GameState, opp: number, n: number) {
  if (n <= 0) return;
  const o = s.opponents[opp];
  o.rad += n;
  log(s, `対戦相手${opp + 1} はRADカウンター${n}個を得た（${o.rad}個）`);
}

/** 各プレイヤー（あなたと生きている対戦相手）がRADカウンターを得る */
export function radEach(s: GameState, n: number) {
  youGetRad(s, n);
  for (const i of aliveOpponents(s)) oppGetsRad(s, i, n);
}

/**
 * 増殖。対戦相手全員のRADカウンターと、あなたのパーマネントにあるカウンターを1種類につき1個ずつ増やす。
 * あなたのRADカウンターは増やさない（このアプリの決め方。増やしたいときは編集モードで足す）
 */
export function proliferate(s: GameState) {
  log(s, '増殖');
  for (const i of aliveOpponents(s).filter((x) => s.opponents[x].rad > 0)) oppGetsRad(s, i, 1);
  for (const c of battlefield(s)) {
    for (const kind of Object.keys(c.counters).filter((k) => c.counters[k] > 0)) addCounters(s, c, kind, 1);
  }
}
