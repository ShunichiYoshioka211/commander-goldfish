import { expect, test } from './fixtures';

test('マリガン3回 → 2枚選んで下に置く', async ({ app, page }) => {
  await app.open();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'マリガン' }).click();
  await expect(page.getByText('マリガン3回')).toBeVisible();
  await page.getByRole('button', { name: 'キープ' }).click();
  const dialog = page.getByRole('dialog');
  const decide = dialog.getByRole('button', { name: '決定' });
  await expect(decide).toBeDisabled();
  const options = dialog.locator('.choices button');
  await options.nth(0).click();
  await options.nth(0).click(); // 選び直し
  await options.nth(1).click();
  await expect(decide).toBeDisabled();
  await options.nth(2).click();
  await options.nth(3).click(); // 上限を超えたら古い方が外れる
  await expect(dialog.locator('.choices button.picked')).toHaveCount(2);
  await decide.click();
  const s = await app.state();
  expect(s.zones.hand).toHaveLength(5);
  expect(s.turn).toBe(1);
});

test('ドラッグで土地をプレイし、呪文を唱える', async ({ app, page }) => {
  await app.start();
  const swamp = await app.put('Swamp', 'hand');
  const mountain = await app.put('Mountain', 'hand');
  await app.drag(swamp, '[data-testid="battlefield"]');
  expect((await app.state()).cards[swamp].zone).toBe('battlefield');
  // 2枚目はプレイできない
  await app.drag(mountain, '[data-testid="battlefield"]');
  await expect(page.getByRole('status')).toHaveText('いまは土地をプレイできない');
  // マナが足りない呪文
  const torbran = await app.put('Torbran, Thane of Red Fell', 'hand');
  await app.drag(torbran, '[data-testid="battlefield"]');
  await expect(page.getByRole('status')).toHaveText('いまは唱えられない（マナかタイミング）');
  // 唱えられる呪文（上に持ち上げるだけでよい）
  const rites = await app.put('Village Rites', 'hand');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  await app.drag(rites, '[data-testid="opp1"]');
  await app.choose('ネズミ');
  expect((await app.state()).cards[rites].zone).toBe('graveyard');
  // 少しだけ動かして手札に戻す → 何も起きない
  await app.drag(mountain, '[data-testid="hand"]');
  expect((await app.state()).cards[mountain].zone).toBe('hand');
  // 唱え方が複数あるカードは詳細を開く
  await app.lands('Mountain', 'Mountain', 'Mountain', 'Mountain');
  const room = await app.put('Spiked Corridor // Torture Pit', 'hand');
  await app.drag(room, '[data-testid="battlefield"]');
  await expect(page.getByRole('dialog')).toContainText('唱える：突刺回廊');
  // 背景を押して閉じる
  await page.locator('.modal-back').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // 戦闘に入ってからの土地は、詳細から押してもプレイできない
  await app.endTurn();
  await page.getByRole('button', { name: '戦闘へ' }).click();
  await app.card(mountain).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'プレイ' })).toHaveCount(0);
});

test('画面外に落としても何も起きない', async ({ app, page }) => {
  await app.start();
  const id = (await app.state()).zones.hand[0];
  const box = (await app.card(id).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 10, { steps: 2 });
  await page.mouse.move(-50, 5000, { steps: 2 });
  await page.mouse.up();
  expect((await app.state()).cards[id].zone).toBe('hand');
});

test('戦闘：ドラッグで攻撃を指定してダメージ', async ({ app, page }) => {
  await app.start();
  await app.put('Ingris Stingerquill', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Pirate', count: 3 }, { type: 'token', name: 'Knight', count: 1 });
  const s0 = await app.state();
  const pirates = Object.keys(s0.cards).filter((id) => s0.cards[id].name === 'Pirate');
  const knight = Object.keys(s0.cards).find((id) => s0.cards[id].name === 'Knight')!;
  await page.getByRole('button', { name: '戦闘へ' }).click();
  // 召喚酔いの騎士は攻撃できない
  await app.drag(knight, '[data-testid="opp0"]');
  await expect(page.getByRole('status')).toHaveText('このクリーチャーは攻撃できない');
  await app.drag(pirates[0], '[data-testid="opp0"]');
  await expect(app.card(pirates[0]).locator('.plan-badge')).toHaveText('→1');
  // 詳細から指定・取り消し
  await app.act(pirates[1], '相手2に攻撃');
  await app.act(pirates[1], '攻撃をやめる');
  await page.getByRole('button', { name: '相手3' }).click();
  await expect(page.getByRole('button', { name: '3体で攻撃' })).toBeVisible();
  await page.getByRole('button', { name: '3体で攻撃' }).click();
  await expect(page.getByTestId('turn')).toContainText('ダメージ前');
  await page.getByRole('button', { name: '戦闘ダメージ' }).click();
  expect(await app.oppLife()).toEqual([37, 37, 37 - 3]);
  await expect(page.getByTestId('turn')).toContainText('ダメージ後');
  await page.getByRole('button', { name: '戦闘終了' }).click();
  await expect(page.getByTestId('turn')).toContainText('メイン2');
  await page.getByRole('button', { name: 'ターン終了' }).click();
  await page.getByRole('button', { name: '戦闘へ' }).click();
  await page.getByRole('button', { name: '攻撃しない' }).click();
  await page.getByRole('button', { name: '戦闘ダメージ' }).click();
  // ダメージ後からそのままターンを終えられる
  expect((await app.state()).phase).toBe('afterDamage');
  await page.getByRole('button', { name: 'ターン終了' }).click();
  const s = await app.state();
  if (s.prompt) await app.dispatch({ type: 'answer', values: s.zones.hand.slice(0, s.zones.hand.length - 7) });
  expect((await app.state()).turn).toBe(3);
});

test('元に戻す・やり直す（ボタンとキーボード）', async ({ app, page }) => {
  await app.start();
  const undo = page.getByRole('button', { name: '元に戻す' });
  const redo = page.getByRole('button', { name: 'やり直す' });
  await expect(redo).toBeDisabled();
  await page.getByRole('button', { name: 'ターン終了' }).click();
  expect((await app.state()).turn).toBe(2);
  await undo.click();
  expect((await app.state()).turn).toBe(1);
  await redo.click();
  expect((await app.state()).turn).toBe(2);
  await page.keyboard.press('Control+z');
  expect((await app.state()).turn).toBe(1);
  await page.keyboard.press('Control+y');
  expect((await app.state()).turn).toBe(2);
  // 履歴が無いときは何もしない
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+x');
  await page.keyboard.press('a');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await app.state()).phase).toBe('mulligan');
});

