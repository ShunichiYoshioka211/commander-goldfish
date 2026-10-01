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

test('アップキープのトークン：Goblin Assault・Rite・Ophiomancer', async ({ app }) => {
  await app.start();
  await app.put('Goblin Assault', 'battlefield');
  await app.put('Rite of the Raging Storm', 'battlefield');
  await app.put('Ophiomancer', 'battlefield');
  await app.endTurn();
  expect(await tokenIds(app, 'Goblin')).toHaveLength(1);
  expect(await tokenIds(app, 'Lightning Rager')).toHaveLength(1);
  expect(await tokenIds(app, 'Snake')).toHaveLength(1);
  // 蛇がいれば増えない。稲妻の憤怒獣は終了時に生け贄
  await app.endTurn();
  expect(await tokenIds(app, 'Snake')).toHaveLength(1);
  expect(await tokenIds(app, 'Lightning Rager')).toHaveLength(1);
});

test('戦闘開始時のトークン：Warboss・Siege-Gang・Dronesmith・Lagomos・Skitter・Piracy・Forge', async ({ app }) => {
  await app.start();
  for (const n of ['Legion Warboss', 'Siege-Gang Lieutenant', 'Harried Dronesmith', 'Lagomos, Hand of Hatred', 'Lord Skitter, Sewer King', 'Daring Piracy', "Urabrask's Forge"]) {
    await app.put(n, 'battlefield');
  }
  await app.dispatch({ type: 'toCombat' });
  // 統率者がいないので Siege-Gang は出さない
  expect(await tokenIds(app, 'Goblin')).toHaveLength(1);
  for (const t of ['Thopter', 'Elemental 2/1', 'Rat', 'Pirate', 'Phyrexian Horror']) expect(await tokenIds(app, t)).toHaveLength(1);
  const [horror] = await tokenIds(app, 'Phyrexian Horror');
  await expect(app.card(horror).locator('.pt')).toHaveText('1/1');
  await app.dispatch({ type: 'attack' }, { type: 'damage' });
  await app.endTurn();
  // 一時トークンは消える（海賊は追放）
  for (const t of ['Thopter', 'Elemental 2/1', 'Pirate', 'Phyrexian Horror']) expect(await tokenIds(app, t)).toHaveLength(0);
  await app.put('Ingris Stingerquill', 'battlefield');
  await app.dispatch({ type: 'toCombat' });
  expect(await tokenIds(app, 'Goblin')).toHaveLength(4);
  const [h2] = await tokenIds(app, 'Phyrexian Horror');
  await expect(app.card(h2).locator('.pt')).toHaveText('2/1');
});

test('Warboss の教導', async ({ app }) => {
  await app.start();
  const warboss = await app.put('Legion Warboss', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Knight', count: 1 }, { type: 'token', name: 'Goblin', count: 1 });
  await app.endTurn();
  const [knight] = await tokenIds(app, 'Knight');
  // 教導の対象がいない（騎士は3/1）
  await attackWith(app, [warboss, knight]);
  expect((await app.state()).cards[knight].counters).toEqual({});
  await app.dispatch({ type: 'damage' });
  await app.endTurn();
  const goblins = await tokenIds(app, 'Goblin');
  await attackWith(app, [warboss, goblins[0]]);
  expect((await app.state()).cards[goblins[0]].counters['+1/+1']).toBe(1);
  await app.dispatch({ type: 'damage' });
  await app.endTurn();
  // Warboss が攻撃しない
  await attackWith(app, [goblins[0]]);
  expect((await app.state()).cards[goblins[0]].counters['+1/+1']).toBe(1);
});

test('Siege-Gang：ゴブリンを生け贄に1点', async ({ app }) => {
  await app.start();
  await app.lands('Mountain', 'Mountain');
  const sg = await app.put('Siege-Gang Lieutenant', 'battlefield');
  await app.card(sg).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /ゴブリンを生け贄/ })).toHaveCount(1);
  await app.page.getByRole('dialog').getByRole('button', { name: /ゴブリンを生け贄/ }).click();
  await app.choose('包囲攻撃の副官');
  await app.choose(/対戦相手3/);
  expect(await app.oppLife()).toEqual([40, 40, 39]);
  // ゴブリンがいないと起動できない
  await app.card(await app.id('Mountain')).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /ゴブリンを生け贄/ })).toHaveCount(0);
});

