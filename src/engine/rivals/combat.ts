// 相手のブロックと、ブロックされた戦闘のダメージの割り当て。GameState に触れない純粋関数。

/** 戦闘に関わるクリーチャーを、ブロックの判断に要る値だけにしたもの */
export interface Fighter {
  id: string;
  /** 基本のパワー（ダメージの割り当てに使う） */
  power: number;
  /** 相手のパーマネントに与える、増幅込みの点（判断に使う） */
  hit: number;
  /** 相手プレイヤーに与える、増幅込みの点（致死の判断に使う） */
  face: number;
  /** 相手のパーマネント1体あたりに足される増幅（トーブランなら2）。複数のブロッカーへの割り当てに使う */
  bonus: number;
  /** 残りのタフネス */
  toughness: number;
  flying: boolean;
  reach: boolean;
  deathtouch: boolean;
  menace: boolean;
  trample: boolean;
  /** ブロックされない（いとしいしとを装備している） */
  unblockable: boolean;
  /** 価値。相討ちにするか、どれでブロックするかを決める */
  value: number;
  commander: boolean;
}

/** その点数でタフネスのあるクリーチャーが死ぬか */
export const lethalTo = (amount: number, deathtouch: boolean, toughness: number) => amount >= toughness || (deathtouch && amount > 0);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** ブロックできるか（1体ずつの判定。威迫に2体要ることは canBeBlocked と assignBlocks で見る） */
export const canBlock = (attacker: Fighter, blocker: Fighter) =>
  !attacker.unblockable && (!attacker.flying || blocker.flying || blocker.reach);

/** 止めるのに要る体数。威迫は2体 */
const needed = (a: Fighter) => 1 + Number(a.menace);

/** その中に、止められるだけのブロッカーがいるか */
export const canBeBlocked = (a: Fighter, blockers: Fighter[]) => blockers.filter((b) => canBlock(a, b)).length >= needed(a);

export interface FightResult {
  /** ブロッカーごとに割り当てる点（基本のパワー。並びは blockers と同じ） */
  toBlockers: number[];
  /** 割り当てで死ぬブロッカー（増幅込み） */
  killed: boolean[];
  toPlayer: number;
  /** ブロッカーから攻撃クリーチャーへの点の合計 */
  toAttacker: number;
  attackerDies: boolean;
}

/** 選び方を全部試して、予算の中で倒せる価値がいちばん大きい組を選ぶ（同じなら数の多い方）。ブロッカーは多くて数体 */
function bestKills(budget: number, needs: number[], values: number[]): boolean[] {
  let best = 0;
  let bestScore = -1;
  for (let mask = 0; mask < 1 << needs.length; mask++) {
    const picked = needs.map((_, i) => ((mask >> i) & 1) === 1);
    const cost = sum(needs.filter((_, i) => picked[i]));
    const score = sum(values.filter((_, i) => picked[i])) * 100 + sum(picked.map(Number));
    if (cost <= budget && score > bestScore) [best, bestScore] = [mask, score];
  }
  return needs.map((_, i) => ((best >> i) & 1) === 1);
}

/**
 * ブロックされた攻撃クリーチャーのダメージの割り当て（基本のパワーで行う。CR 510.1c）。割り当てはあなたが決めるものだが、自動で行う：
 * トランプルで全員に致死量（残りのタフネス、接死なら1。増幅は数えない。CR 702.19c）を割り当てられるなら、残りを本体へ。
 * そうでなければ、増幅込みで倒せる価値が最大になるように割り当て、余りは先頭のブロッカーへ。
 * 増幅は受け手ごとに1回だけ、適用する側（damageRival・damageOpponent）で足す。
 * ブロッカーがダメージの前に全員除去されていたら（blockers が空）、トランプルなら全点が本体へ、そうでなければ与えない
 */
