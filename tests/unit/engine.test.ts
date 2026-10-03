import { describe, expect, it } from 'vitest';
import { cloneState } from '../../src/engine/actions';
import { canPay, parseCost } from '../../src/engine/mana';
import { castModes } from '../../src/engine/play';
import { Game } from './helpers';

describe('ゲーム開始', () => {
  it('統率者は統率領域、手札7枚、残りはライブラリー', () => {
    const g = new Game();
    expect(g.s.zones.command.map((id) => g.s.cards[id].name)).toEqual(['Ingris Stingerquill']);
    expect(g.s.zones.hand).toHaveLength(7);
    expect(g.s.zones.library).toHaveLength(99 - 7);
    expect(g.s.phase).toBe('mulligan');
  });

  it('同じシードなら同じ初手', () => {
    expect(new Game(42).s.zones.hand).toEqual(new Game(42).s.zones.hand);
    expect(new Game(42).s.zones.hand).not.toEqual(new Game(43).s.zones.hand);
  });

  it('最初のマリガンは無料、2回目からは下に置く', () => {
    const g = new Game().do({ type: 'mulligan' }, { type: 'keep' });
    expect(g.s.phase).toBe('main1');
    const g2 = new Game().do({ type: 'mulligan' }, { type: 'mulligan' }, { type: 'keep' });
    expect(g2.s.prompt?.min).toBe(1);
    g2.answer(g2.s.zones.hand[0]);
    expect(g2.s.zones.hand).toHaveLength(6);
    expect(g2.s.turn).toBe(1);
  });

  it('1ターン目は引かず、2ターン目から引く', () => {
    const g = new Game().start();
    expect(g.s.zones.hand).toHaveLength(7);
    g.do({ type: 'endTurn' });
    expect(g.s.turn).toBe(2);
    expect(g.s.zones.hand).toHaveLength(8);
  });
});

describe('マナ', () => {
  it('二色土地の割り当てをやり直して払う（{B}{1} を沼/山の二色土地と山で）', () => {
    const g = new Game().start().put('Dragonskull Summit', 'battlefield').put('Mountain', 'battlefield');
    expect(canPay(g.s, parseCost('{1}{B}'))).toBe(true);
    expect(canPay(g.s, parseCost('{B}{B}'))).toBe(false);
  });

  it('統率者税が2ずつ増える', () => {
    const g = new Game().start();
    for (const name of ['Swamp', 'Swamp', 'Mountain', 'Mountain', 'Mountain']) g.put(name, 'battlefield');
    const ingris = g.id('Ingris Stingerquill');
    expect(castModes(g.s, g.s.cards[ingris])[0].cost.generic).toBe(0);
    g.do({ type: 'cast', id: ingris, mode: 0 });
    expect(g.s.cards[ingris].zone).toBe('battlefield');
    g.do({ type: 'move', id: ingris, to: 'graveyard', trigger: true });
    expect(g.s.cards[ingris].zone).toBe('command');
    expect(castModes(g.s, g.s.cards[ingris])).toHaveLength(0);
  });
});

describe('ダメージ', () => {
  it('Torbran と Fated Firepower(X=1) で赤いトークンの1点が4点になる', () => {
    const g = new Game().start().put('Torbran, Thane of Red Fell', 'battlefield').put('Impact Tremors', 'battlefield');
    g.put('Fated Firepower', 'battlefield');
    g.s.cards[g.id('Fated Firepower')].counters.fire = 1;
    g.do({ type: 'token', name: 'Goblin', count: 1 });
    // Impact Tremors は赤のエンチャント → 1 + 2(Torbran) + 1(Fated) = 4
    expect(g.oppLife).toEqual([36, 36, 36]);
  });

  it('Ingris は攻撃クリーチャーごとに各対戦相手へ1点', () => {
    const g = new Game().start().put('Ingris Stingerquill', 'battlefield');
    g.do({ type: 'token', name: 'Pirate', count: 2 }, { type: 'toCombat' }, { type: 'planAll', opp: 0 }, { type: 'attack' });
    // 海賊2体が攻撃（Ingris 自身は召喚酔い）→ 各 2点
    expect(g.oppLife).toEqual([38, 38, 38]);
    g.do({ type: 'damage' });
    expect(g.oppLife).toEqual([36, 38, 38]);
    // ダメージのあとも戦闘終了までは攻撃中
    expect(g.s.phase).toBe('afterDamage');
    expect(g.tokens('Pirate').every((c) => c.attacking === 0)).toBe(true);
    g.do({ type: 'endCombat' });
    expect(g.s.phase).toBe('main2');
    expect(g.tokens('Pirate').every((c) => c.attacking === null)).toBe(true);
  });

  it('統率者ダメージ21で脱落、全員倒すと終了', () => {
    const g = new Game().start();
    g.do({ type: 'cmdDamage', opp: 0, delta: 21 }, { type: 'oppLife', opp: 1, delta: -40 });
    expect(g.s.opponents[0].deadTurn).toBe(1);
    g.do({ type: 'oppLife', opp: 1, delta: 5 });
    expect(g.s.opponents[1].deadTurn).toBeNull();
    g.do({ type: 'oppLife', opp: 1, delta: -5 }, { type: 'oppLife', opp: 2, delta: -40 });
    expect(g.s.phase).toBe('over');
  });
});

