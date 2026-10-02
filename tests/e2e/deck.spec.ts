// デッキの切り替え。e2e ではテスト用デッキ（tests/fixtures/decks/test-goblins.json）が一覧に足される
import { expect, test } from './fixtures';

const INGRIS = 'イングリス・スティンガークイル（黒赤バーン）';
const GOBLINS = 'テスト用ゴブリン（e2e 専用）';

test('デッキを切り替えると、そのデッキで新しいゲームが始まり、次に開いたときも覚えている', async ({ app, page }) => {
  await app.open();
  const select = page.getByRole('combobox', { name: 'デッキ' });
  await expect(select.locator('option')).toHaveText([INGRIS, GOBLINS]);
  await expect(select).toHaveValue('ingris');
  await page.getByRole('button', { name: 'キープ' }).click();
  await page.getByRole('button', { name: 'ターン終了' }).click();

  await select.selectOption('test-goblins');
  let s = await app.state();
  expect(s.phase).toBe('mulligan');
  expect(s.turn).toBe(0);
  expect(s.zones.command.map((id) => s.cards[id].name)).toEqual(['General Kreat, the Boltbringer']);
  expect(s.zones.library).toHaveLength(34 - 7);
  // 切り替えると履歴は消える
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await page.getByRole('button', { name: 'デッキ' }).click();
  await expect(page.getByTestId('deck')).toContainText(`${GOBLINS}：35 / 100 枚`);

  // 「同じシード」「新しいゲーム」はデッキを変えない
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '新しいゲーム' }).click();
  expect((await app.state()).deckId).toBe('test-goblins');

  // 開き直しても同じデッキ
  await app.open('seed=2&images=0');
  await expect(select).toHaveValue('test-goblins');
  s = await app.state();
  expect(s.deckId).toBe('test-goblins');
});

test('URL の ?deck= が優先され、知らないデッキなら既定のデッキ', async ({ app, page }) => {
  await app.open('seed=1&images=0&deck=test-goblins');
  expect((await app.state()).deckId).toBe('test-goblins');
  await app.open('seed=1&images=0&deck=no-such-deck');
  expect((await app.state()).deckId).toBe('ingris');
  await expect(page.getByRole('combobox', { name: 'デッキ' })).toHaveValue('ingris');
});

test('統率者の固有色・コツ・統率者税はデッキごと', async ({ app, page }) => {
  await app.start('seed=1&images=0&deck=test-goblins');
  // 単色（赤）の統率者なので、統率の塔は {R} しか出ない
  const tower = await app.put('Command Tower', 'battlefield');
  await app.card(tower).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^マナ/ })).toHaveText(['マナ：{R}']);
  await page.keyboard.press('Escape');
  // コツはこのデッキのもの
  const tremors = await app.put('Impact Tremors', 'hand');
  await app.card(tremors).click();
  await expect(page.getByRole('dialog')).toContainText('コツ：テスト用デッキでのコツ');
  await page.keyboard.press('Escape');
  // 統率者（クレート）を唱えて戻すと税が付く
  await app.lands('Mountain', 'Mountain');
  const kreat = await app.id('General Kreat, the Boltbringer');
  await app.act(kreat, /唱える/);
  await app.dispatch({ type: 'move', id: kreat, to: 'graveyard', trigger: true });
  await expect(page.getByTestId('command')).toContainText('統率者税 2');
});

test('記録はデッキごとに分かれ、デッキを持つ前の記録は最初のデッキに数える', async ({ app, page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('goldfish.results', JSON.stringify([{ date: '2026-09-30T00:00:00.000Z', seed: 9, turn: 7, seconds: 60, mulligans: 0 }]));
  });
  await app.start('seed=1&images=0&deck=test-goblins');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 1, delta: -40 }, { type: 'oppLife', opp: 2, delta: -40 });
  await page.getByRole('dialog', { name: '結果' }).getByRole('button', { name: 'ダメージを見る' }).click();
  await expect(page.getByTestId('stats')).toContainText('平均キルターン 1.0');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'デッキ' }).selectOption('ingris');
  await page.getByRole('button', { name: '記録' }).click();
  await expect(page.getByTestId('stats')).toContainText('平均キルターン 7.0');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('goldfish.results')!) as { deck?: string }[]);
  expect(saved.map((r) => r.deck)).toEqual(['ingris', 'test-goblins']);
});
