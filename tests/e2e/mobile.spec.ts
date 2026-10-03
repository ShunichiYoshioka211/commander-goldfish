import { expect, test } from './fixtures';

test('スマホ幅：タップで詳細を開いてプレイし、横スクロールが出ない', async ({ app, page }) => {
  await app.start();
  const swamp = await app.put('Swamp', 'hand');
  await app.card(swamp).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'プレイ' }).tap();
  expect((await app.state()).cards[swamp].zone).toBe('battlefield');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('hand')).toBeVisible();
});

test('スマホ幅：相手3人に8体ずつ並べ、要約が出ても横スクロールが出ず、チップは2行（+N）に収まる。押すと一覧が開く', async ({ app, page }) => {
  // シード6・2番手：4ターン進めると、相手1（アグロ）の要約が長くなる（「鳥を出した、4体がほかの相手を攻撃、斥候が倒れた」）
  await app.start('rivals=1&seat=2&seed=6&images=0');
  for (let i = 0; i < 4; i++) await app.endTurn();
  await expect(page.getByTestId('opp0').locator('.recap')).toContainText('、');
  // 残りを埋めて8体ずつにする
  const kinds = ['scout', 'bear', 'wall', 'bird', 'viper', 'knight', 'spider', 'drake'];
  const s = await app.state();
  for (const opp of [0, 1, 2]) for (const kind of kinds.slice(s.opponents[opp].board.length)) await app.rival(opp, kind);
  await page.getByRole('button', { name: '編集モード' }).tap();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // 相手の欄が画面の幅に収まっている（要約の1行で列が広がらない）
  const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.opponent')].map((e) => e.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  const opp0 = page.getByTestId('opp0');
  await expect(opp0.locator('.chip-more')).toHaveText(/^\+\d+$/);
  await expect(opp0.locator('.chip-name').first()).toBeHidden();
  await expect(opp0.locator('.kw-short').first()).toBeVisible();
  await opp0.getByRole('button', { name: /^対戦相手1のクリーチャー/ }).tap();
  const viewer = page.getByRole('dialog', { name: '対戦相手1のクリーチャー' });
  await expect(viewer).toContainText('到達：飛行を持つクリーチャーもブロックできる');
  await expect(viewer.locator('.chip-name').first()).toBeVisible();
});
