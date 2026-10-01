import { expect, test, type App } from './fixtures';

const tokenIds = async (app: App, name: string) =>
  Object.entries((await app.state()).cards)
    .filter(([, c]) => c.token && c.name === name)
    .map(([id]) => id);

async function attackWith(app: App, ids: string[], opp = 0) {
  await app.dispatch({ type: 'toCombat' });
  for (const id of ids) await app.dispatch({ type: 'plan', id, opp });
  await app.dispatch({ type: 'attack' });
}

test('Ingris：攻撃クリーチャーごとに1点、{4} で実習生と速攻', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Mountain', 'Mountain');
  const ingris = await app.put('Ingris Stingerquill', 'battlefield');
  await app.act(ingris, /実習生/);
  const [cadet] = await tokenIds(app, 'Cadet');
  await attackWith(app, [ingris, cadet], 1);
  expect(await app.oppLife()).toEqual([38, 38, 38]);
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  expect(s.opponents[1]).toMatchObject({ life: 35, commanderDamage: 1 });
});

test('Far Fortune：スピード・攻撃時1点・最大スピードで+1', async ({ app }) => {
  await app.start();
  const ff = await app.put('Far Fortune, End Boss', 'battlefield', true);
  expect((await app.state()).speed).toBe(1);
  // スピードが既にあるなら変えない
  await app.dispatch({ type: 'speed', delta: 1 }, { type: 'move', id: ff, to: 'hand', trigger: false });
  await app.put('Far Fortune, End Boss', 'battlefield', true);
  expect((await app.state()).speed).toBe(2);

  await app.dispatch({ type: 'token', name: 'Pirate', count: 1 });
  const [pirate] = await tokenIds(app, 'Pirate');
  await attackWith(app, [pirate]);
  // 攻撃時1点（各対戦相手）→ スピード 3
  expect(await app.oppLife()).toEqual([39, 39, 39]);
  expect((await app.state()).speed).toBe(3);
  // 同じターンには2回上がらない
  await app.dispatch({ type: 'damage' });
  expect((await app.state()).speed).toBe(3);
  await app.dispatch({ type: 'speed', delta: 1 }, { type: 'token', name: 'Pirate', count: 1 });
  expect((await app.state()).speed).toBe(4);
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  // Impact Tremors 1点 + 最大スピード 1点
  expect(await app.oppLife()).toEqual([36, 37, 37]);
});

test('Torbran・Mechanized Warfare は色と種類を見る', async ({ app }) => {
  await app.start();
  await app.put('Torbran, Thane of Red Fell', 'battlefield');
  await app.put('Mechanized Warfare', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Thopter', count: 1 }, { type: 'token', name: 'Rat', count: 1 }, { type: 'token', name: 'Goblin', count: 1 });
  const [thopter] = await tokenIds(app, 'Thopter');
  const [rat] = await tokenIds(app, 'Rat');
  const [goblin] = await tokenIds(app, 'Goblin');
  await app.endTurn();
  await attackWith(app, [thopter, rat, goblin], 2);
  await app.dispatch({ type: 'damage' });
  // 飛行機械 1+1(機械化) / ネズミ 1 / ゴブリン 1+2+1
  expect((await app.state()).opponents[2].life).toBe(40 - 2 - 1 - 4);
});

test('Fated Firepower の X を選んで唱える', async ({ app }) => {
  await app.start();
  await app.lands('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain');
  const ff = await app.put('Fated Firepower', 'hand');
  await app.act(ff, /唱える/);
  await app.choose('X=2');
  const s = await app.state();
  expect(s.cards[ff].counters.fire).toBe(2);
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  expect(await app.oppLife()).toEqual([37, 37, 37]);
});

test('部屋：突刺回廊のデビルと拷問部屋の増幅', async ({ app }) => {
  await app.start();
  await app.lands('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain');
  const room = await app.put('Spiked Corridor // Torture Pit', 'hand');
  await app.card(room).click();
  await app.page.getByRole('dialog').getByRole('button', { name: /唱える：突刺回廊/ }).click();
  expect(await tokenIds(app, 'Devil')).toHaveLength(3);
  // もう一方の扉
  await app.act(room, /もう一方の扉/);
  expect((await app.state()).cards[room].counters).toEqual({});
  // デビルが死ぬ → 拷問部屋で 1+2 点を選んだ相手に
  const [devil] = await tokenIds(app, 'Devil');
  await app.dispatch({ type: 'move', id: devil, to: 'graveyard', trigger: true });
  await app.choose(/対戦相手2/);
  expect(await app.oppLife()).toEqual([40, 37, 40]);

  // 拷問部屋から開ける → あとで突刺回廊を開けるとデビル
  await app.dispatch({ type: 'move', id: room, to: 'hand', trigger: false });
  await app.endTurn();
  await app.card(room).click();
  await app.page.getByRole('dialog').getByRole('button', { name: /唱える：拷問部屋/ }).click();
  const before = (await tokenIds(app, 'Devil')).length;
  await app.endTurn();
  await app.act(room, /もう一方の扉/);
  expect(await tokenIds(app, 'Devil')).toHaveLength(before + 3);
  // 戦闘ダメージには増幅しない
  const [d2] = await tokenIds(app, 'Devil');
  await app.endTurn();
  await attackWith(app, [d2], 0);
  await app.dispatch({ type: 'damage' });
  expect((await app.state()).opponents[0].life).toBe(39);
});

test('展開時のバーン：Impact Tremors・Gatekeeper・Roastmaster・Slash・Kreat', async ({ app }) => {
  await app.start();
  for (const n of ['Impact Tremors', 'Molten Gatekeeper', 'Witty Roastmaster', 'Slash, Reptile Rampager', 'General Kreat, the Boltbringer']) {
    await app.put(n, 'battlefield');
  }
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  // 1 + 1 + 1 + 2 + 1
  expect(await app.oppLife()).toEqual([34, 34, 34]);
});

test('Slash の攻撃でミュータント、Kreat はゴブリンの攻撃で増える', async ({ app }) => {
  await app.start();
  const slash = await app.put('Slash, Reptile Rampager', 'battlefield');
  await app.put('General Kreat, the Boltbringer', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 }, { type: 'token', name: 'Rat', count: 1 }, { type: 'endTurn' });
  const [rat] = await tokenIds(app, 'Rat');
  // ゴブリン以外だけで攻撃 → 何も出ない
  await attackWith(app, [rat]);
  expect(await tokenIds(app, 'Mutant')).toHaveLength(0);
  await app.dispatch({ type: 'damage' });
  await app.endTurn();
  const [goblin] = await tokenIds(app, 'Goblin');
  await attackWith(app, [slash, goblin], 1);
  const s = await app.state();
  expect(await tokenIds(app, 'Mutant')).toHaveLength(1);
  const newGoblin = Object.values(s.cards).filter((c) => c.token && c.name === 'Goblin' && c.attacking === 1);
  expect(newGoblin).toHaveLength(2);
});

