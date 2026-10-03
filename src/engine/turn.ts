// ゲームの開始・マリガン・ターンの進行・戦闘。
import { scriptOf } from '../cards/registry';
import {
  battlefield, blankInstance, canAttack, chooseCards, destroyAll, drain, draw, endOfTurnCleanup, enqueue, freshFlags, log,
  moveTo, nameJa, power, shuffleLibrary,
} from './core';
import { damageOpponent, updateDeath } from './damage';
import { deckById } from './deck';
import { emptyPool } from './mana';
import { beforeBlocks, fightBlocked, initRivals, preRound, rivalRound, sweepRivals } from './rivals';
import { STYLES } from './rivals/kinds';
import type { CardInstance, GameState } from './types';

export const STARTING_LIFE = 40;
export const OPPONENTS = 3;
const HAND_SIZE = 7;

/** 相手ありモードの設定。seat は席の固定（null ならシードで決める） */
export interface RivalsOption {
  seat: number | null;
}

export function newGame(seed: number, deckId: string, rivals: RivalsOption | null): GameState {
  const deck = deckById(deckId);
  const s: GameState = {
    deckId: deck.id, commanders: [...deck.commanders], seed, rng: seed, cards: {},
    zones: { library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] },
    nextToken: 0, turn: 0, phase: 'mulligan', life: STARTING_LIFE,
    opponents: Array.from({ length: OPPONENTS }, () => ({ life: STARTING_LIFE, commanderDamage: 0, deadTurn: null, board: [] })),
    pool: emptyPool(), landPlayed: false, commanderCasts: {}, monarch: false, speed: 0, speedUpTurn: 0,
    mulligans: 0, plan: {}, queue: [], fresh: [], prompt: null, flags: freshFlags(), log: [], damage: [],
    rivals: rivals && initRivals(seed, rivals.seat, OPPONENTS), blocks: {}, active: null,
    startedAt: Date.now(), finishedAt: null,
  };
  if (s.rivals) {
    const styles = s.rivals.styles.map((st, i) => `相手${i + 1} ${STYLES[st].name}`).join('・');
    log(s, `相手あり：あなたは${s.rivals.seat}番手（${styles}）`);
  }
  let n = 0;
  for (const c of deck.cards) {
    for (let i = 0; i < c.count; i++) {
      const id = `c${n++}`;
      const zone = deck.commanders.includes(c.name) ? 'command' : 'library';
      s.cards[id] = blankInstance(id, c.name, false, zone);
      s.zones[zone].push(id);
    }
  }
  shuffleLibrary(s);
  draw(s, HAND_SIZE);
  return s;
}

export function mulligan(s: GameState) {
  for (const id of [...s.zones.hand]) moveTo(s, id, 'library');
  shuffleLibrary(s);
  draw(s, HAND_SIZE);
  s.mulligans++;
  log(s, `マリガン（${s.mulligans}回目）`);
}

/** コマンダーは最初のマリガンが無料。残りの枚数だけライブラリーの下に置く */
export function keep(s: GameState) {
  const bottom = Math.max(0, s.mulligans - 1);
  if (bottom === 0) return beginGame(s);
  chooseCards(s, `ライブラリーの下に置く ${bottom} 枚`, [...s.zones.hand], bottom, bottom, (st, ids) => {
    for (const id of ids) moveTo(st, id, 'library', { bottom: true });
    beginGame(st);
  });
}

/** 相手ありなら、あなたより前の席の相手が先に1ターン進む */
function beginGame(s: GameState) {
  if (s.rivals) preRound(s);
  enqueue(s, '1ターン目', startTurn);
  drain(s);
}

function eachPermanent(s: GameState, f: (card: CardInstance) => void) {
  for (const card of battlefield(s)) f(card);
}

function startTurn(s: GameState) {
  s.turn++;
  s.phase = 'main1';
  s.landPlayed = false;
  s.pool = emptyPool();
  s.flags = freshFlags();
  s.active = null;
  log(s, `—— ${s.turn}ターン目 ——`);
  eachPermanent(s, (c) => Object.assign(c, { tapped: false, sick: false }));
  eachPermanent(s, (c) => scriptOf(c).onUpkeep?.(s, c));
  enqueue(s, 'ドロー', (st) => {
    if (st.turn > 1) draw(st, 1);
  });
  drain(s);
}

export function toCombat(s: GameState) {
  s.phase = 'combat';
  s.pool = emptyPool();
  s.plan = {};
  eachPermanent(s, (c) => scriptOf(c).onCombatStart?.(s, c));
  drain(s);
}

