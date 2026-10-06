// 対戦相手のターン。相手なしモードでも、ドロー（ライブラリー切れで敗北）・最初のメイン・フェイズのRADカウンター・
// 終了ステップの誘発だけは起こす。相手ありモードでは、この間に盤面が育つ（rivals/index.ts の rivalStep）。
import { scriptOf } from '../cards/registry';
import { battlefield, endOfTurnCleanup, enqueue, freshFlags } from './core';
import { updateDeath } from './damage';
import { radOpponent } from './mill';
import type { GameState } from './types';

/** 相手のターンの始め：ドロー（ライブラリーが無ければ敗北。CR 704.5b）と、最初のメイン・フェイズのRADカウンター */
export function opponentTurnStart(s: GameState, opp: number) {
  const o = s.opponents[opp];
  if (o.deadTurn !== null) return;
  s.active = opp;
  // 相手のターンは別のターン。このターンに死亡した数や、1ターンに1回の誘発を戻す
  s.flags = freshFlags();
  o.decked = o.library === 0;
  o.library = Math.max(0, o.library - 1);
  updateDeath(s, opp);
  radOpponent(s, opp);
}

/** 相手のターンの終わり：各終了ステップの誘発（血の長の昇天）とクリンナップ */
export function opponentTurnEnd(s: GameState, opp: number) {
  if (s.opponents[opp].deadTurn !== null) return;
  for (const card of battlefield(s)) scriptOf(card).onEachEndStep?.(s, card);
  endOfTurnCleanup(s);
}

/**
 * 相手1人のターンを積む。body は相手ありモードの盤面の動き（相手なしでは無し）。
 * 3つに分けて積むので、始めの切削で誘発したもの（賢きモスマンなど）は、盤面の動きと終了ステップより先に解決する
 */
export function enqueueOpponentTurn(s: GameState, opp: number, body: ((st: GameState) => void)[]) {
  enqueue(s, `相手${opp + 1}のターン`, (st) => opponentTurnStart(st, opp), false);
  for (const run of body) enqueue(s, `相手${opp + 1}のターン（盤面）`, run, false);
  enqueue(s, `相手${opp + 1}のターンの終わり`, (st) => opponentTurnEnd(st, opp), false);
}
