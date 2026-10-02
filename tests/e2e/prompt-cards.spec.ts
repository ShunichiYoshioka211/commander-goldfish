// 選択画面でカードの中身が分かること（占術・探検でめくったカード、カードを選ぶ選択肢）
import { expect, test } from './fixtures';

test('占術でめくったカードは、名前だけでなくタイプ行・効果・コツまで出る', async ({ app, page }) => {
  await app.start();
  const temple = await app.put('Temple of Malice', 'hand');
  const top = await app.put('Torbran, Thane of Red Fell', 'library');
  await app.dispatch({ type: 'playLand', id: temple });
  const reveal = page.getByRole('dialog').getByTestId('prompt-reveal');
  await expect(reveal).toContainText('朱地洞の族長、トーブラン');
  await expect(reveal).toContainText('伝説のクリーチャー — ドワーフ・貴族');
  await expect(reveal).toContainText('あなたがコントロールしている赤の発生源');
  await expect(reveal).toContainText('コツ：');
  // はい／いいえのような選択肢にはカードの絵を付けない
  await expect(page.getByRole('dialog').locator('.card-choice')).toHaveCount(0);
  await expect(page.getByRole('dialog')).not.toContainText('長押し');
  await app.choose('下に置く');
  expect((await app.state()).zones.library.at(-1)).toBe(top);
});

test('探検でめくったカードも見える', async ({ app, page }) => {
  await app.start();
  await app.put('Francisco, Fowl Marauder', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Pirate', count: 1 });
  await app.put('Village Rites', 'library');
  const [pirate] = Object.entries((await app.state()).cards).find(([, c]) => c.name === 'Pirate')!;
  await app.dispatch({ type: 'toCombat' }, { type: 'plan', id: pirate, opp: 0 }, { type: 'attack' }, { type: 'damage' });
  await expect(page.getByRole('dialog').getByTestId('prompt-reveal')).toContainText('村の儀式');
  await expect(page.getByRole('dialog').getByTestId('prompt-reveal')).toContainText('カード２枚を引く');
});

test('カードを選ぶ選択肢には絵が付き、カーソルを重ねる・長押しで効果が見られる', async ({ app, page }) => {
  await app.start('seed=1&images=1');
  await app.lands('Mountain', 'Mountain');
  const sg = await app.put('Siege-Gang Lieutenant', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  await app.act(sg, /ゴブリンを生け贄/);
  const dialog = page.getByRole('dialog');
  const tiles = dialog.locator('.card-choice');
  await expect(tiles).toHaveCount(2);
  // 画像のあるカードは画像、トークンは名前とタイプ行
  await expect(tiles.filter({ hasText: '包囲攻撃の副官' }).locator('img')).toHaveCount(1);
  await expect(tiles.filter({ hasText: 'ゴブリン' }).last().locator('.text-type')).toHaveText('トークン・クリーチャー — ゴブリン');
  await expect(dialog).toContainText('長押し');
  await expect(dialog.getByTestId('prompt-peek')).toHaveCount(0);

  // カーソルを重ねる
  await tiles.filter({ hasText: '包囲攻撃の副官' }).hover();
  await expect(dialog.getByTestId('prompt-peek')).toContainText('{2}, ゴブリン１体を生け贄に捧げる');
  // 長押し（右クリック）でも見られ、ブラウザのメニューは出ない
  const prevented = await tiles.last().evaluate((el) => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(dialog.getByTestId('prompt-peek')).toContainText('トークン・クリーチャー — ゴブリン');
  // 閉じられる
  await dialog.getByRole('button', { name: 'カードの表示を閉じる' }).click();
  await expect(dialog.getByTestId('prompt-peek')).toHaveCount(0);

  // 選ぶと次の選択（対象）へ。前の選択で見ていたカードは出さない
  await tiles.first().hover();
  await expect(dialog.getByTestId('prompt-peek')).toHaveCount(1);
  await app.choose('ゴブリン');
  await expect(dialog).toContainText('1点をどの対戦相手に');
  await expect(dialog.getByTestId('prompt-peek')).toHaveCount(0);
  await expect(dialog.locator('.card-choice')).toHaveCount(0);
});

test('マリガン後に下へ置くカードも絵で選べる（画像を出さない設定なら文字のカード）', async ({ app, page }) => {
  await app.open();
  await page.getByRole('button', { name: 'マリガン' }).click();
  await page.getByRole('button', { name: 'マリガン' }).click();
  await page.getByRole('button', { name: 'キープ' }).click();
  const tiles = page.getByRole('dialog').locator('.card-choice');
  await expect(tiles).toHaveCount(7);
  await expect(tiles.locator('img')).toHaveCount(0);
  await expect(tiles.first().locator('.text-name')).not.toBeEmpty();
});
