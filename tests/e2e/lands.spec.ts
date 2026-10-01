import { expect, test } from './fixtures';

test('タップインの条件（フェッチ・チェック・公開・スレッショルド・タンゴ）', async ({ app }) => {
  await app.start();
  const tapped = async (name: string) => (await app.state()).cards[await app.id(name)].tapped;
  const play = async (name: string) => {
    const id = await app.put(name, 'hand');
    await app.dispatch({ type: 'playLand', id });
    return id;
  };

  // 他の土地が2つ以下ならアンタップ
  await play('Blackcleave Cliffs');
  expect(await tapped('Blackcleave Cliffs')).toBe(false);
  // 沼も山も無い（Blackcleave だけ）→ タップイン
  await app.endTurn();
  await play('Dragonskull Summit');
  expect(await tapped('Dragonskull Summit')).toBe(true);

  await app.endTurn();
  await app.lands('Swamp');
  await play('Smoldering Marsh');
  expect(await tapped('Smoldering Marsh')).toBe(true);

  // 他の土地が3つ以上 → Blackcleave はタップイン
  await app.dispatch({ type: 'move', id: await app.id('Blackcleave Cliffs'), to: 'hand', trigger: false });
  await app.endTurn();
  await play('Blackcleave Cliffs');
  expect(await tapped('Blackcleave Cliffs')).toBe(true);
});

test('チェックランドと公開ランド', async ({ app }) => {
  await app.start();
  // 山だけ（沼は無い）→ アンタップ
  await app.lands('Mountain');
  let id = await app.put('Dragonskull Summit', 'hand');
  await app.dispatch({ type: 'playLand', id });
  expect((await app.state()).cards[id].tapped).toBe(false);

  // 手札に沼 → 公開してアンタップ
  await app.endTurn();
  await app.put('Swamp', 'hand');
  id = await app.put('Foreboding Ruins', 'hand');
  await app.dispatch({ type: 'playLand', id });
  expect((await app.state()).cards[id].tapped).toBe(false);

  // 手札に山だけ → アンタップ
  await app.endTurn();
  const s = await app.state();
  for (const h of s.zones.hand) if (s.cards[h].name === 'Swamp') await app.dispatch({ type: 'move', id: h, to: 'library', trigger: false });
  await app.dispatch({ type: 'move', id, to: 'hand', trigger: false });
  await app.put('Mountain', 'hand');
  await app.dispatch({ type: 'playLand', id });
  expect((await app.state()).cards[id].tapped).toBe(false);

  // 手札に沼も山も無い → タップイン
  await app.endTurn();
  const s2 = await app.state();
  for (const h of s2.zones.hand) {
    if (['Swamp', 'Mountain'].includes(s2.cards[h].name)) await app.dispatch({ type: 'move', id: h, to: 'library', trigger: false });
  }
  await app.dispatch({ type: 'move', id, to: 'hand', trigger: false }, { type: 'playLand', id });
  expect((await app.state()).cards[id].tapped).toBe(true);
});

test('Razortrap Gorge と Smoldering Marsh', async ({ app }) => {
  await app.start();
  const gorge = await app.put('Razortrap Gorge', 'hand');
  await app.dispatch({ type: 'playLand', id: gorge });
  expect((await app.state()).cards[gorge].tapped).toBe(true);
  // 自分のライフが13以下
  await app.dispatch({ type: 'life', delta: -27 }, { type: 'move', id: gorge, to: 'hand', trigger: false }, { type: 'endTurn' }, { type: 'playLand', id: gorge });
  expect((await app.state()).cards[gorge].tapped).toBe(false);
  // 対戦相手のライフが13以下（1人は脱落済み）
  await app.dispatch(
    { type: 'life', delta: 27 },
    { type: 'oppLife', opp: 0, delta: -40 },
    { type: 'oppLife', opp: 1, delta: -27 },
    { type: 'move', id: gorge, to: 'hand', trigger: false },
    { type: 'endTurn' },
    { type: 'playLand', id: gorge },
  );
  expect((await app.state()).cards[gorge].tapped).toBe(false);

  await app.lands('Swamp', 'Mountain');
  const marsh = await app.put('Smoldering Marsh', 'hand');
  await app.dispatch({ type: 'endTurn' }, { type: 'playLand', id: marsh });
  expect((await app.state()).cards[marsh].tapped).toBe(false);
});