/** 攻撃クリーチャーの指定を切り替える。opp=null で外す */
export function planAttack(s: GameState, id: string, opp: number | null) {
  if (opp === null) delete s.plan[id];
  else s.plan[id] = opp;
}

export function planAll(s: GameState, opp: number) {
  for (const c of battlefield(s).filter(canAttack)) s.plan[c.id] = opp;
}

export function declareAttack(s: GameState) {
  const attackers = Object.entries(s.plan).map(([id, opp]) => {
    const c = s.cards[id];
    c.attacking = opp;
    c.tapped = true;
    return c;
  });
  s.plan = {};
  s.phase = 'attacking';
  if (attackers.length > 0) {
    s.flags.attacked = true;
    log(s, `${attackers.map(nameJa).join('、')} で攻撃`);
    eachPermanent(s, (c) => scriptOf(c).onAttack?.(s, c, attackers));
    for (const id of [...s.zones.graveyard]) scriptOf(s.cards[id]).onAttackFromGraveyard?.(s, s.cards[id], attackers);
  }
  // 相手ありなら、攻撃時の誘発を解決してから相手がブロックする
  if (s.rivals) beforeBlocks(s);
  drain(s);
}

export function combatDamage(s: GameState) {
  const hits: { attacker: CardInstance; opp: number }[] = [];
  const deaths: string[] = [];
  for (const a of battlefield(s).filter((c) => c.attacking !== null)) {
    const opp = a.attacking!;
    // ライフの増減ではなく、与えた点数で見る（相手の絆魂で相殺されても、戦闘ダメージを与えたことに変わりはない）
    const dealt = a.id in s.blocks ? fightBlocked(s, a, deaths) : damageOpponent(s, a, opp, power(a), true);
    if (dealt > 0) hits.push({ attacker: a, opp });
  }
  if (hits.length > 0) eachPermanent(s, (c) => scriptOf(c).onCombatDamage?.(s, c, hits));
  // 戦闘ダメージは同時なので、全員分を割り当ててから死亡をまとめて処理する（ガルナは同時に死んでも見届ける）。
  // 相手のクリーチャーを先にするのは、同時に死ぬ病的な日和見主義者がそれを見届けられるように
  sweepRivals(s);
  destroyAll(s, deaths);
  // 脱落も全員分のダメージのあとで判定する（途中で盤面が消えて、後ろのブロックがなくならないように）
  s.opponents.forEach((_, i) => updateDeath(s, i));
  // 戦闘ダメージのあとも、戦闘終了までは攻撃している扱い（ここで生け贄にすればガルナで引ける）
  enqueue(s, '戦闘ダメージ後', (st) => void (st.phase = 'afterDamage'));
  drain(s);
}

export function endCombat(s: GameState) {
  eachPermanent(s, (c) => void (c.attacking = null));
  s.blocks = {};
  s.phase = 'main2';
  s.pool = emptyPool();
}

export function endTurn(s: GameState) {
  s.pool = emptyPool();
  eachPermanent(s, (c) => void (c.attacking = null));
  s.plan = {};
  s.blocks = {};
  eachPermanent(s, (c) => scriptOf(c).onEndStep?.(s, c));
  if (s.monarch) enqueue(s, '統治者：1枚引く', (st) => draw(st, 1));
  enqueue(s, '終了ステップの遅延誘発', (st) => {
    for (const c of battlefield(st).filter((x) => x.atEnd !== null)) {
      if (c.atEnd === 'sacrifice') {
        moveTo(st, c.id, 'graveyard');
        continue;
      }
      moveTo(st, c.id, 'exile');
      if (c.atEnd === 'warp') st.cards[c.id].castable = true;
    }
  });
  enqueue(s, 'クリンナップ', cleanup);
  drain(s);
}

function cleanup(s: GameState) {
  endOfTurnCleanup(s);
  const excess = s.zones.hand.length - HAND_SIZE;
  if (excess <= 0) return nextTurn(s);
  chooseCards(s, `手札が多い。${excess} 枚捨てる`, [...s.zones.hand], excess, excess, (st, ids) => {
    for (const id of ids) moveTo(st, id, 'graveyard');
    nextTurn(st);
  });
}

/** クリンナップの続き。相手ありなら相手が1人ずつ1ターン進んでから、あなたの次のターン */
function nextTurn(s: GameState) {
  if (s.rivals) rivalRound(s);
  enqueue(s, '次のターン', startTurn);
}

