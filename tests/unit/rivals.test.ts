import { describe, expect, it } from 'vitest';
import { cloneState } from '../../src/engine/actions';
import { assignBlocks, resolveFight, type Fighter } from '../../src/engine/rivals/combat';
import { KINDS, MAX_CREATURES, STYLES, STYLE_ORDER } from '../../src/engine/rivals/kinds';
import { commanderLeft, planRivalTurn, simulateBoard } from '../../src/engine/rivals/plan';
import { newGame } from '../../src/engine/turn';
import { Game } from './helpers';

const fighter = (id: string, over: Partial<Fighter> = {}): Fighter => ({
  id, power: 1, hit: 1, face: 1, toughness: 1, flying: false, reach: false, deathtouch: false, menace: false, trample: false,
  value: 0, commander: false, ...over,
});
const goblin = (over: Partial<Fighter> = {}) => fighter('goblin', over);
const rival = (kind: string, id = kind): Fighter => {
  const k = KINDS[kind];
  const has = (kw: string) => k.keywords.includes(kw);
  return fighter(id, {
    power: k.power, hit: k.power, face: k.power, toughness: k.toughness, flying: has('Flying'), reach: has('Reach'),
    deathtouch: has('Deathtouch'), trample: has('Trample'), value: k.value, commander: k.commander === true,
  });
};
const never = () => false;

describe('相手のブロック（assignBlocks）', () => {
  it.each([
    ['1/1 は熊に止められる', [goblin()], [rival('bear')], true, { goblin: 'bear' }],
    ['トーブランがいると熊は相討ちになるので、価値0のトークンは止めない', [goblin({ hit: 3, face: 3 })], [rival('bear')], true, {}],
    ['飛行は熊では止めない', [goblin({ flying: true })], [rival('bear')], true, {}],
    ['飛行は到達で止める', [goblin({ flying: true })], [rival('spider')], true, { goblin: 'spider' }],
    ['飛行は飛行で止める', [goblin({ flying: true })], [rival('drake')], true, { goblin: 'drake' }],
    ['威迫は止めない', [goblin({ menace: true })], [rival('wall')], true, {}],
    ['壁は倒せなくても生き残るなら止める', [goblin()], [rival('wall')], true, { goblin: 'wall' }],
    ['接死の攻撃には「生き残る」が成り立たない', [goblin({ deathtouch: true })], [rival('wall'), rival('beast')], true, {}],
    ['相討ちは攻撃側の価値がブロッカー以上のとき', [fighter('elf', { power: 3, hit: 3, face: 3, toughness: 2, value: 8 })], [rival('knight')], true, { elf: 'knight' }],
    ['アグロは相討ちしない', [fighter('elf', { power: 3, hit: 3, face: 3, toughness: 2, value: 8 })], [rival('knight')], false, {}],
    ['同じブロッカーを2度使わない', [goblin(), fighter('goblin2')], [rival('bear')], true, { goblin: 'bear' }],
  ])('%s', (_label, attackers, blockers, trades, expected) => {
    expect(assignBlocks(attackers, blockers, never, trades)).toEqual(expected);
  });

  it('価値の大きい攻撃から見て、倒せて生き残る中で価値の小さいブロッカーを選ぶ', () => {
    const blocks = assignBlocks([goblin(), fighter('ingris', { power: 1, hit: 1, toughness: 4, flying: true, value: 18 })], [rival('beast'), rival('spider')], never, true);
    // イングリス（1/4 飛行）は蜘蛛（2/4 到達）が止める（生き残るだけ）。ゴブリンは獣が止める
    expect(blocks).toEqual({ ingris: 'spider', goblin: 'beast' });
  });

  it('致死ならチャンプブロックする（点の大きい攻撃から、価値の小さいブロッカーで）', () => {
    const lethal = (unblocked: Fighter[]) => unblocked.reduce((n, f) => n + f.face, 0) >= 3;
    // 鳥はゴブリンとも騎士とも相討ちになるので普通は止めない。2体通すと3点で致死なので、騎士をチャンプブロックする
    const blocks = assignBlocks([goblin(), fighter('knight', { power: 2, hit: 2, face: 2, toughness: 1 })], [rival('bird'), rival('bird', 'bird2')], lethal, true);
    expect(blocks).toEqual({ knight: 'bird' });
  });

  it('入力が同じなら結果も同じ', () => {
    const run = () => assignBlocks([goblin(), fighter('a', { value: 3 })], [rival('bear'), rival('wall')], never, true);
    expect(run()).toEqual(run());
  });
});

