// UI から来る操作をすべてここで受ける。状態は操作ごとに複製してから書き換える（Undo のため）。
// 誘発キューのクロージャは古い状態のオブジェクトを読むことはあっても書き換えないこと。
import { aliveOpponents, createToken, creatures, destroyAll, drain, log, moveTo, nameJa, shuffleLibrary } from './core';
import { updateDeath } from './damage';
import { tapForMana } from './mana';
import { activate, cast, playLand } from './play';
import { declareBlocks, destroyRival, editAddRival, editRemoveRival, rebuildRival } from './rivals';
import { rivalCreatures } from './rivals/board';
import { combatDamage, declareAttack, endCombat, endTurn, keep, mulligan, planAll, planAttack, toCombat } from './turn';
import type { GameState, ManaColor, ZoneId } from './types';

export type MoveTarget = ZoneId | 'libraryBottom' | 'libraryShuffle';

export type Action =
  | { type: 'mulligan' }
  | { type: 'keep' }
  | { type: 'playLand'; id: string }
  | { type: 'cast'; id: string; mode: number }
  | { type: 'activate'; id: string; index: number }
  | { type: 'tapMana'; id: string; option: number }
  | { type: 'answer'; values: (string | number)[] }
  | { type: 'toCombat' }
  | { type: 'plan'; id: string; opp: number | null }
  | { type: 'planAll'; opp: number }
  | { type: 'attack' }
  | { type: 'damage' }
  | { type: 'endCombat' }
  | { type: 'endTurn' }
  /** 相手ありモード：ブロックの前の窓を閉じて、相手のブロックへ進む */
  | { type: 'toBlocks' }
  // ---- 編集モード ----
  | { type: 'move'; id: string; to: MoveTarget; trigger: boolean }
  | { type: 'tap'; id: string }
  | { type: 'counter'; id: string; kind: string; delta: number }
  | { type: 'token'; name: string; count: number }
  | { type: 'life'; delta: number }
  | { type: 'oppLife'; opp: number; delta: number }
  | { type: 'cmdDamage'; opp: number; delta: number }
  | { type: 'speed'; delta: number }
  | { type: 'monarch' }
  | { type: 'pool'; color: ManaColor; delta: number }
  | { type: 'shuffle' }
  | { type: 'wipe' }
  // ---- 編集モード（相手あり） ----
  | { type: 'rivalAdd'; opp: number; kind: string }
  | { type: 'rivalRemove'; opp: number; id: string; trigger: boolean }
  | { type: 'rivalTap'; opp: number; id: string }
  /** opp=null で生きている相手の全員 */
  | { type: 'rivalRebuild'; opp: number | null }
  /** ブロックを外す（近似で扱えないものの逃げ道） */
  | { type: 'unblock'; id: string };

export function cloneState(s: GameState): GameState {
  const cards: GameState['cards'] = {};
  for (const [id, c] of Object.entries(s.cards)) {
    cards[id] = {
      ...c,
      counters: { ...c.counters },
      doors: [...c.doors],
      animated: c.animated && { ...c.animated, keywords: [...c.animated.keywords] },
    };
  }
  return {
    ...s,
    cards,
    zones: {
      library: [...s.zones.library], hand: [...s.zones.hand], battlefield: [...s.zones.battlefield],
      graveyard: [...s.zones.graveyard], exile: [...s.zones.exile], command: [...s.zones.command],
    },
    opponents: s.opponents.map((o) => ({ ...o, board: o.board.map((p) => ({ ...p })) })),
    pool: { ...s.pool },
    commanders: [...s.commanders],
    commanderCasts: { ...s.commanderCasts },
    plan: { ...s.plan },
    queue: [...s.queue],
    fresh: [...s.fresh],
    flags: { ...s.flags, loyaltyUsed: [...s.flags.loyaltyUsed] },
    log: [...s.log],
    damage: [...s.damage],
    rivals: s.rivals && {
      ...s.rivals,
      styles: [...s.rivals.styles],
      turns: [...s.rivals.turns],
      cmdReady: [...s.rivals.cmdReady],
      cmdCasts: [...s.rivals.cmdCasts],
      recap: [...s.rivals.recap],
    },
    blocks: { ...s.blocks },
  };
}

