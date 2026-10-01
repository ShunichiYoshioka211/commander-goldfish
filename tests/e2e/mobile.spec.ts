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
