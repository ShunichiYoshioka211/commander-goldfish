// 新しいバージョンの自動更新（Service Worker は差し替え tests/fixtures/pwa-register.ts で再現する）
import { expect, test } from './fixtures';

const applied = (page: import('@playwright/test').Page) => page.evaluate(() => window.__pwaApplied);
const notify = (page: import('@playwright/test').Page) => page.evaluate(() => window.__pwa!.onNeedRefresh!());

test('対局を始める前なら、届いたらすぐ自動で更新する', async ({ app, page }) => {
  await app.open();
  await notify(page);
  await expect.poll(() => applied(page)).toBe(1);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('対局中は知らせるだけで、次のゲームを始めるときに自動で更新する', async ({ app, page }) => {
  await app.start();
  await notify(page);
  await expect(page.getByTestId('update-banner')).toContainText('新しいバージョンがあります');
  expect(await applied(page)).toBe(0);
  await page.getByRole('button', { name: '新しいゲーム' }).click();
  await expect.poll(() => applied(page)).toBe(1);
});

test('対局中でも「今すぐ更新」で更新できる。全員倒したあとは自動', async ({ app, page }) => {
  await app.start();
  await notify(page);
  await page.getByTestId('update-banner').getByRole('button', { name: /今すぐ更新/ }).click();
  expect(await applied(page)).toBe(1);

  await app.start();
  await notify(page);
  expect(await applied(page)).toBe(0);
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 1, delta: -40 }, { type: 'oppLife', opp: 2, delta: -40 });
  await expect.poll(() => applied(page)).toBe(1);
});

test('更新の確認は1時間ごとと、アプリが前面に戻ったときにも行う', async ({ app, page }) => {
  await page.clock.install();
  await app.open();
  await page.evaluate(() => {
    const w = window as unknown as { __checks: number };
    w.__checks = 0;
    const registration = { update: async () => void w.__checks++ } as unknown as ServiceWorkerRegistration;
    window.__pwa!.onRegisteredSW!('sw.js', registration);
    // Service Worker が使えない環境では登録が無い
    window.__pwa!.onRegisteredSW!('sw.js', undefined);
  });
  const checks = () => page.evaluate(() => (window as unknown as { __checks: number }).__checks);
  await page.clock.runFor(60 * 60 * 1000);
  expect(await checks()).toBe(1);
  // 前面に戻ったとき
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await checks()).toBe(2);
});