test('Court of Embereth：統治者ならクリーチャーの数だけ', async ({ app }) => {
  await app.start();
  await app.put('Court of Embereth', 'battlefield', true);
  expect((await app.state()).monarch).toBe(true);
  const hand = (await app.state()).zones.hand.length;
  await app.endTurn();
  // 統治者で1枚引いて8枚 → 1枚捨てる → ドローで1枚。騎士1体 → 1点
  let s = await app.state();
  expect(s.zones.hand.length).toBe(hand + 1);
  expect(await app.oppLife()).toEqual([39, 39, 39]);
  // 統治者でなければ騎士だけ
  await app.dispatch({ type: 'monarch' });
  await app.endTurn();
  s = await app.state();
  expect(await tokenIds(app, 'Knight')).toHaveLength(2);
  expect(await app.oppLife()).toEqual([39, 39, 39]);
});

test('Garna：攻撃中に死ねばドロー、それ以外は1点', async ({ app }) => {
  await app.start();
  await app.put('Garna, Bloodfist of Keld', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 2 }, { type: 'endTurn' });
  const [g1, g2] = await tokenIds(app, 'Goblin');
  await attackWith(app, [g1]);
  const hand = (await app.state()).zones.hand.length;
  await app.dispatch({ type: 'move', id: g1, to: 'graveyard', trigger: true });
  expect((await app.state()).zones.hand.length).toBe(hand + 1);
  await app.dispatch({ type: 'move', id: g2, to: 'graveyard', trigger: true });
  expect(await app.oppLife()).toEqual([39, 39, 39]);
});

test('Wildfire Elemental と Chandra’s Incinerator の軽減', async ({ app }) => {
  await app.start();
  const wild = await app.put('Wildfire Elemental', 'battlefield');
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  // 3人に1点ずつ → +3/+0
  await expect(app.card(wild).locator('.pt')).toHaveText('6/3');
  await app.lands('Mountain', 'Mountain', 'Mountain');
  const inc = await app.put("Chandra's Incinerator", 'hand');
  await app.act(inc, /唱える/);
  expect((await app.state()).cards[inc].zone).toBe('battlefield');
});

test('Molten Gatekeeper の蘇生は終了時に追放', async ({ app }) => {
  await app.start();
  await app.lands('Mountain');
  const gk = await app.put('Molten Gatekeeper', 'graveyard');
  await app.page.getByTestId('pile-graveyard').click();
  await app.act(gk, /蘇生/);
  let s = await app.state();
  expect(s.cards[gk].zone).toBe('battlefield');
  await app.endTurn();
  s = await app.state();
  expect(s.cards[gk].zone).toBe('exile');
});

test('全員倒したら残りの誘発は解決しない', async ({ app }) => {
  await app.start();
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -39 }, { type: 'oppLife', opp: 1, delta: -39 }, { type: 'oppLife', opp: 2, delta: -39 });
  await app.dispatch({ type: 'token', name: 'Goblin', count: 3 });
  const s = await app.state();
  expect(s.phase).toBe('over');
  expect(s.opponents.map((o) => o.life)).toEqual([0, 0, 0]);
});
