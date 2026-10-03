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
  /** 残りのタフネス */
  toughness: number;
  flying: boolean;
  reach: boolean;
  deathtouch: boolean;
  menace: boolean;
  trample: boolean;
  /** 価値。相討ちにするか、どれでブロックするかを決める */
  value: number;
  commander: boolean;
}

/** その点数でタフネスのあるクリーチャーが死ぬか */
export const lethalTo = (amount: number, deathtouch: boolean, toughness: number) => amount >= toughness || (deathtouch && amount > 0);

/**
 * ブロックできるか。威迫は2体でないとブロックできないが、相手は2体でブロックしないので止めない
 * （ルール違反ではなく、相手を単純にしているだけ）
 */
export const canBlock = (attacker: Fighter, blocker: Fighter) =>
  !attacker.menace && (!attacker.flying || blocker.flying || blocker.reach);

/**
 * ブロックの決め方。攻撃クリーチャーを価値の大きい順に見て、
 * 0 生き残って倒せる → 1 生き残る → 2 相討ち（攻撃側の価値がブロッカー以上、trades のときだけ）→ ブロックしない。
 * 表は [ブロッカーが死ぬ][攻撃側が死ぬ]
 */
const RANK = (tradeOk: number) => [
  [1, 0],
  [3, 3 - tradeOk],
];

/**
 * 相手1人のブロックを決める。最後に、ブロックされない攻撃で致死になるなら、
 * 残りのブロッカーで点の大きい攻撃から順にチャンプブロックする
 */
export function assignBlocks(
  attackers: Fighter[],
  blockers: Fighter[],
  lethal: (unblocked: Fighter[]) => boolean,
  trades: boolean,
): Record<string, string> {
  const blocks: Record<string, string> = {};
  let free = [...blockers];
  const take = (a: Fighter, b: Fighter) => {
    blocks[a.id] = b.id;
    free = free.filter((x) => x.id !== b.id);
  };
  const byValue = [...attackers].sort((x, y) => y.value - x.value);
  for (const a of byValue) {
    const ranked = free
      .filter((b) => canBlock(a, b))
      .map((b) => {
        const bDies = lethalTo(a.hit, a.deathtouch, b.toughness);
        const aDies = lethalTo(b.hit, b.deathtouch, a.toughness);
        const tradeOk = Number(trades && a.value >= b.value);
        return { b, rank: RANK(tradeOk)[Number(bDies)][Number(aDies)] };
      })
      .filter((x) => x.rank < 3)
      .sort((x, y) => (x.rank - y.rank) * 1000 + (x.b.value - y.b.value));
    if (ranked.length > 0) take(a, ranked[0].b);
  }
  const unblocked = () => attackers.filter((a) => !(a.id in blocks));
  for (const a of [...attackers].sort((x, y) => y.face - x.face)) {
    if (!lethal(unblocked())) break;
    const chump = free.filter((b) => !(a.id in blocks) && canBlock(a, b)).sort((x, y) => x.value - y.value);
    if (chump.length > 0) take(a, chump[0]);
  }
  return blocks;
}

export interface FightResult {
  toBlocker: number;
  toPlayer: number;
  toAttacker: number;
}

/**
 * ブロックされた攻撃クリーチャーのダメージの割り当て（基本のパワーで行う。CR 702.19）。
 * 増幅は受け手ごとに1回だけ、適用する側（damageRival・damageOpponent）で足す。
 * ブロッカーがダメージの前に除去されていたら（blocker=null）、トランプルなら全点が本体へ、そうでなければ与えない
 */
export function resolveFight(attacker: Fighter, blocker: Fighter | null): FightResult {
  if (!blocker) return { toBlocker: 0, toPlayer: attacker.trample ? attacker.power : 0, toAttacker: 0 };
  const lethal = attacker.deathtouch ? 1 : blocker.toughness;
  const toBlocker = attacker.trample ? Math.min(attacker.power, lethal) : attacker.power;
  return { toBlocker, toPlayer: attacker.power - toBlocker, toAttacker: blocker.power };
}
