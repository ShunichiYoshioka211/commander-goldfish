import { expect, test } from './fixtures';

test('編集モード：ドラッグで任意の領域へ', async ({ app, page }) => {
  await app.start();
  await expect(page.getByTestId('pile-library')).toBeDisabled();
  await page.getByRole('button', { name: '編集モード' }).click();
  await expect(page.getByTestId('edit-toolbar')).toBeVisible();
  const [a, b, c] = (await app.state()).zones.hand;
  await app.drag(a, '[data-testid="pile-graveyard"]');
  await app.drag(b, '[data-testid="battlefield"]');
  await app.drag(c, '[data-testid="pile-library"]');
  let s = await app.state();
  expect([s.cards[a].zone, s.cards[b].zone, s.cards[c].zone]).toEqual(['graveyard', 'battlefield', 'library']);
  expect(s.zones.library[0]).toBe(c);
  // 同じ領域に落としても何もしない
  await app.drag(b, '[data-testid="battlefield"]');
  await app.drag(b, '[data-testid="pile-exile"]');
  expect((await app.state()).cards[b].zone).toBe('exile');
  await app.dispatch({ type: 'move', id: b, to: 'battlefield', trigger: false });
  await app.drag(b, '[data-testid="hand"]');
  const ingris = await app.id('Ingris Stingerquill');
  await app.drag(ingris, '[data-testid="battlefield"]');
  await app.drag(ingris, '[data-testid="command"]');
  s = await app.state();
  expect(s.cards[b].zone).toBe('hand');
  expect(s.cards[ingris].zone).toBe('command');
  // 編集モードで対象外の場所に落とす（相手）→ 通常の扱い（手札からなら唱えようとする）
  await app.drag(b, '[data-testid="opp0"]');
  // ライブラリーの一覧から取り出す
  await page.getByTestId('pile-library').click();
  const top = s.zones.library[0];
  await app.act(top, '→ 手札');
  expect((await app.state()).cards[top].zone).toBe('hand');
});

test('編集モード：詳細メニューから全領域へ・タップ・カウンター', async ({ app, page }) => {
  await app.start();
  await page.getByRole('button', { name: '編集モード' }).click();
  const id = await app.put('Legion Warboss', 'battlefield');
  const go = async (label: string) => {
    await app.card(id).click();
    await page.getByTestId('edit-actions').getByRole('button', { name: label }).click();
  };
  await app.card(id).click();
  const actions = page.getByTestId('edit-actions');
  await actions.getByRole('button', { name: 'タップ（効果なし）' }).click();
  await actions.getByRole('button', { name: 'アンタップ（効果なし）' }).click();
  for (const k of ['+1/+1', '忠誠', '炎', '油', '探索']) {
    await actions.getByRole('button', { name: `${k}を増やす` }).click();
    await actions.getByRole('button', { name: `${k}を増やす` }).click();
    await actions.getByRole('button', { name: `${k}を減らす` }).click();
  }
  await expect(app.card(id).locator('.counters')).toContainText('+1/+1:1');
  await expect(app.card(id).locator('.pt')).toHaveText('3/3');
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
  await go('→ 墓地');
  await page.getByTestId('pile-graveyard').click();
  await go('→ 追放');
  await page.keyboard.press('Escape');
  await page.getByTestId('pile-exile').click();
  await go('→ ライブラリーの下');
  await page.keyboard.press('Escape');
  let s = await app.state();
  expect(s.zones.library.at(-1)).toBe(id);
  await page.getByTestId('pile-library').click();
  await go('→ ライブラリーに入れてシャッフル');
  await go('→ 統率領域');
  await page.keyboard.press('Escape');
  await go('→ ライブラリーの上');
  expect((await app.state()).zones.library[0]).toBe(id);
  await page.getByTestId('pile-library').click();
  await go('→ 手札');
  await page.keyboard.press('Escape');
  await go('→ 戦場');
  s = await app.state();
  expect(s.cards[id].zone).toBe('battlefield');
});