test('Temple of Malice の占術とミシュラランド', async ({ app }) => {
  await app.start();
  const temple = await app.put('Temple of Malice', 'hand');
  const top = (await app.state()).zones.library[0];
  await app.card(temple).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'プレイ' }).click();
  await app.choose('下に置く');
  let s = await app.state();
  expect(s.cards[temple].tapped).toBe(true);
  expect(s.zones.library.at(-1)).toBe(top);

  await app.dispatch({ type: 'endTurn' }, { type: 'move', id: temple, to: 'hand', trigger: false }, { type: 'playLand', id: temple });
  const top2 = (await app.state()).zones.library[0];
  await app.choose('上に残す');
  expect((await app.state()).zones.library[0]).toBe(top2);

  // Lavaclaw / Restless Vents をクリーチャー化
  await app.lands('Swamp', 'Swamp', 'Mountain', 'Mountain', 'Swamp', 'Mountain');
  const lava = await app.put('Lavaclaw Reaches', 'battlefield');
  const vents = await app.put('Restless Vents', 'battlefield');
  await app.act(lava, /2\/2 クリーチャーになる/);
  await app.act(vents, /2\/3 威迫クリーチャーになる/);
  s = await app.state();
  expect(s.cards[lava]).toMatchObject({ zone: 'battlefield' });
  await expect(app.card(lava).locator('.pt')).toHaveText('2/2');
  await expect(app.card(vents).locator('.pt')).toHaveText('2/3');
  // ターンが終わると元に戻る
  await app.endTurn();
  await expect(app.card(lava).locator('.pt')).toHaveCount(0);
});

test('条件付きのマナ能力（Dark Fortress・Tainted Peak・Graven Cairns）', async ({ app }) => {
  await app.start();
  const fortress = await app.put('Dark Fortress', 'battlefield');
  // このターンに出た → B/R も出せる
  await app.act(fortress, 'マナ：{R}');
  expect((await app.state()).pool.R).toBe(1);
  // 次のターン、基本土地なし → C だけ
  await app.endTurn();
  await app.card(fortress).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /^マナ/ })).toHaveCount(1);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  // 基本土地あり → B/R
  await app.lands('Mountain');
  await app.card(fortress).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /^マナ/ })).toHaveCount(3);
  await app.page.getByRole('button', { name: '閉じる' }).click();

  const peak = await app.put('Tainted Peak', 'battlefield');
  await app.card(peak).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /^マナ/ })).toHaveCount(1);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  await app.lands('Swamp');
  await app.act(peak, 'マナ：{B}');

  // Graven Cairns：プール B を使う
  const cairns = await app.put('Graven Cairns', 'battlefield');
  await app.act(cairns, /{R}{R}/);
  let s = await app.state();
  expect(s.pool).toMatchObject({ B: 0, R: 2 });
  // プール R を使う
  await app.dispatch({ type: 'tap', id: cairns });
  await app.act(cairns, /{B}{B}/);
  s = await app.state();
  expect(s.pool).toMatchObject({ B: 2, R: 1 });
  // プールが空なら払えない
  await app.endTurn();
  await app.act(cairns, /{B}{R}/);
  s = await app.state();
  expect(s.cards[cairns].tapped).toBe(false);
  await app.act(cairns, 'マナ：{C}');
  expect((await app.state()).pool.C).toBe(1);
});

test('Fabled Passage と宝物', async ({ app }) => {
  await app.start();
  const passage = await app.put('Fabled Passage', 'battlefield');
  await app.act(passage, '基本土地を探す');
  await app.choose('沼');
  let s = await app.state();
  const fetched = s.zones.battlefield.find((id) => s.cards[id].name === 'Swamp')!;
  expect(s.cards[fetched].tapped).toBe(true);

  // 土地4つ以上ならアンタップ（沼・山・山＋探してきた山）
  await app.lands('Mountain', 'Mountain');
  await app.put('Fabled Passage', 'battlefield');
  await app.act(passage, '基本土地を探す');
  await app.choose('山');
  s = await app.state();
  const untapped = s.zones.battlefield.filter((id) => s.cards[id].name === 'Mountain' && !s.cards[id].tapped);
  expect(untapped).toHaveLength(3);

  // ライブラリーに基本土地が無いと起動できない
  for (const id of s.zones.library) {
    if (['Swamp', 'Mountain'].includes(s.cards[id].name)) await app.dispatch({ type: 'move', id, to: 'exile', trigger: false });
  }
  await app.put('Fabled Passage', 'battlefield');
  await app.card(passage).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: '基本土地を探す' })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();

  await app.dispatch({ type: 'token', name: 'Treasure', count: 1 });
  const treasure = Object.entries((await app.state()).cards).find(([, c]) => c.name === 'Treasure')![0];
  await app.act(treasure, /生け贄に捧げて \{R\}/);
  s = await app.state();
  expect(s.pool.R).toBe(1);
  expect(s.cards[treasure]).toBeUndefined();
});
