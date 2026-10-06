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
  // 選択欄の幅は一番長い選択肢で決まる。デッキの表示名が長くても画面の幅を超えないこと
  // （フォントで幅が変わり、CI でだけ溢れたことがあるので、とても長い選択肢を足して確かめる）
  await page.getByRole('combobox', { name: 'デッキ' }).evaluate((el) => {
    const option = document.createElement('option');
    option.text = 'とても長いデッキの表示名'.repeat(6);
    el.appendChild(option);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('スマホ幅：手札が増えても欄の幅に収まり、一番右のカードまで見えてタップできる', async ({ app, page }) => {
  await app.start();
  const library = (await app.state()).zones.library;
  for (const id of library.slice(0, 18)) await app.dispatch({ type: 'move', id, to: 'hand', trigger: false });
  const hand = (await app.state()).zones.hand;
  expect(hand).toHaveLength(25);
  const box = (await page.getByTestId('hand').boundingBox())!;
  const boxes = await Promise.all(hand.map(async (id) => (await app.card(id).boundingBox())!));
  // 右端のカードが欄の中にあり、どのカードも右隣に隠れない部分（2割）がある
  expect(boxes.at(-1)!.x + boxes.at(-1)!.width).toBeLessThanOrEqual(box.x + box.width + 1);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x - boxes[i - 1].x).toBeGreaterThanOrEqual(boxes[i].width * 0.2 - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await app.card(hand.at(-1)!).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('スマホ幅：相手3人に8体ずつ並べ、要約が出ても横スクロールが出ず、チップは2行（+N）に収まる。押すと一覧が開く', async ({ app, page }) => {
  // シード6・2番手：4ターン進めると、相手の要約が長くなる（相手1は「騎士を出した、3体がほかの相手を攻撃」）
  await app.start('rivals=1&seat=2&seed=6&images=0');
  for (let i = 0; i < 4; i++) await app.endTurn();
  await expect(page.getByTestId('opp0').locator('.recap')).toContainText('、');
  // 到達を持つ蜘蛛を出してから、残りを埋めて8体ずつにする
  await app.rival(0, 'spider');
  const kinds = ['scout', 'bear', 'wall', 'bird', 'viper', 'knight', 'guardian', 'drake'];
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
  // 見えるチップと「+N」は2行に収まる
  const rows = await opp0.locator('.rival-chips > :visible').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(rows).toBeLessThanOrEqual(2);
  await opp0.getByRole('button', { name: /^対戦相手1のクリーチャー/ }).tap();
  const viewer = page.getByRole('dialog', { name: '対戦相手1のクリーチャー' });
  await expect(viewer).toContainText('到達：飛行を持つクリーチャーもブロックできる');
  await expect(viewer.locator('.chip-name').first()).toBeVisible();
});
