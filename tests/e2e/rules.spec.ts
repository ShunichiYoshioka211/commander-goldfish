// コツのファクトチェックで見つけた、ルールどおりの処理
import { expect, test, type App } from './fixtures';

const tokenIds = async (app: App, name: string) =>
  Object.entries((await app.state()).cards)
    .filter(([, c]) => c.token && c.name === name)
    .map(([id]) => id);

test('戦闘ダメージのあと、戦闘終了の前に攻撃中のクリーチャーを生け贄にするとガルナで引ける', async ({ app, page }) => {
  await app.start();
  await app.lands('Swamp');
  await app.put('Garna, Bloodfist of Keld', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  const rites = await app.put('Village Rites', 'hand');
  await app.endTurn();
  const [goblin] = await tokenIds(app, 'Goblin');
  await app.dispatch({ type: 'toCombat' }, { type: 'plan', id: goblin, opp: 0 }, { type: 'attack' }, { type: 'damage' });
  expect((await app.state()).opponents[0].life).toBe(39);
  await expect(page.getByTestId('turn')).toContainText('ダメージ後');
  const hand = (await app.state()).zones.hand.length;
  await app.act(rites, /唱える/);
  await app.choose('ゴブリン');
  // 村の儀式で2枚＋攻撃中に死んだのでガルナで1枚
  expect((await app.state()).zones.hand.length).toBe(hand - 1 + 3);
  expect(await app.oppLife()).toEqual([39, 40, 40]);
});

test('エレジーの見習いと顔壊しのプロは、戦闘ダメージを受けた対戦相手1人ごとに誘発する', async ({ app }) => {
  await app.start();
  await app.put('Elegy Acolyte', 'battlefield');
  await app.put('Professional Face-Breaker', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 3 });
  await app.endTurn();
  const goblins = await tokenIds(app, 'Goblin');
  const hand = (await app.state()).zones.hand.length;
  await app.dispatch(
    { type: 'toCombat' },
    { type: 'plan', id: goblins[0], opp: 0 },
    { type: 'plan', id: goblins[1], opp: 0 },
    { type: 'plan', id: goblins[2], opp: 2 },
    { type: 'attack' },
    { type: 'damage' },
  );
  const s = await app.state();
  // 2人に通した → 2枚引いて2点失う、宝物2つ（エレジーの絆魂は攻撃していないので無し）
  expect(s.zones.hand.length).toBe(hand + 2);
  expect(s.life).toBe(38);
  expect(await tokenIds(app, 'Treasure')).toHaveLength(2);
});

test('フランシスコは海賊の戦闘ダメージでないダメージでも、プレイヤー1人ごとに探検する', async ({ app }) => {
  await app.start();
  await app.put('Ingris Stingerquill', 'battlefield');
  const fr = await app.put('Francisco, Fowl Marauder', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Pirate', count: 1 });
  // ライブラリーの山を4枚、一番上に並べる（探検はすべて土地を手札に）
  const lib = await app.state();
  for (const id of lib.zones.library.filter((x) => lib.cards[x].name === 'Mountain').slice(0, 4)) {
    await app.dispatch({ type: 'move', id, to: 'library', trigger: false });
  }
  const [pirate] = await tokenIds(app, 'Pirate');
  const hand = (await app.state()).zones.hand.length;
  await app.dispatch({ type: 'toCombat' }, { type: 'plan', id: pirate, opp: 1 }, { type: 'attack' });
  // イングリスの攻撃時1点（海賊が3人に与える）→ 3回
  expect((await app.state()).zones.hand.length).toBe(hand + 3);
  await app.dispatch({ type: 'damage' });
  // 戦闘ダメージ（1人に）→ もう1回
  const s = await app.state();
  expect(s.zones.hand.length).toBe(hand + 4);
  expect(s.cards[fr].counters).toEqual({});
});

test('フライヤのマナは自動支払いに使わず、手動でだけ出せる', async ({ app, page }) => {
  await app.start();
  const freya = await app.put('Freya Crescent', 'battlefield');
  await app.endTurn();
  const chick = await app.put('Phoenix Chick', 'hand');
  await app.card(chick).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /唱える/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await app.act(freya, /マナ：\{R\}（装備品/);
  expect((await app.state()).pool.R).toBe(1);
});

test('ワープしたターンはエレジーの見習いの虚空でロボットが出る', async ({ app }) => {
  await app.start();
  await app.put('Elegy Acolyte', 'battlefield');
  await app.lands('Mountain');
  const weft = await app.put('Weftstalker Ardent', 'hand');
  await app.act(weft, /唱える：ワープ/);
  await app.endTurn();
  expect(await tokenIds(app, 'Robot')).toHaveLength(1);
  expect((await app.state()).cards[weft].zone).toBe('exile');
});