test('Lagomos のサーチは5体死んだ後だけ', async ({ app }) => {
  await app.start();
  const lag = await app.put('Lagomos, Hand of Hatred', 'battlefield');
  await app.card(lag).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /ライブラリーから/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  // 出たばかりのターンはタップできない（5体死んでいても）
  await app.dispatch({ type: 'token', name: 'Rat', count: 5 });
  for (const r of await tokenIds(app, 'Rat')) await app.dispatch({ type: 'move', id: r, to: 'graveyard', trigger: true });
  await app.card(lag).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /ライブラリーから/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  await app.endTurn();
  await app.dispatch({ type: 'token', name: 'Rat', count: 5 });
  for (const r of await tokenIds(app, 'Rat')) await app.dispatch({ type: 'move', id: r, to: 'graveyard', trigger: true });
  const lag2 = lag;
  await app.act(lag2, /ライブラリーから/);
  const s = await app.state();
  const target = s.zones.library.find((id) => s.cards[id].name === 'Torbran, Thane of Red Fell')!;
  await app.dispatch({ type: 'answer', values: [target] });
  expect((await app.state()).cards[target].zone).toBe('hand');
});

test('終了ステップ：Searslicer・Stensia・Elegy の虚空', async ({ app }) => {
  await app.start();
  await app.put('Searslicer Goblin', 'battlefield');
  await app.put('Elegy Acolyte', 'battlefield');
  await app.put('Stensia Uprising', 'battlefield');
  // 攻撃していない・何も戦場を離れていない
  await app.endTurn();
  expect(await tokenIds(app, 'Goblin')).toHaveLength(0);
  expect(await tokenIds(app, 'Robot')).toHaveLength(0);
  expect(await tokenIds(app, 'Human')).toHaveLength(1);
  // 攻撃して、トークンが1つ消える
  const [human] = await tokenIds(app, 'Human');
  await attackWith(app, [human]);
  await app.dispatch({ type: 'damage' }, { type: 'move', id: human, to: 'exile', trigger: true });
  await app.endTurn();
  expect(await tokenIds(app, 'Goblin')).toHaveLength(1);
  expect(await tokenIds(app, 'Robot')).toHaveLength(1);
});

test('Stensia Uprising：ちょうど13個なら7点', async ({ app }) => {
  await app.start();
  const st = await app.put('Stensia Uprising', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Treasure', count: 11 });
  // 12個 + 人間 = 13
  await app.dispatch({ type: 'endTurn' });
  await app.choose('いいえ');
  expect((await app.state()).cards[st].zone).toBe('battlefield');
  await app.dispatch({ type: 'move', id: (await tokenIds(app, 'Human'))[0], to: 'exile', trigger: false });
  await app.dispatch({ type: 'endTurn' });
  await app.choose('はい');
  await app.choose(/対戦相手1/);
  expect(await app.oppLife()).toEqual([33, 40, 40]);
});

test('Chandra：0能力は1ターンに1回', async ({ app }) => {
  await app.start();
  const ch = await app.put('Chandra, Acolyte of Flame', 'battlefield', true);
  await expect(app.card(ch).locator('.counters')).toHaveText('loyalty:4');
  await app.act(ch, /エレメンタル2体/);
  expect(await tokenIds(app, 'Elemental')).toHaveLength(2);
  await app.card(ch).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /エレメンタル2体/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  // 戦闘中（ソーサリー・タイミング外）は起動できない
  await app.endTurn();
  expect(await tokenIds(app, 'Elemental')).toHaveLength(0);
  await app.dispatch({ type: 'toCombat' });
  await app.card(ch).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /エレメンタル2体/ })).toHaveCount(0);
});

test('戦闘ダメージ誘発：Elegy・Face-Breaker・Gix・Whip の絆魂', async ({ app }) => {
  await app.start();
  const elegy = await app.put('Elegy Acolyte', 'battlefield');
  await app.put('Professional Face-Breaker', 'battlefield');
  await app.put('Gix, Yawgmoth Praetor', 'battlefield');
  await app.put('Whip of Erebos', 'battlefield');
  await app.endTurn();
  const hand = (await app.state()).zones.hand.length;
  await attackWith(app, [elegy]);
  await app.dispatch({ type: 'damage' });
  await app.choose('1枚');
  const s = await app.state();
  // 4点（絆魂で+4）・エレジーで1点失う・ギックスで1点払う
  expect(s.life).toBe(40 + 4 - 1 - 1);
  expect(s.zones.hand.length).toBe(hand + 2);
  expect(await tokenIds(app, 'Treasure')).toHaveLength(1);
  await app.endTurn();
  await attackWith(app, [elegy]);
  await app.dispatch({ type: 'damage' });
  await app.choose('引かない');
});

