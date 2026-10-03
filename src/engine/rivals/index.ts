// 相手ありモード：相手のターン・ブロック・ブロックされた戦闘・相手のクリーチャーの死亡・編集。
// turn.ts を import しない（turn.ts がここを使う）。モードの判定（if (s.rivals)）は呼ぶ側の入口でだけ行う。
import { scriptOf } from '../../cards/registry';
import {
  aliveOpponents, battlefield, def, enqueue, hasKeyword, isCommander, log, moveTo, nameJa, power, toughness,
} from '../core';
import { boosted, damageOpponent, damageRival } from '../damage';
import { enqueueOpponentTurn } from '../opponents';
import { canRespond } from '../play';
import type { CardInstance, GameState, RivalPermanent, RivalState } from '../types';
import { findRival, kindOf, rivalLabel } from './board';
import { assignBlocks, canBlock, lethalTo, resolveFight, type Fighter } from './combat';
import { KINDS, MAX_CREATURES, ROLLS_PER_STEP, STYLES } from './kinds';
import { commanderLeft, pickStyle, planRivalTurn, rolls, simulateBoard } from './plan';

/** 新しい対局の相手。席に1個、性格に3個の乱数を引く（席を固定しても引く） */
export function initRivals(seed: number, seat: number | null, opponents: number): RivalState {
  const [r, rng] = rolls((seed ^ 0x5f3759df) | 0, 1 + opponents);
  const styles = r.slice(1).map(pickStyle);
  return {
    rng,
    next: 0,
    seat: seat ?? 1 + Math.floor(r[0] * 4),
    styles,
    turns: styles.map(() => 0),
    cmdReady: styles.map((st) => STYLES[st].cmdTurn),
    cmdCasts: styles.map(() => 0),
    rebuilds: 0,
    recap: styles.map(() => ''),
  };
}

/** 相手の盤面にクリーチャーを出す */
export function addRival(s: GameState, opp: number, kind: string): RivalPermanent {
  const p: RivalPermanent = { id: `r${s.rivals!.next++}`, kind, tapped: false, sick: true, damage: 0 };
  s.opponents[opp].board.push(p);
  return p;
}

/** 盤面から取り除く（何も誘発しない）。統率者なら統率領域に戻り、出し直しが遅れる */
function leave(s: GameState, opp: number, id: string) {
  const o = s.opponents[opp];
  const p = o.board.find((x) => x.id === id)!;
  o.board = o.board.filter((x) => x.id !== id);
  const r = s.rivals!;
  const next = commanderLeft({ cmdReady: r.cmdReady[opp], cmdCasts: r.cmdCasts[opp] }, r.turns[opp], Number(kindOf(p).commander === true));
  r.cmdReady[opp] = next.cmdReady;
  r.cmdCasts[opp] = next.cmdCasts;
  return p;
}

/**
 * 相手のクリーチャーの死亡。このターンに死亡した数・土地以外が戦場を離れたことに数え、
 * あなたのパーマネントの onRivalCreatureDies を呼ぶ（ガルナは「あなたがコントロールしている」ものだけなので呼ばれない）
 */
export function destroyRival(s: GameState, opp: number, id: string) {
  const p = leave(s, opp, id);
  s.flags.creaturesDied++;
  s.flags.nonlandLeft = true;
  log(s, `相手${opp + 1}の${kindOf(p).name}が死亡`);
  for (const card of battlefield(s)) scriptOf(card).onRivalCreatureDies?.(s, card);
}

/** 相手のクリーチャーか自分のパーマネントを破壊する（除去の対象） */
export function destroyTarget(s: GameState, id: string) {
  const rival = findRival(s, id);
  if (rival) destroyRival(s, rival.opp, id);
  else moveTo(s, id, 'graveyard');
}

/** 致死ダメージを受けた相手のクリーチャーをまとめて死亡させる */
export function sweepRivals(s: GameState) {
  s.opponents.forEach((o, opp) => {
    for (const p of o.board.filter((x) => x.damage >= kindOf(x).toughness)) destroyRival(s, opp, p.id);
  });
}

// ---- 相手のターン ----

/**
 * 相手の1ターンの盤面の動き。乱数は結果によらず ROLLS_PER_STEP 個引く（脱落していても引く）。
 * ターンの始め（flags を戻す・ドロー・RADカウンター）と終わり（終了ステップ・クリンナップ）は opponents.ts
 */
