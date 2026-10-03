import { apply, type Action } from '../../src/engine/actions';
import { newGame, type RivalsOption } from '../../src/engine/turn';
import type { GameState, ZoneId } from '../../src/engine/types';

export class Game {
  s: GameState;
  /** rivals を渡すと相手ありモード（{ seat: 1 } なら1番手で、1ターン目の相手の盤面は空） */
  constructor(seed = 1, rivals: RivalsOption | null = null) {
    this.s = newGame(seed, 'ingris', rivals);
  }
  do(...actions: Action[]) {
    for (const a of actions) this.s = apply(this.s, a);
    return this;
  }
  /** 名前でカードを探す（同名が複数あれば、まだ指定領域に無いものを優先） */
  id(name: string, notIn?: ZoneId) {
    const all = Object.values(this.s.cards).filter((c) => c.name === name);
    return (all.find((c) => c.zone !== notIn) ?? all[0]).id;
  }
  put(name: string, zone: ZoneId, trigger = false) {
    return this.do({ type: 'move', id: this.id(name, zone), to: zone, trigger });
  }
  start() {
    return this.do({ type: 'keep' });
  }
  answer(...values: (string | number)[]) {
    return this.do({ type: 'answer', values });
  }
  get field() {
    return this.s.zones.battlefield.map((id) => this.s.cards[id]);
  }
  tokens(name: string) {
    return this.field.filter((c) => c.token && c.name === name);
  }
  /** 相手の盤面に種類を指定して出す */
  rival(opp: number, kind: string) {
    this.do({ type: 'rivalAdd', opp, kind });
    return this.s.opponents[opp].board.at(-1)!.id;
  }
  get oppLife() {
    return this.s.opponents.map((o) => o.life);
  }
}
