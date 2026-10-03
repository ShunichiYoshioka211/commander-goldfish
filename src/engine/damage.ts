// ダメージ。増幅（Torbran 等）・絆魂・スピード・脱落判定をここに集める。
import { scriptOf } from '../cards/registry';
import { aliveOpponents, battlefield, chooseOpponent, hasKeyword, isCommander, log, nameJa, onField, typeOf } from './core';
import { KINDS } from './rivals/kinds';
import type { CardInstance, GameState } from './types';

/** ダメージの受け手。増幅の多くは「対戦相手か、対戦相手のパーマネント」に乗る */
export type DamageTo = 'player' | 'permanent';

const bonus = (s: GameState, source: CardInstance, combat: boolean, to: DamageTo) =>
  battlefield(s).reduce((n, card) => n + (scriptOf(card).damageBonus?.(s, card, source, combat, to) ?? 0), 0);

/** 増幅込みの点。0点のダメージには増幅が乗らない */
export const boosted = (s: GameState, source: CardInstance, base: number, combat: boolean, to: DamageTo) =>
  Math.sign(base) * (base + bonus(s, source, combat, to));

/** 絆魂（エレボスの鞭で全クリーチャーが持つ）。プレイヤーへのダメージにも、クリーチャーへのダメージにも乗る */
function lifelink(s: GameState, source: CardInstance, amount: number) {
  if (typeOf(source, 'Creature') && (hasKeyword(source, 'Lifelink') || onField(s, 'Whip of Erebos').length > 0)) {
    s.life += amount;
  }
}

export function damageOpponent(s: GameState, source: CardInstance, opp: number, base: number, combat: boolean) {
  const o = s.opponents[opp];
  if (o.deadTurn !== null || base <= 0) return;
  const amount = base + bonus(s, source, combat, 'player');
  o.life -= amount;
  s.damage.push({ turn: s.turn, target: opp, source: nameJa(source), amount, combat });
  log(s, `${nameJa(source)} → 対戦相手${opp + 1} に ${amount}点${combat ? '（戦闘）' : ''}`);
  if (combat && isCommander(s, source)) o.commanderDamage += amount;
  lifelink(s, source, amount);
  if (s.speed > 0 && s.speed < 4 && s.speedUpTurn !== s.turn) {
    s.speed++;
    s.speedUpTurn = s.turn;
    log(s, `スピードが ${s.speed} に上がった`);
  }
  if (!combat) {
    s.flags.noncombatToOpps += amount;
    for (const card of battlefield(s)) {
      scriptOf(card).onNoncombatDamage?.(s, card);
      scriptOf(card).onNoncombatDamageBy?.(s, card, source);
    }
  }
  updateDeath(s, opp);
}

/** 相手のクリーチャーへのダメージ。死亡はあとでまとめて判定する（rivals/index.ts の sweepRivals） */
export function damageRival(s: GameState, source: CardInstance, opp: number, id: string, base: number, combat: boolean) {
  if (base <= 0) return;
  const p = s.opponents[opp].board.find((x) => x.id === id)!;
  const k = KINDS[p.kind];
  const amount = base + bonus(s, source, combat, 'permanent');
  // 接死はダメージを致死量として記録する
  p.damage += Math.max(amount, k.toughness * Number(hasKeyword(source, 'Deathtouch')));
  log(s, `${nameJa(source)} → 相手${opp + 1}の${k.name} に ${amount}点`);
  lifelink(s, source, amount);
}

/** ライフ 0 以下か統率者ダメージ 21 以上で脱落。編集でライフを戻したら復帰する */
export function updateDeath(s: GameState, opp: number) {
  const o = s.opponents[opp];
  const dead = o.life <= 0 || o.commanderDamage >= 21;
  if (dead === (o.deadTurn !== null)) return;
  o.deadTurn = dead ? s.turn : null;
  log(s, `対戦相手${opp + 1} が${dead ? '脱落' : '復帰'}`);
  // 脱落した相手の盤面はゲームから除く（死亡ではないので何も誘発しない）
  if (dead) o.board = [];
  if (aliveOpponents(s).length === 0) {
    s.phase = 'over';
    s.finishedAt = Date.now();
    log(s, `${s.turn}ターン目に全員を倒した`);
  }
}

export function damageEach(s: GameState, source: CardInstance, n: number) {
  for (const i of aliveOpponents(s)) damageOpponent(s, source, i, n, false);
}

export function damageAny(s: GameState, source: CardInstance, n: number) {
  chooseOpponent(s, `${nameJa(source)} の ${n}点をどの対戦相手に？`, (st, opp) => damageOpponent(st, source, opp, n, false));
}