export function rivalStep(s: GameState, opp: number) {
  const r = s.rivals!;
  const [roll, rng] = rolls(r.rng, ROLLS_PER_STEP);
  r.rng = rng;
  const o = s.opponents[opp];
  if (o.deadTurn !== null) return;
  const t = ++r.turns[opp];
  for (const p of o.board) Object.assign(p, { tapped: false, sick: false });
  const ids = o.board.map((p) => p.id);
  const plan = planRivalTurn({ style: r.styles[opp], t, board: o.board, cmdReady: r.cmdReady[opp] }, roll);
  const died = plan.dies.map((i) => KINDS[o.board[i].kind].name);
  for (const i of plan.dies) destroyRival(s, opp, ids[i]);
  const made = plan.deploy.map((kind) => KINDS[addRival(s, opp, kind).kind].name);
  for (const i of plan.tap) o.board.find((p) => p.id === ids[i])!.tapped = true;
  const parts = [
    { n: made.length, text: `${made.join('・')}を出した` },
    { n: plan.tap.length, text: `${plan.tap.length}体がほかの相手を攻撃` },
    { n: died.length, text: `${died.join('・')}が倒れた` },
  ]
    .filter((x) => x.n > 0)
    .map((x) => x.text);
  // 何もしなかったターンは「動きなし」
  r.recap[opp] = [...parts, '動きなし'].slice(0, Math.max(1, parts.length)).join('、');
  log(s, `［相手${opp + 1}のターン${t}］${r.recap[opp]}`);
}

/** 相手1人のターン（ドロー・RADカウンター → 盤面の動き → 終了ステップ。opponents.ts） */
const step = (s: GameState, opp: number) => enqueueOpponentTurn(s, opp, [(st) => rivalStep(st, opp)]);

/** キープのあと、あなたより前の席の相手が1ターン進む */
export function preRound(s: GameState) {
  const n = s.opponents.length;
  s.opponents.map((_, i) => i).filter((i) => i > n - s.rivals!.seat).forEach((i) => step(s, i));
}

/** あなたのクリンナップのあと、相手1→2→3の順に1ターンずつ進む */
export function rivalRound(s: GameState) {
  s.opponents.forEach((_, i) => step(s, i));
}

// ---- ブロック ----

/** あなたのクリーチャーの判断に使う価値。トークンは0、増幅か誘発を持つものは+5、統率者は+10 */
const ENGINE_HOOKS = ['damageBonus', 'onEnter', 'onCreatureEnters', 'onPermanentEnters', 'onAttack', 'onCombatStart', 'onUpkeep', 'onEndStep', 'onCombatDamage', 'onCreatureDies'];
const cardValue = (s: GameState, card: CardInstance) => {
  const engine = ENGINE_HOOKS.some((h) => h in scriptOf(card));
  return Number(!card.token) * (def(card).cmc + 5 * Number(engine) + 10 * Number(isCommander(s, card)));
};

export function fighterOf(s: GameState, card: CardInstance): Fighter {
  const p = power(card);
  return {
    id: card.id,
    power: p,
    hit: boosted(s, card, p, true, 'permanent'),
    face: boosted(s, card, p, true, 'player'),
    toughness: toughness(card),
    // 跳躍（フライヤ）はあなたのターンだけ飛行。第1段階では戦闘はあなたのターンにしか起きない
    flying: hasKeyword(card, 'Flying') || hasKeyword(card, 'Jump'),
    reach: hasKeyword(card, 'Reach'),
    deathtouch: hasKeyword(card, 'Deathtouch'),
    menace: hasKeyword(card, 'Menace'),
    trample: hasKeyword(card, 'Trample'),
    value: cardValue(s, card),
    commander: isCommander(s, card),
  };
}

export function rivalFighter(p: RivalPermanent): Fighter {
  const k = kindOf(p);
  const has = (kw: string) => k.keywords.includes(kw);
  return {
    id: p.id,
    power: k.power,
    hit: k.power,
    face: k.power,
    toughness: k.toughness - p.damage,
    flying: has('Flying'),
    reach: has('Reach'),
    deathtouch: has('Deathtouch'),
    menace: false,
    trample: has('Trample'),
    value: k.value,
    commander: k.commander === true,
  };
}

const attackersOf = (s: GameState) => battlefield(s).filter((c) => c.attacking !== null);

/** ブロックできる相手のクリーチャーがいるか */
const blockable = (s: GameState) =>
  attackersOf(s).some((c) => s.opponents[c.attacking!].board.some((p) => !p.tapped && canBlock(fighterOf(s, c), rivalFighter(p))));

/**
 * 攻撃時の誘発のあとに積む。インスタントか起動型能力を使えて、ブロックできる相手がいるときだけ
 * 'declared'（ブロックの前）で止まり、そうでなければすぐにブロックを決める
 */
