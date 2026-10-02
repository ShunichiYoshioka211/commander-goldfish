// ゲームの開始・マリガン・ターンの進行・戦闘。
import { scriptOf } from '../cards/registry';
import {
  battlefield, blankInstance, canAttack, chooseCards, drain, draw, enqueue, log,
  moveTo, nameJa, power, shuffleLibrary,
} from './core';
import { damageOpponent } from './damage';
import { deckById } from './deck';
import { emptyPool } from './mana';
import type { CardInstance, GameState } from './types';

export const STARTING_LIFE = 40;
export const OPPONENTS = 3;
const HAND_SIZE = 7;

const freshFlags = () => ({ attacked: false, creaturesDied: 0, nonlandLeft: false, noncombatToOpps: 0, morbidUsed: false, loyaltyUsed: [] });

export function newGame(seed: number, deckId: string): GameState {
  const deck = deckById(deckId);
  const s: GameState = {
    deckId: deck.id, commanders: [...deck.commanders], seed, rng: seed, cards: {},
    zones: { library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] },
    nextToken: 0, turn: 0, phase: 'mulligan', life: STARTING_LIFE,
    opponents: Array.from({ length: OPPONENTS }, () => ({ life: STARTING_LIFE, commanderDamage: 0, deadTurn: null })),
    pool: emptyPool(), landPlayed: false, commanderCasts: {}, monarch: false, speed: 0, speedUpTurn: 0,
    mulligans: 0, plan: {}, queue: [], fresh: [], prompt: null, flags: freshFlags(), log: [], damage: [],
    startedAt: Date.now(), finishedAt: null,
  };
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
  if (bottom === 0) return startTurn(s);
  chooseCards(s, `ライブラリーの下に置く ${bottom} 枚`, [...s.zones.hand], bottom, bottom, (st, ids) => {
    for (const id of ids) moveTo(st, id, 'library', { bottom: true });
    startTurn(st);
  });
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
  drain(s);
}

export function combatDamage(s: GameState) {
  const hits: { attacker: CardInstance; opp: number }[] = [];
  for (const a of battlefield(s).filter((c) => c.attacking !== null)) {
    const before = s.opponents[a.attacking!].life;
    damageOpponent(s, a, a.attacking!, power(a), true);
    if (s.opponents[a.attacking!].life < before) hits.push({ attacker: a, opp: a.attacking! });
  }
  if (hits.length > 0) eachPermanent(s, (c) => scriptOf(c).onCombatDamage?.(s, c, hits));
  enqueue(s, '戦闘終了', (st) => {
    eachPermanent(st, (c) => void (c.attacking = null));
    st.phase = 'main2';
    st.pool = emptyPool();
  });
  drain(s);
}

export function endTurn(s: GameState) {
  s.pool = emptyPool();
  eachPermanent(s, (c) => void (c.attacking = null));
  s.plan = {};
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
  eachPermanent(s, (c) => Object.assign(c, { tempPower: 0, haste: false, animated: null }));
  const excess = s.zones.hand.length - HAND_SIZE;
  if (excess <= 0) return startTurn(s);
  chooseCards(s, `手札が多い。${excess} 枚捨てる`, [...s.zones.hand], excess, excess, (st, ids) => {
    for (const id of ids) moveTo(st, id, 'graveyard');
    startTurn(st);
  });
}

