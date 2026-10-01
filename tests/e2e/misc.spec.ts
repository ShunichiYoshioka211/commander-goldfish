import { expect, test } from './fixtures';

test('ミシュラランドは手札からプレイするとタップイン', async ({ app }) => {
  await app.start();
  for (const name of ['Lavaclaw Reaches', 'Restless Vents']) {
    const id = await app.put(name, 'hand');
    await app.dispatch({ type: 'playLand', id });
    expect((await app.state()).cards[id].tapped).toBe(true);
    await app.endTurn();
  }
});

test('カウンターの無い Fated Firepower は増幅しない', async ({ app }) => {
  await app.start();
  await app.put('Fated Firepower', 'battlefield');
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  expect(await app.oppLife()).toEqual([39, 39, 39]);
});

test('ライブラリーが空だと引けない', async ({ app, page }) => {
  await app.start();
  const s = await app.state();
  for (const id of s.zones.library) await app.dispatch({ type: 'move', id, to: 'exile', trigger: false });
  await app.dispatch({ type: 'endTurn' });
  await page.getByRole('button', { name: 'ログ' }).click();
  await expect(page.getByTestId('log')).toContainText('ライブラリが空で引けない');
});

test('生き残りが1人なら対象を聞かない・脱落から復帰できる', async ({ app }) => {
  await app.start();
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 2, delta: -40 });
  await app.dispatch({ type: 'token', name: 'Devil', count: 1 });
  const devil = Object.entries((await app.state()).cards).find(([, c]) => c.name === 'Devil')![0];
  await app.dispatch({ type: 'move', id: devil, to: 'graveyard', trigger: true });
  let s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.opponents[1].life).toBe(39);
  await app.dispatch({ type: 'oppLife', opp: 0, delta: 10 });
  s = await app.state();
  expect(s.opponents[0].deadTurn).toBeNull();
});

test('一覧は閉じるボタンと背景で閉じる・発生源が複数ならダメージ順に並ぶ', async ({ app, page }) => {
  await app.start();
  await page.getByTestId('pile-graveyard').click();
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('pile-exile').click();
  await page.locator('.modal-back').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await app.put('Impact Tremors', 'battlefield');
  await app.put('Witty Roastmaster', 'battlefield');
  await app.put('Slash, Reptile Rampager', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  await page.getByRole('button', { name: '記録' }).click();
  const rows = page.getByTestId('stats').locator('table').first().locator('tr');
  await expect(rows.first()).toContainText('破天荒爬虫類、スラッシュ');
});