describe('誘発と生け贄', () => {
  it('生け贄ドローは対象を選んでから払う', () => {
    const g = new Game().start().put('Swamp', 'battlefield').put('Mountain', 'battlefield').put('Village Rites', 'hand');
    g.put('Garna, Bloodfist of Keld', 'battlefield').do({ type: 'token', name: 'Goblin', count: 1 });
    const hand = g.s.zones.hand.length;
    g.do({ type: 'cast', id: g.id('Village Rites'), mode: 0 });
    g.answer(g.tokens('Goblin')[0].id);
    // Garna：攻撃していないので各対戦相手に1点、Village Rites で2枚
    expect(g.oppLife).toEqual([39, 39, 39]);
    expect(g.s.zones.hand).toHaveLength(hand - 1 + 2);
  });

  it('編集モードの移動は既定で誘発しない', () => {
    const g = new Game().start().put('Impact Tremors', 'battlefield').put('Legion Warboss', 'battlefield');
    expect(g.oppLife).toEqual([40, 40, 40]);
    g.put('Witty Roastmaster', 'battlefield', true);
    expect(g.oppLife).toEqual([39, 39, 39]);
  });

  it('スクリプトの無いカードは唱えると墓地に行くだけ', () => {
    const g = new Game().start().put('Swamp', 'battlefield').put('Swamp', 'battlefield').put('Infernal Grasp', 'hand');
    g.do({ type: 'cast', id: g.id('Infernal Grasp'), mode: 0 });
    expect(g.s.cards[g.id('Infernal Grasp')].zone).toBe('graveyard');
  });

  it('複製した状態は元の状態と独立している（Undo の前提）', () => {
    const g = new Game().start();
    const copy = cloneState(g.s);
    copy.cards[copy.zones.hand[0]].tapped = true;
    copy.zones.hand.pop();
    expect(g.s.cards[g.s.zones.hand[0]].tapped).toBe(false);
    expect(g.s.zones.hand).toHaveLength(7);
  });
});

describe('複数のデッキ', () => {
  it('デッキごとに統率者・枚数・固有色・コツが変わる', async () => {
    const { DECKS, deckById, tipOf } = await import('../../src/engine/deck');
    const { identity } = await import('../../src/engine/mana');
    const { newGame } = await import('../../src/engine/turn');
    expect(DECKS.map((d) => d.id)).toEqual(['ingris', 'test-goblins']);
    const s = newGame(1, 'test-goblins', null);
    expect(s.deckId).toBe('test-goblins');
    expect(s.zones.command.map((id) => s.cards[id].name)).toEqual(['General Kreat, the Boltbringer']);
    expect(s.zones.library).toHaveLength(34 - 7);
    expect(identity(s)).toEqual(['R']);
    expect(identity(newGame(1, 'ingris', null))).toEqual(['B', 'R']);
    expect(tipOf('test-goblins', 'Impact Tremors')).toBe('テスト用デッキでのコツ');
    expect(tipOf('ingris', 'Impact Tremors')).not.toBe('テスト用デッキでのコツ');
    expect(tipOf('ingris', 'Goblin')).toBe('');
    // 知らない ID は既定のデッキ
    expect(deckById('unknown').id).toBe('ingris');
    expect(newGame(1, 'unknown', null).deckId).toBe('ingris');
  });
});

describe('選択画面のカード', () => {
  it('カードを選ぶ選択肢はカードを持ち、占術はめくったカードを見せる', () => {
    const g = new Game().do({ type: 'mulligan' }, { type: 'mulligan' }, { type: 'keep' });
    expect(g.s.prompt!.options.map((o) => o.card)).toEqual(g.s.zones.hand);
    const h = new Game().start().put('Temple of Malice', 'hand');
    const top = h.s.zones.library[0];
    h.do({ type: 'playLand', id: h.id('Temple of Malice') });
    expect(h.s.prompt!.cards).toEqual([top]);
    expect(h.s.prompt!.options.every((o) => o.card === undefined)).toBe(true);
  });
});