export function resolveFight(a: Fighter, blockers: Fighter[]): FightResult {
  const power = Math.max(0, a.power);
  const toAttacker = sum(blockers.map((b) => b.power));
  const attackerDies = lethalTo(toAttacker, blockers.some((b) => b.deathtouch && b.power > 0), a.toughness);
  const lethal = blockers.map((b) => (a.deathtouch ? 1 : b.toughness));
  if (a.trample && power >= sum(lethal)) {
    return { toBlockers: lethal, killed: blockers.map(() => true), toPlayer: power - sum(lethal), toAttacker, attackerDies };
  }
  const needs = blockers.map((b) => (a.deathtouch ? 1 : Math.max(1, b.toughness - a.bonus)));
  const killed = bestKills(power, needs, blockers.map((b) => b.value));
  const toBlockers = needs.map((n, i) => n * Number(killed[i]));
  if (blockers.length > 0) toBlockers[0] += power - sum(toBlockers);
  return { toBlockers, killed, toPlayer: 0, toAttacker, attackerDies };
}

/** 1体か2体の組。威迫は2体の組だけ */
function blockerSets(a: Fighter, able: Fighter[]): Fighter[][] {
  const pairs = able.flatMap((b, i) => able.slice(i + 1).map((c) => [b, c]));
  return [...able.filter(() => !a.menace).map((b) => [b]), ...pairs];
}

/**
 * ブロックの組の順位。0 誰も死なずに倒せる → 1 誰も死なない → 2 相討ち（失う価値が攻撃側以下、trades のときだけ）→ 3 ブロックしない。
 * 同じ順位なら、失う価値が小さい・体数が少ない・価値が小さい組を選ぶ
 */
function judge(a: Fighter, bs: Fighter[], trades: boolean) {
  const fight = resolveFight(a, bs);
  const lost = sum(bs.filter((_, i) => fight.killed[i]).map((b) => b.value));
  const anyLost = fight.killed.some(Boolean);
  const rank = anyLost ? 3 - Number(fight.attackerDies && trades && lost <= a.value) : 1 - Number(fight.attackerDies);
  return { bs, rank, key: rank * 1e9 + lost * 1e6 + bs.length * 1e3 + sum(bs.map((b) => b.value)) };
}

/**
 * 相手1人のブロックを決める（攻撃クリーチャー → ブロッカーの並び）。攻撃クリーチャーを価値の大きい順に見て、
 * 1体か2体の組から judge の順位でいちばん良いものを選ぶ（2体で囲めば誰も死なずに倒せるなら囲む。威迫は2体で止める）。
 * 最後に、ブロックされない攻撃で致死になるなら、残りのブロッカーで点の大きい攻撃から順にチャンプブロックする
 */
export function assignBlocks(
  attackers: Fighter[],
  blockers: Fighter[],
  lethal: (unblocked: Fighter[]) => boolean,
  trades: boolean,
): Record<string, string[]> {
  const blocks: Record<string, string[]> = {};
  let free = [...blockers];
  const take = (a: Fighter, bs: Fighter[]) => {
    blocks[a.id] = bs.map((b) => b.id);
    free = free.filter((x) => !bs.includes(x));
  };
  const byValue = [...attackers].sort((x, y) => y.value - x.value);
  for (const a of byValue) {
    const ranked = blockerSets(a, free.filter((b) => canBlock(a, b)))
      .map((bs) => judge(a, bs, trades))
      .filter((x) => x.rank < 3)
      .sort((x, y) => x.key - y.key);
    if (ranked.length > 0) take(a, ranked[0].bs);
  }
  const unblocked = () => attackers.filter((a) => !(a.id in blocks));
  for (const a of [...attackers].sort((x, y) => y.face - x.face)) {
    if (!lethal(unblocked())) break;
    const chump = free.filter((b) => !(a.id in blocks) && canBlock(a, b)).sort((x, y) => x.value - y.value).slice(0, needed(a));
    if (chump.length === needed(a)) take(a, chump);
  }
  return blocks;
}
