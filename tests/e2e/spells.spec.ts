import { expect, test, type App } from './fixtures';

const tokenIds = async (app: App, name: string) =>
  Object.entries((await app.state()).cards)
    .filter(([, c]) => c.token && c.name === name)
    .map(([id]) => id);

async function castFromHand(app: App, name: string) {
  const id = await app.put(name, 'hand');
  await app.act(id, /唱える/);
  return id;
}

test('生け贄ドロー：Altar’s Reap・Costly Plunder・Deadly Dispute・Fanatical Offering', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp');
  await app.dispatch({ type: 'token', name: 'Rat', count: 2 }, { type: 'token', name: 'Treasure', count: 1 });
  const hand = (await app.state()).zones.hand.length;
  await castFromHand(app, "Altar's Reap");
  await app.choose('ネズミ');
  await castFromHand(app, 'Costly Plunder');
  await app.choose('宝物');
  await castFromHand(app, 'Deadly Dispute');
  await app.choose('ネズミ');
  expect(await tokenIds(app, 'Treasure')).toHaveLength(1);
  await castFromHand(app, 'Fanatical Offering');
  await app.choose('宝物');
  expect(await tokenIds(app, 'Map')).toHaveLength(1);
  expect((await app.state()).zones.hand.length).toBe(hand + 8);
});

test('生け贄にできるものが無ければ唱えても止まる', async ({ app }) => {
  await app.start();
  await app.lands('Swamp');
  const rites = await castFromHand(app, 'Village Rites');
  const s = await app.state();
  expect(s.cards[rites].zone).toBe('hand');
  await app.page.getByRole('button', { name: 'ログ' }).click();
  await expect(app.page.getByTestId('log')).toContainText('生け贄にできるパーマネントが無い');
});

test('Nasty End（伝説なら3枚）と Reckoner’s Bargain（マナ総量ぶん回復）', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp');
  await app.put('Torbran, Thane of Red Fell', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  let hand = (await app.state()).zones.hand.length;
  await castFromHand(app, 'Nasty End');
  await app.choose('朱地洞の族長、トーブラン');
  expect((await app.state()).zones.hand.length).toBe(hand + 3);
  hand = (await app.state()).zones.hand.length;
  await app.put('Nasty End', 'hand');
  await app.act(await app.id('Nasty End', 'graveyard'), /唱える/);
  await app.choose('ネズミ');
  expect((await app.state()).zones.hand.length).toBe(hand + 2);
  await app.put('Torbran, Thane of Red Fell', 'battlefield');
  await castFromHand(app, "Reckoner's Bargain");
  await app.choose('朱地洞の族長、トーブラン');
  expect((await app.state()).life).toBe(44);
});

test('Eviscerator’s Insight はフラッシュバックで墓地から唱えて追放', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp');
  await app.dispatch({ type: 'token', name: 'Rat', count: 2 });
  const ev = await castFromHand(app, "Eviscerator's Insight");
  await app.choose('ネズミ');
  expect((await app.state()).cards[ev].zone).toBe('graveyard');
  // 墓地から唱えられるカードがあると、墓地の山と一覧のカードが光る
  await expect(app.page.getByTestId('pile-graveyard')).toHaveClass(/ready/);
  await app.page.getByTestId('pile-graveyard').click();
  await expect(app.card(ev)).toHaveClass(/ready/);
  await app.act(ev, /唱える/);
  await app.choose('ネズミ');
  expect((await app.state()).cards[ev].zone).toBe('exile');
  await expect(app.page.getByTestId('pile-graveyard')).not.toHaveClass(/ready/);
  await expect(app.page.getByTestId('pile-exile')).not.toHaveClass(/ready/);
});

test('Bitter Triumph：ライフか手札で追加コスト', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp');
  await castFromHand(app, 'Bitter Triumph');
  await app.choose('3点のライフを支払う');
  expect((await app.state()).life).toBe(37);
  const bt = await app.put('Bitter Triumph', 'hand');
  const victim = (await app.state()).zones.hand[0];
  await app.act(bt, /唱える/);
  await app.dispatch({ type: 'answer', values: [victim] });
  expect((await app.state()).cards[victim].zone).toBe('graveyard');
});

test('My Precious：出来事で引いてから、追放から装備品を唱える', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  const mp = await app.put('My Precious // Allure of Power', 'hand');
  await app.card(mp).click();
  await app.page.getByRole('dialog').getByRole('button', { name: /力の魅惑/ }).click();
  await app.choose('ネズミ');
  expect((await app.state()).cards[mp].zone).toBe('exile');
  await expect(app.page.getByTestId('pile-exile')).toHaveClass(/ready/);
  await app.page.getByTestId('pile-exile').click();
  await app.card(mp).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /力の魅惑/ })).toHaveCount(0);
  await app.page.getByRole('dialog').getByRole('button', { name: /唱える：いとしいしと/ }).click();
  expect((await app.state()).cards[mp].zone).toBe('battlefield');
});

test('Vampiric Rites：生け贄で1点回復1ドロー', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp');
  const vr = await app.put('Vampiric Rites', 'battlefield');
  await app.card(vr).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /生け贄に、1点回復/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  await app.act(vr, /生け贄に、1点回復/);
  await app.choose('ネズミ');
  expect((await app.state()).life).toBe(41);
});

test('スクリプトの無いカード・タイミング・統率者税', async ({ app }) => {
  await app.start();
  await app.lands('Swamp', 'Swamp', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain');
  // Feed the Swarm（ソーサリー）は戦闘中に唱えられない
  const feed = await app.put('Feed the Swarm', 'hand');
  await app.dispatch({ type: 'toCombat' });
  await app.card(feed).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /唱える/ })).toHaveCount(0);
  await expect(app.page.getByRole('dialog')).toContainText('相手ありモードで自動処理');
  await app.page.getByRole('button', { name: '閉じる' }).click();
  // インスタントは唱えられる
  const grasp = await app.put('Infernal Grasp', 'hand');
  await app.act(grasp, /唱える/);
  expect((await app.state()).cards[grasp].zone).toBe('graveyard');
  // 墓地のフラッシュバックの無いカード・ライブラリーのカードは唱えられない
  await app.dispatch({ type: 'attack' }, { type: 'damage' }, { type: 'endCombat' });
  await app.page.getByTestId('pile-graveyard').click();
  await app.card(grasp).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /唱える/ })).toHaveCount(0);
  // Esc で詳細 → 一覧の順に閉じる
  await app.page.keyboard.press('Escape');
  await expect(app.page.getByRole('dialog')).toHaveCount(1);
  await app.page.keyboard.press('Escape');
  await expect(app.page.getByRole('dialog')).toHaveCount(0);
  // 統率者を唱えて、戻して、税込みで唱える
  const ingris = await app.id('Ingris Stingerquill');
  await app.act(ingris, /唱える/);
  await app.dispatch({ type: 'move', id: ingris, to: 'exile', trigger: true });
  expect((await app.state()).cards[ingris].zone).toBe('command');
  await expect(app.page.getByTestId('command')).toContainText('統率者税 2');
  await app.lands('Swamp', 'Mountain', 'Mountain', 'Mountain', 'Mountain');
  await app.act(ingris, /唱える.*\{2\}\{B\}\{R\}\{R\}/);
  expect((await app.state()).cards[ingris].zone).toBe('battlefield');
});