describe('ブロックされた戦闘の割り当て（resolveFight）', () => {
  it('トランプルは基本のパワーで致死量を割り当てる（増幅は受け手ごとにあとで足す）', () => {
    // 巡り合わせたる火の力 X=3：2/1 トランプルが壁 0/4 に止められても、本体へは0点
    expect(resolveFight(goblin({ power: 2, hit: 5, trample: true }), rival('wall'))).toEqual({ toBlocker: 2, toPlayer: 0, toAttacker: 0 });
    // 稲妻の憤怒獣 5/1 トランプルが熊 2/2 に止められた：熊に2、本体に3
    expect(resolveFight(goblin({ power: 5, hit: 7, trample: true }), rival('bear'))).toEqual({ toBlocker: 2, toPlayer: 3, toAttacker: 2 });
  });

  it('接死は1点で致死。トランプルでなければ全点をブロッカーへ', () => {
    expect(resolveFight(goblin({ power: 3, deathtouch: true, trample: true }), rival('beast'))).toEqual({ toBlocker: 1, toPlayer: 2, toAttacker: 4 });
    expect(resolveFight(goblin({ power: 3 }), rival('beast'))).toEqual({ toBlocker: 3, toPlayer: 0, toAttacker: 4 });
  });

  it('ブロッカーが除去されていたら、トランプルなら全点が本体へ、そうでなければ0', () => {
    expect(resolveFight(goblin({ power: 5, trample: true }), null)).toEqual({ toBlocker: 0, toPlayer: 5, toAttacker: 0 });
    expect(resolveFight(goblin({ power: 5 }), null)).toEqual({ toBlocker: 0, toPlayer: 0, toAttacker: 0 });
  });
});

describe('相手の盤面の育ち方', () => {
  // 相手が終えたターン数ごとの体数の目安（設計の表。統率者と消耗を含む）
  const TARGET: Record<string, Record<number, number>> = {
    aggro: { 3: 3.6, 5: 5.0 },
    midrange: { 3: 1.4, 5: 3.8 },
    control: { 3: 0.5, 5: 2.2 },
    tokens: { 3: 1.9, 5: 6.1 },
  };

  it.each(STYLE_ORDER)('%s：3・5ターン目の平均体数が目安の ±30% に入り、8体を超えない', (style) => {
    for (const t of [3, 5]) {
      const boards = Array.from({ length: 1000 }, (_, i) => simulateBoard(style, t, i + 1).board);
      const mean = boards.reduce((n, b) => n + b.length, 0) / boards.length;
      expect(mean).toBeGreaterThan(TARGET[style][t] * 0.7);
      expect(mean).toBeLessThan(TARGET[style][t] * 1.3);
    }
    const late = Array.from({ length: 300 }, (_, i) => simulateBoard(style, 12, i + 1).board);
    expect(Math.max(...late.map((b) => b.length))).toBeLessThanOrEqual(MAX_CREATURES);
  });

  it('盤面が8体以上なら（編集で増やしても）それ以上出さない', () => {
    const board = Array.from({ length: 9 }, () => ({ kind: 'bear' }));
    const r = Array.from({ length: 32 }, () => 0.99);
    expect(planRivalTurn({ style: 'tokens', t: 6, board, cmdReady: 4 }, r).deploy).toEqual([]);
  });

  it('統率者は離れるたびに出し直しが1ターンずつ遅れる（離れていなければ変わらない）', () => {
    expect(commanderLeft({ cmdReady: 4, cmdCasts: 0 }, 5, 0)).toEqual({ cmdReady: 4, cmdCasts: 0 });
    const first = commanderLeft({ cmdReady: 4, cmdCasts: 0 }, 5, 1);
    expect(first).toEqual({ cmdReady: 7, cmdCasts: 1 });
    expect(commanderLeft(first, 7, 1)).toEqual({ cmdReady: 10, cmdCasts: 2 });
  });

  it('アグロ以外は1ターン目に何も出さない', () => {
    for (const style of STYLE_ORDER.filter((st) => st !== 'aggro')) {
      expect(Array.from({ length: 200 }, (_, i) => simulateBoard(style, 1, i + 1).board.length).every((n) => n === 0)).toBe(true);
    }
  });

  it('展開が始まるターンに、出せる種類が必ずある（重みが全部0にならない）', () => {
    for (const style of STYLE_ORDER) {
      const st = STYLES[style];
      const first = st.deploy.findIndex((e) => e > 0) + 1;
      const cheapest = Math.min(...Object.keys(st.kinds).map((k) => KINDS[k].mv));
      expect(cheapest).toBeLessThanOrEqual(first);
    }
  });
});