test('パネル：ログ・ダメージ・デッキ', async ({ app, page }) => {
  await app.start();
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 2 });
  await page.getByRole('button', { name: '記録' }).click();
  await expect(page.getByTestId('stats')).toContainText('衝撃の震え');
  await expect(page.getByTestId('stats')).toContainText('平均キルターン —');
  await page.getByRole('dialog').getByRole('button', { name: 'ログ' }).click();
  await expect(page.getByTestId('log')).toContainText('ゴブリントークンを2体生成');
  await page.getByRole('dialog').getByRole('button', { name: 'デッキ' }).click();
  await expect(page.getByTestId('deck')).toContainText('/ 100 枚');
  await expect(page.getByTestId('deck')).toContainText('自動');
  await page.getByRole('dialog').getByRole('button', { name: 'ダメージ・記録' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'デッキ' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('全員倒すと結果が出て記録に残る', async ({ app, page }) => {
  await app.start();
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 1, delta: -40 });
  await app.put('Impact Tremors', 'battlefield');
  await app.dispatch({ type: 'oppLife', opp: 2, delta: -39 });
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  const result = page.getByRole('dialog', { name: '結果' });
  await expect(result).toContainText('1ターン目に全員を倒した');
  await result.getByRole('button', { name: 'ダメージを見る' }).click();
  await expect(page.getByTestId('stats')).toContainText('平均キルターン 1.0');
  await expect(page.getByTestId('stats')).toContainText('1T');
  await page.keyboard.press('Escape');
  await expect(result).toHaveCount(0);
  // 戻して勝ち直すと、また出る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.getByRole('button', { name: 'やり直す' }).click();
  await result.getByRole('button', { name: '閉じる' }).click();
  await expect(result).toHaveCount(0);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.getByRole('button', { name: 'やり直す' }).click();
  const seed = (await app.state()).turn;
  void seed;
  await result.getByRole('button', { name: '同じシードでもう一度' }).click();
  expect((await app.state()).phase).toBe('mulligan');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('goldfish.results')!).length)).toBe(1);
  // もう一度勝って「新しいゲーム」
  await page.getByRole('button', { name: 'キープ' }).click();
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 1, delta: -40 }, { type: 'oppLife', opp: 2, delta: -40 });
  await page.getByRole('dialog', { name: '結果' }).getByRole('button', { name: '新しいゲーム' }).click();
  expect((await app.state()).phase).toBe('mulligan');
});

test('上部のボタン：画像・同じシード・新しいゲーム', async ({ app, page }) => {
  await app.open('seed=5&images=1');
  await expect(page.locator('.card img').first()).toBeVisible();
  await page.getByRole('button', { name: '画像' }).click();
  await expect(page.locator('.card img')).toHaveCount(0);
  const hand = (await app.state()).zones.hand;
  await page.getByRole('button', { name: 'キープ' }).click();
  await page.getByRole('button', { name: '同じシード' }).click();
  expect((await app.state()).zones.hand).toEqual(hand);
  await page.getByRole('button', { name: '新しいゲーム' }).click();
  await expect(page.getByText(/シード \d+/)).toBeVisible();
  // カード詳細に画像が出る
  await page.getByRole('button', { name: '画像' }).click();
  await app.card((await app.state()).zones.hand[0]).click();
  await expect(page.locator('.detail-image')).toBeVisible();
});

test('シードなし・設定は保存した値を使う／保存できなくても動く', async ({ app, page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('goldfish.results', '{壊れたJSON');
    localStorage.setItem('goldfish.images', 'false');
  });
  await app.open('');
  await expect(page.getByRole('button', { name: 'キープ' })).toBeVisible();
  expect(await page.locator('.card img').count()).toBe(0);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });
  await page.getByRole('button', { name: '画像' }).click();
  await expect(page.locator('.card img').first()).toBeVisible();
});

test('通知は少しで消え、続けて出すと差し替わる', async ({ app, page }) => {
  await app.start();
  const torbran = await app.put('Torbran, Thane of Red Fell', 'hand');
  await app.drag(torbran, '[data-testid="battlefield"]');
  await expect(page.getByRole('status')).toBeVisible();
  const swamp = await app.put('Swamp', 'hand');
  await app.dispatch({ type: 'toCombat' });
  await app.drag(swamp, '[data-testid="battlefield"]');
  await expect(page.getByRole('status')).toHaveText('いまは土地をプレイできない');
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 4000 });
});

test('ホバーしただけではドラッグにならない', async ({ app, page }) => {
  await app.start();
  const id = (await app.state()).zones.hand[0];
  const box = (await app.card(id).boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.move(box.x + 20, box.y + 20);
  // 押して、閾値未満だけ動かして離す → タップ扱い
  await page.mouse.down();
  await page.mouse.move(box.x + 22, box.y + 22);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
});
