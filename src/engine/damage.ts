// 対戦相手へのダメージ。増幅（Torbran 等）・絆魂・スピード・脱落判定をここに集める。
import { scriptOf } from '../cards/registry';
import { aliveOpponents, battlefield, chooseOpponent, hasKeyword, isCommander, log, nameJa, onField, typeOf } from './core';
import type { CardInstance, GameState } from './types';

export function damageOpponent(s: GameState, source: CardInstance, opp: number, base: number, combat: boolean) {
  const o = s.opponents[opp];
  if (o.deadTurn !== null || base <= 0) return;
  let amount = base;
  for (const card of battlefield(s)) amount += scriptOf(card).damageBonus?.(s, card, source, combat) ?? 0;
  o.life -= amount;
  s.damage.push({ turn: s.turn, target: opp, source: nameJa(source), amount, combat });
  log(s, `${nameJa(source)} → 対戦相手${opp + 1} に ${amount}点${combat ? '（戦闘）' : ''}`);
  if (combat && isCommander(s, source)) o.commanderDamage += amount;
  if (typeOf(source, 'Creature') && (hasKeyword(source, 'Lifelink') || onField(s, 'Whip of Erebos').length > 0)) {
    s.life += amount;
  }
  if (s.speed > 0 && s.speed < 4 && s.speedUpTurn !== s.turn) {
    s.speed++;
    s.speedUpTurn = s.turn;
    log(s, `スピードが ${s.speed} に上がった`);
  }
  if (!combat) {
    s.flags.noncombatToOpps += amount;
    for (const card of battlefield(s)) scriptOf(card).onNoncombatDamage?.(s, card);
  }
  updateDeath(s, opp);
}

/** ライフ 0 以下か統率者ダメージ 21 以上で脱落。編集でライフを戻したら復帰する */
export function updateDeath(s: GameState, opp: number) {
  const o = s.opponents[opp];
  const dead = o.life <= 0 || o.commanderDamage >= 21;
  if (dead === (o.deadTurn !== null)) return;
  o.deadTurn = dead ? s.turn : null;
  log(s, `対戦相手${opp + 1} が${dead ? '脱落' : '復帰'}`);
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