test('編集モード：誘発させる・トークン・全破壊・シャッフル', async ({ app, page }) => {
  await app.start();
  await page.getByRole('button', { name: '編集モード' }).click();
  await app.put('Impact Tremors', 'battlefield');
  const toolbar = page.getByTestId('edit-toolbar');
  await toolbar.getByLabel('トークンの種類').selectOption('Knight');
  await toolbar.getByLabel('トークンの数').fill('3');
  await toolbar.getByRole('button', { name: 'トークン作成' }).click();
  expect(await app.oppLife()).toEqual([37, 37, 37]);
  // 誘発させずに戦場へ
  const warboss = await app.put('Legion Warboss', 'hand');
  await app.act(warboss, '→ 戦場');
  expect(await app.oppLife()).toEqual([37, 37, 37]);
  // 誘発させて戦場へ
  await toolbar.getByLabel('移動で誘発させる').check();
  const kreat = await app.put('General Kreat, the Boltbringer', 'hand');
  await app.act(kreat, '→ 戦場');
  expect(await app.oppLife()).toEqual([36, 36, 36]);
  await toolbar.getByRole('button', { name: '全クリーチャー破壊' }).click();
  expect((await app.state()).zones.battlefield).toHaveLength(1);
  const before = (await app.state()).zones.library;
  await toolbar.getByRole('button', { name: 'シャッフル' }).click();
  expect((await app.state()).zones.library).not.toEqual(before);
});

test('編集モード：ライフ・統率者ダメージ・スピード・統治者・マナ', async ({ app, page }) => {
  await app.start();
  await page.getByRole('button', { name: '編集モード' }).click();
  const opp = page.getByTestId('opp0');
  await opp.getByRole('button', { name: '−5', exact: true }).click();
  await opp.getByRole('button', { name: '−1', exact: true }).click();
  await opp.getByRole('button', { name: '+1', exact: true }).click();
  await opp.getByRole('button', { name: '統+1' }).click();
  await opp.getByRole('button', { name: '統+1' }).click();
  await opp.getByRole('button', { name: '統−1' }).click();
  let s = await app.state();
  expect(s.opponents[0]).toMatchObject({ life: 35, commanderDamage: 1 });
  const status = page.locator('.status');
  await status.getByRole('button', { name: '−1', exact: true }).click();
  await status.getByRole('button', { name: '+1', exact: true }).click();
  await status.getByRole('button', { name: '+1', exact: true }).click();
  await expect(page.getByTestId('my-life')).toHaveText('41');
  await status.getByRole('button', { name: '速+' }).click();
  await status.getByRole('button', { name: '速+' }).click();
  await status.getByRole('button', { name: '速−' }).click();
  await status.getByRole('button', { name: '統治者' }).click();
  await expect(status).toContainText('スピード 1');
  await expect(status.locator('.badge', { hasText: '統治者' })).toBeVisible();
  const pool = page.getByTestId('pool');
  await pool.getByRole('button', { name: 'Rを足す' }).click();
  await pool.getByRole('button', { name: 'Rを足す' }).click();
  await pool.getByRole('button', { name: 'Rを減らす' }).click();
  await pool.getByRole('button', { name: 'Bを足す' }).click();
  s = await app.state();
  expect(s.pool).toMatchObject({ R: 1, B: 1 });
  // 編集モードを切るとプールにあるものだけ見える
  await page.getByRole('button', { name: '編集モード' }).click();
  await expect(pool).toContainText('R×1');
  await expect(pool).not.toContainText('C×0');
  // プールのマナで唱える
  const rites = await app.put('Village Rites', 'hand');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  await app.act(rites, /唱える/);
  await app.choose('ネズミ');
  expect((await app.state()).pool).toMatchObject({ R: 1, B: 0 });
});
