// 選択の途中で、やめる・1つ戻す
import { expect, test } from './fixtures';

test('生け贄を選ぶ画面で「やめる」と、唱える前に戻る', async ({ app, page }) => {
  await app.start();
  await app.lands('Swamp');
  const conviction = await app.put('Corrupted Conviction', 'hand');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  await app.act(conviction, /唱える/);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('生け贄に捧げるパーマネント');
  // 前に選択が無いので「1つ戻す」は出ない
  await expect(dialog.getByRole('button', { name: '1つ戻す' })).toHaveCount(0);
  await dialog.getByRole('button', { name: /やめる/ }).click();
  const s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.cards[conviction].zone).toBe('hand');
  // やり直すで選択の画面に戻れる
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(dialog).toContainText('生け贄に捧げるパーマネント');
  // Esc でもやめられる
  await page.keyboard.press('Escape');
  expect((await app.state()).prompt).toBeNull();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('選択が続くときは「1つ戻す」で前の選択へ、「やめる」で起動前（払ったマナも戻る）', async ({ app, page }) => {
  await app.start();
  await app.lands('Mountain', 'Mountain');
  const sg = await app.put('Siege-Gang Lieutenant', 'battlefield');
  await app.act(sg, /ゴブリンを生け贄/);
  let s = await app.state();
  expect(s.zones.battlefield.filter((id) => s.cards[id].tapped)).toHaveLength(2);
  await app.choose('包囲攻撃の副官');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1点をどの対戦相手に');
  await dialog.getByRole('button', { name: '1つ戻す' }).click();
  await expect(dialog).toContainText('生け贄に捧げるゴブリン');
  // 選び直せる
  await app.choose('包囲攻撃の副官');
  await dialog.getByRole('button', { name: /やめる/ }).click();
  s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.cards[sg].zone).toBe('battlefield');
  expect(s.zones.battlefield.filter((id) => s.cards[id].tapped)).toHaveLength(0);
  expect(await app.oppLife()).toEqual([40, 40, 40]);
});

test('マリガン後に下に置くカードを選ぶ画面でもやめられる', async ({ app, page }) => {
  await app.open();
  await page.getByRole('button', { name: 'マリガン' }).click();
  await page.getByRole('button', { name: 'マリガン' }).click();
  await page.getByRole('button', { name: 'キープ' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /やめる/ }).click();
  const s = await app.state();
  expect(s.phase).toBe('mulligan');
  expect(s.mulligans).toBe(2);
});