test('Face-Breaker：宝物を生け贄に一番上を追放して唱える', async ({ app }) => {
  await app.start();
  const fb = await app.put('Professional Face-Breaker', 'battlefield');
  await app.card(fb).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /宝物を生け贄/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  await app.dispatch({ type: 'token', name: 'Treasure', count: 1 });
  const top = await app.put('Village Rites', 'library');
  await app.act(fb, /宝物を生け贄/);
  let s = await app.state();
  expect(s.cards[top]).toMatchObject({ zone: 'exile' });
  await app.lands('Swamp');
  await app.page.getByTestId('pile-exile').click();
  await app.act(top, /唱える/);
  await app.choose('顔壊しのプロ');
  s = await app.state();
  expect(s.cards[top].zone).toBe('graveyard');
});

test('Francisco の探検', async ({ app }) => {
  await app.start();
  const fr = await app.put('Francisco, Fowl Marauder', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Pirate', count: 3 });
  const pirates = await tokenIds(app, 'Pirate');
  // 一番上が土地 → 手札へ
  const land = await app.put('Mountain', 'library');
  await attackWith(app, [pirates[0], fr]);
  await app.dispatch({ type: 'damage' });
  expect((await app.state()).cards[land].zone).toBe('hand');
  await app.endTurn();
  // 一番上が土地以外 → +1/+1、墓地に置く
  const spell = await app.put('Village Rites', 'library');
  await attackWith(app, [pirates[1]]);
  await app.dispatch({ type: 'damage' });
  await app.choose('はい');
  let s = await app.state();
  expect(s.cards[spell].zone).toBe('graveyard');
  expect(s.cards[fr].counters['+1/+1']).toBe(1);
  await app.endTurn();
  const spell2 = await app.put('Altar\'s Reap', 'library');
  await attackWith(app, [pirates[2]]);
  await app.dispatch({ type: 'damage' });
  await app.choose('いいえ');
  s = await app.state();
  expect(s.cards[spell2].zone).toBe('library');
});

test('Phoenix Chick：3体以上の攻撃で {R}{R} を払って戻る', async ({ app }) => {
  await app.start();
  const chick = await app.put('Phoenix Chick', 'graveyard');
  await app.dispatch({ type: 'token', name: 'Pirate', count: 3 });
  const pirates = await tokenIds(app, 'Pirate');
  // 2体なら誘発しない
  await attackWith(app, pirates.slice(0, 2));
  expect((await app.state()).prompt).toBeNull();
  await app.dispatch({ type: 'damage' });
  await app.endTurn();
  // マナが無い → 払えない
  await attackWith(app, pirates);
  await app.choose('はい');
  expect((await app.state()).cards[chick].zone).toBe('graveyard');
  await app.dispatch({ type: 'damage' });
  await app.endTurn();
  // 断る
  await attackWith(app, pirates);
  await app.choose('いいえ');
  await app.dispatch({ type: 'damage' });
  await app.endTurn();
  await app.lands('Mountain', 'Mountain');
  await attackWith(app, pirates, 2);
  await app.choose('はい');
  const s = await app.state();
  expect(s.cards[chick]).toMatchObject({ zone: 'battlefield', attacking: 2, tapped: true });
  expect(s.cards[chick].counters['+1/+1']).toBe(1);
});

test('Whip of Erebos：墓地のクリーチャーを戻す', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp');
  const whip = await app.put('Whip of Erebos', 'battlefield');
  await app.card(whip).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /墓地のクリーチャー/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  const torbran = await app.put('Torbran, Thane of Red Fell', 'graveyard');
  await app.act(whip, /墓地のクリーチャー/);
  await app.choose('朱地洞の族長、トーブラン');
  expect((await app.state()).cards[torbran].zone).toBe('battlefield');
  await app.endTurn();
  expect((await app.state()).cards[torbran].zone).toBe('exile');
});

test('Morbid Opportunist は1ターンに1回', async ({ app }) => {
  await app.start();
  await app.put('Morbid Opportunist', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Rat', count: 2 });
  const hand = (await app.state()).zones.hand.length;
  const rats = await tokenIds(app, 'Rat');
  await app.dispatch({ type: 'move', id: rats[0], to: 'graveyard', trigger: true }, { type: 'move', id: rats[1], to: 'graveyard', trigger: true });
  expect((await app.state()).zones.hand.length).toBe(hand + 1);
});