export function beforeBlocks(s: GameState) {
  enqueue(s, '相手のブロック', (st) => {
    if (canRespond(st) && blockable(st)) st.phase = 'declared';
    else declareBlocks(st);
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function declareBlocks(s: GameState) {
  s.phase = 'attacking';
  const attacking = attackersOf(s);
  for (const opp of aliveOpponents(s)) {
    const o = s.opponents[opp];
    const attackers = attacking.filter((c) => c.attacking === opp).map((c) => fighterOf(s, c));
    const blockers = o.board.filter((p) => !p.tapped).map(rivalFighter);
    // ブロックされない攻撃で、ライフが0になるか、統率者ダメージが21に届くか
    const lethal = (unblocked: Fighter[]) =>
      sum(unblocked.map((f) => f.face)) >= o.life ||
      sum(unblocked.filter((f) => f.commander).map((f) => f.face)) + o.commanderDamage >= 21;
    Object.assign(s.blocks, assignBlocks(attackers, blockers, lethal, s.rivals!.styles[opp] !== 'aggro'));
  }
  for (const [a, b] of Object.entries(s.blocks)) {
    const { opp, p } = findRival(s, b)!;
    log(s, `${nameJa(s.cards[a])} ← 相手${opp + 1}の${rivalLabel(p)}`);
  }
}

/**
 * ブロックされた攻撃クリーチャーの戦闘ダメージ。死ぬものは deaths に入れ、死亡はあとでまとめて処理する。
 * ブロッカーがダメージの前に除去されていても、攻撃クリーチャーはブロックされたまま
 */
export function fightBlocked(s: GameState, a: CardInstance, deaths: string[]): number {
  const opp = a.attacking!;
  const o = s.opponents[opp];
  const f = fighterOf(s, a);
  const p = o.board.find((x) => x.id === s.blocks[a.id]);
  if (!p) return damageOpponent(s, a, opp, resolveFight(f, null).toPlayer, true);
  const k = kindOf(p);
  const res = resolveFight(f, rivalFighter(p));
  // 相手の絆魂（天使）：与えたダメージの分、その相手がライフを得る
  o.life += res.toAttacker * Number(k.keywords.includes('Lifelink'));
  log(s, `相手${opp + 1}の${k.name} → ${nameJa(a)} に ${res.toAttacker}点`);
  damageRival(s, a, opp, p.id, res.toBlocker, true);
  const dealt = damageOpponent(s, a, opp, res.toPlayer, true);
  if (lethalTo(res.toAttacker, k.keywords.includes('Deathtouch'), toughness(a))) deaths.push(a.id);
  return dealt;
}

// ---- 編集 ----

export function editAddRival(s: GameState, opp: number, kind: string) {
  // 1人8体まで（相手のターンの乱数の添字が、盤面の8体ぶんしか予約されていないため）
  if (s.opponents[opp].board.length >= MAX_CREATURES) {
    log(s, `［編集］相手${opp + 1}のクリーチャーは${MAX_CREATURES}体まで`);
    return;
  }
  const p = addRival(s, opp, kind);
  log(s, `［編集］相手${opp + 1}に${rivalLabel(p)}を出した`);
}

/** 取り除く。trigger なら死亡として扱う（病的な日和見主義者など） */
export function editRemoveRival(s: GameState, opp: number, id: string, trigger: boolean) {
  if (trigger) {
    destroyRival(s, opp, id);
    return;
  }
  const p = leave(s, opp, id);
  log(s, `［編集］相手${opp + 1}の${kindOf(p).name}を取り除いた`);
}

/**
 * 盤面を作り直す。その相手が終えたターン数ぶん、空の盤面から育て直す。消えたものは死亡ではないので誘発しない。
 * 乱数は rivals.rng を使わず、（シード・相手・ターン数・作り直しの回数）から作る（本来の流れをずらさない）
 */
export function rebuildRival(s: GameState, opp: number) {
  const r = s.rivals!;
  r.rebuilds++;
  const seed = (s.seed ^ Math.imul(opp + 1, 0x9e3779b9) ^ Math.imul(r.turns[opp] + 1, 0x85ebca6b) ^ Math.imul(r.rebuilds, 0xc2b2ae35)) | 0;
  const sim = simulateBoard(r.styles[opp], r.turns[opp], seed);
  s.opponents[opp].board = [];
  for (const p of sim.board) Object.assign(addRival(s, opp, p.kind), { tapped: p.tapped, sick: p.sick });
  r.cmdReady[opp] = sim.cmdReady;
  r.cmdCasts[opp] = sim.cmdCasts;
  log(s, `［編集］相手${opp + 1}の盤面を作り直した（${s.opponents[opp].board.map(rivalLabel).join('、')}）`);
}