describe('相手ありモードの乱数', () => {
  const play = (g: Game, turns: number) => {
    for (let i = 0; i < turns; i++) {
      g.do({ type: 'endTurn' });
      if (g.s.prompt) g.answer(...g.s.zones.hand.slice(0, g.s.zones.hand.length - 7));
    }
    return g;
  };

  it('相手あり／なしで初手とライブラリーの順は同じ', () => {
    const solo = newGame(42, 'ingris', null);
    const rivals = newGame(42, 'ingris', { seat: null });
    expect(rivals.zones.hand).toEqual(solo.zones.hand);
    expect(rivals.zones.library).toEqual(solo.zones.library);
    expect(solo.rivals).toBeNull();
    expect(rivals.rivals!.styles).toHaveLength(3);
  });

  it('同じシードで同じ操作をすれば、相手の盤面も同じ', () => {
    const a = play(new Game(7, { seat: 2 }).start(), 5);
    const b = play(new Game(7, { seat: 2 }).start(), 5);
    expect(JSON.stringify(a.s.opponents)).toBe(JSON.stringify(b.s.opponents));
    expect(a.s.rivals).toEqual(b.s.rivals);
  });

  it('自分の回し方を変えても、相手の乱数の流れはずれない', () => {
    const a = new Game(9, { seat: 1 }).start();
    play(a, 4);
    const b = new Game(9, { seat: 1 }).start().put('Swamp', 'battlefield');
    play(b, 3);
    // b だけ相手1のクリーチャーを1体倒しておく
    const target = b.s.opponents[0].board[0] ?? null;
    if (target) b.do({ type: 'rivalRemove', opp: 0, id: target.id, trigger: true });
    play(b, 1);
    expect(b.s.rivals!.rng).toBe(a.s.rivals!.rng);
    expect(b.s.opponents[1].board).toEqual(a.s.opponents[1].board);
    expect(b.s.opponents[2].board).toEqual(a.s.opponents[2].board);
  });

  it('脱落した相手のぶんも乱数を引く', () => {
    const a = play(new Game(3, { seat: 1 }).start(), 2);
    const b = new Game(3, { seat: 1 }).start().do({ type: 'oppLife', opp: 1, delta: -40 });
    play(b, 2);
    expect(b.s.rivals!.rng).toBe(a.s.rivals!.rng);
    expect(b.s.opponents[1].board).toEqual([]);
  });

  it('席：前の席の相手はキープのあと先に1ターン進む', () => {
    expect(new Game(1, { seat: 1 }).start().s.rivals!.turns).toEqual([0, 0, 0]);
    expect(new Game(1, { seat: 2 }).start().s.rivals!.turns).toEqual([0, 0, 1]);
    expect(new Game(1, { seat: 4 }).start().s.rivals!.turns).toEqual([1, 1, 1]);
    const g = play(new Game(1, { seat: 3 }).start(), 1);
    expect(g.s.rivals!.turns).toEqual([1, 2, 2]);
    expect(g.s.active).toBeNull();
  });

  it('複製した状態の相手の盤面・ブロック・相手の状態は、元と独立している', () => {
    const g = new Game(1, { seat: 1 }).start();
    g.rival(0, 'bear');
    const copy = cloneState(g.s);
    copy.opponents[0].board[0].tapped = true;
    copy.opponents[0].board.pop();
    copy.blocks.x = 'y';
    copy.rivals!.turns[0] = 9;
    copy.rivals!.recap[0] = 'x';
    copy.rivals!.cmdReady[0] = 99;
    copy.rivals!.cmdCasts[0] = 99;
    copy.rivals!.styles[0] = 'aggro';
    expect(g.s.opponents[0].board).toHaveLength(1);
    expect(g.s.opponents[0].board[0].tapped).toBe(false);
    expect(g.s.blocks).toEqual({});
    expect(g.s.rivals!.turns[0]).toBe(0);
    expect(g.s.rivals!.recap[0]).toBe('');
    expect(g.s.rivals!.cmdReady[0]).not.toBe(99);
    expect(g.s.rivals!.cmdCasts[0]).toBe(0);
    expect(g.s.rivals!.styles[0]).toBe(new Game(1, { seat: 1 }).s.rivals!.styles[0]);
    // クリーチャー化した土地の能力（威迫）も複製する
    const vents = g.put('Restless Vents', 'battlefield').id('Restless Vents');
    g.s.cards[vents].animated = { power: 2, toughness: 3, keywords: ['Menace'] };
    const copy2 = cloneState(g.s);
    copy2.cards[vents].animated!.keywords.push('Flying');
    expect(g.s.cards[vents].animated!.keywords).toEqual(['Menace']);
    // 1ターン進めても、元の状態は変わらない（相手のターンは複製した状態の上で動く）
    const before = JSON.stringify(g.s);
    const prev = g.s;
    play(g, 1);
    expect(JSON.stringify(prev)).toBe(before);
  });
});