const MOVE_LABEL: Record<MoveTarget, string> = {
  library: 'ライブラリーの上',
  libraryBottom: 'ライブラリーの下',
  libraryShuffle: 'ライブラリー（シャッフル）',
  hand: '手札',
  battlefield: '戦場',
  graveyard: '墓地',
  exile: '追放',
  command: '統率領域',
};

export function apply(prev: GameState, action: Action): GameState {
  // 選択を待っている間は答え以外を受け付けない
  if (prev.prompt && action.type !== 'answer') return prev;
  const s = cloneState(prev);
  switch (action.type) {
    case 'mulligan': mulligan(s); break;
    case 'keep': keep(s); break;
    case 'playLand': playLand(s, action.id); break;
    case 'cast': cast(s, action.id, action.mode); break;
    case 'activate': activate(s, action.id, action.index); break;
    case 'tapMana': tapForMana(s, action.id, action.option); break;
    case 'answer': {
      const prompt = s.prompt!;
      s.prompt = null;
      prompt.resolve(s, action.values);
      drain(s);
      break;
    }
    case 'toCombat': toCombat(s); break;
    case 'plan': planAttack(s, action.id, action.opp); break;
    case 'planAll': planAll(s, action.opp); break;
    case 'attack': declareAttack(s); break;
    case 'damage': combatDamage(s); break;
    case 'endCombat': endCombat(s); break;
    case 'endTurn': endTurn(s); break;
    case 'toBlocks':
      declareBlocks(s);
      drain(s);
      break;
    case 'move': {
      log(s, `［編集］${nameJa(s.cards[action.id])} を${MOVE_LABEL[action.to]}へ`);
      const zone = action.to === 'libraryBottom' || action.to === 'libraryShuffle' ? 'library' : action.to;
      moveTo(s, action.id, zone, { trigger: action.trigger, bottom: action.to === 'libraryBottom' });
      if (action.to === 'libraryShuffle') shuffleLibrary(s);
      drain(s);
      break;
    }
    case 'tap': s.cards[action.id].tapped = !s.cards[action.id].tapped; break;
    case 'counter': {
      const c = s.cards[action.id];
      c.counters[action.kind] = Math.max(0, (c.counters[action.kind] ?? 0) + action.delta);
      break;
    }
    case 'token':
      createToken(s, action.name, action.count);
      drain(s);
      break;
    case 'life': s.life += action.delta; break;
    case 'oppLife':
      s.opponents[action.opp].life += action.delta;
      updateDeath(s, action.opp);
      break;
    case 'cmdDamage':
      s.opponents[action.opp].commanderDamage = Math.max(0, s.opponents[action.opp].commanderDamage + action.delta);
      updateDeath(s, action.opp);
      break;
    case 'speed': s.speed = Math.min(4, Math.max(0, s.speed + action.delta)); break;
    case 'monarch': s.monarch = !s.monarch; break;
    case 'pool': s.pool[action.color] = Math.max(0, s.pool[action.color] + action.delta); break;
    case 'shuffle': shuffleLibrary(s); break;
    case 'wipe':
      log(s, '［編集］全クリーチャーを破壊');
      for (const { opp, p } of rivalCreatures(s)) destroyRival(s, opp, p.id);
      destroyAll(s, creatures(s).map((c) => c.id));
      drain(s);
      break;
    case 'rivalAdd': editAddRival(s, action.opp, action.kind); break;
    case 'rivalRemove':
      editRemoveRival(s, action.opp, action.id, action.trigger);
      drain(s);
      break;
    case 'rivalTap': {
      const p = s.opponents[action.opp].board.find((x) => x.id === action.id)!;
      p.tapped = !p.tapped;
      break;
    }
    case 'rivalRebuild':
      for (const opp of action.opp === null ? aliveOpponents(s) : [action.opp]) rebuildRival(s, opp);
      break;
    case 'unblock':
      log(s, `［編集］${nameJa(s.cards[action.id])} のブロックを外した`);
      delete s.blocks[action.id];
      break;
  }
  return s;
}
