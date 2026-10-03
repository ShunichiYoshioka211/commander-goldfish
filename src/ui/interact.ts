// カードのドラッグ・タップを操作（Action）に変換する。
import { canAttack, isLand } from '../engine/core';
import { canPlayLand, castModes, lacksTarget } from '../engine/play';
import type { CardInstance } from '../engine/types';
import { useStore } from '../store';
import type { DropInfo } from './useDrag';

const ZONES = ['battlefield', 'hand', 'graveyard', 'exile', 'command', 'library'] as const;
const RISE_TO_PLAY = 80;

export function toast(message: string) {
  useStore.getState().set({ toast: message });
}

/** 手札などからプレイする。唱え方が複数あるときはカード詳細を開いて選ばせる */
export function play(card: CardInstance) {
  const { game, dispatch, set } = useStore.getState();
  if (isLand(card)) {
    if (canPlayLand(game, card)) dispatch({ type: 'playLand', id: card.id });
    else toast('いまは土地をプレイできない');
    return;
  }
  const modes = castModes(game, card);
  if (modes.length === 0) toast(lacksTarget(game, card) ? '対象にできるものがいない' : 'いまは唱えられない（マナかタイミング）');
  else if (modes.length === 1) dispatch({ type: 'cast', id: card.id, mode: modes[0].index });
  else set({ selected: card.id });
}

export function handleDrop(card: CardInstance, info: DropInfo) {
  const { game, editMode, editTriggers, dispatch } = useStore.getState();
  const target = info.target;
  if (editMode && ZONES.includes(target as (typeof ZONES)[number])) {
    if (target !== card.zone) dispatch({ type: 'move', id: card.id, to: target as (typeof ZONES)[number], trigger: editTriggers });
    return;
  }
  if (card.zone !== 'battlefield' && (target === 'battlefield' || info.rise > RISE_TO_PLAY)) {
    play(card);
    return;
  }
  if (card.zone === 'battlefield' && game.phase === 'combat' && target?.startsWith('opp')) {
    if (canAttack(card)) dispatch({ type: 'plan', id: card.id, opp: Number(target.slice(3)) });
    else toast('このクリーチャーは攻撃できない');
  }
}