describe('相手ありモードの戦闘', () => {
  /** トークンの召喚酔いを解いてから、攻撃できる全員で攻撃する */
  const attack = (g: Game, opp = 0) => {
    for (const c of g.field.filter((x) => x.token)) c.sick = false;
    return g.do({ type: 'toCombat' }, { type: 'planAll', opp }, { type: 'attack' });
  };

  it('トーブランの増幅込みの点で判断する：壁は3点なら生き残るので止め、火の力も足して4点なら止めない', () => {
    const g = new Game(1, { seat: 1 }).start().put('Torbran, Thane of Red Fell', 'battlefield');
    g.do({ type: 'token', name: 'Goblin', count: 1 });
    const wall = g.rival(0, 'wall');
    attack(g);
    expect(g.s.phase).toBe('attacking');
    expect(Object.values(g.s.blocks)).toEqual([wall]);
    g.do({ type: 'damage' });
    expect(g.s.opponents[0].board[0].damage).toBe(3);
    expect(g.oppLife).toEqual([40, 40, 40]);
    // ダメージはクリンナップで消える
    g.do({ type: 'endCombat' }, { type: 'endTurn' });
    expect(g.s.opponents[0].board.find((p) => p.id === wall)!.damage).toBe(0);

    const h = new Game(1, { seat: 1 }).start().put('Torbran, Thane of Red Fell', 'battlefield').put('Fated Firepower', 'battlefield');
    h.s.cards[h.id('Fated Firepower')].counters.fire = 1;
    h.do({ type: 'token', name: 'Goblin', count: 1 });
    h.rival(0, 'wall');
    attack(h);
    expect(h.s.blocks).toEqual({});
    h.do({ type: 'damage' });
    expect(h.oppLife).toEqual([36, 40, 40]);
  });

  it('トーブランと稲妻の憤怒獣：チャンプブロックした熊に4点、本体に5点（増幅は受け手ごとに1回）', () => {
    const g = new Game(1, { seat: 1 }).start().put('Torbran, Thane of Red Fell', 'battlefield').do({ type: 'oppLife', opp: 0, delta: -33 });
    g.do({ type: 'token', name: 'Lightning Rager', count: 1 });
    const rager = g.tokens('Lightning Rager')[0].id;
    const bear = g.rival(0, 'bear');
    attack(g);
    expect(g.s.blocks).toEqual({ [rager]: bear });
    g.do({ type: 'damage' });
    expect(g.oppLife[0]).toBe(2);
    expect(g.s.opponents[0].board).toEqual([]);
    expect(g.s.log.some((l) => l.includes('相手1の熊 に 4点'))).toBe(true);
    // 熊の2点で憤怒獣（タフネス1）も死ぬ
    expect(g.tokens('Lightning Rager')).toHaveLength(0);
  });

  it('致死ならチャンプブロックする（ライフでも、統率者ダメージ21でも）', () => {
    const g = new Game(1, { seat: 1 }).start().do({ type: 'oppLife', opp: 0, delta: -39 });
    g.do({ type: 'token', name: 'Goblin', count: 2 });
    g.rival(0, 'bird');
    attack(g);
    expect(Object.keys(g.s.blocks)).toHaveLength(1);

    // 鳥（1/1 飛行）はイングリス（1/4）を倒せず死ぬだけなので普通は止めない。統率者ダメージ20なら1点で21になるので止める
    const ingrisAttack = (cmdDamage: number) => {
      const h = new Game(1, { seat: 1 }).start().put('Ingris Stingerquill', 'battlefield').do({ type: 'cmdDamage', opp: 0, delta: cmdDamage });
      h.s.cards[h.id('Ingris Stingerquill')].sick = false;
      const bird = h.rival(0, 'bird');
      h.do({ type: 'toCombat' }, { type: 'plan', id: h.id('Ingris Stingerquill'), opp: 0 }, { type: 'attack' });
      return { h, bird };
    };
    expect(ingrisAttack(0).h.s.blocks).toEqual({});
    const { h, bird } = ingrisAttack(20);
    expect(h.s.blocks).toEqual({ [h.id('Ingris Stingerquill')]: bird });
  });
});
