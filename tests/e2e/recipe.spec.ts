// レシピ通りに追加した19枚（Sol Ring・Signet・ペインランド・Howlsquad など）
import { expect, test, type App } from './fixtures';

const tokenIds = async (app: App, name: string) =>
  Object.entries((await app.state()).cards)
    .filter(([, c]) => c.token && c.name === name)
    .map(([id]) => id);

test('デッキは統率者込み100枚', async ({ app, page }) => {
  await app.start();
  const s = await app.state();
  expect(Object.keys(s.cards)).toHaveLength(100);
  await page.getByRole('button', { name: 'デッキ' }).click();
  await expect(page.getByTestId('deck')).toContainText('100 / 100 枚');
});

test('Sol Ring は2マナ出し、使わなかった1マナはプールに残る（Dockside Chef）', async ({ app }) => {
  await app.start();
  await app.lands('Swamp');
  await app.put('Sol Ring', 'battlefield');
  const chef = await app.put('Dockside Chef', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  const hand = (await app.state()).zones.hand.length;
  await app.act(chef, /生け贄に1枚引く/);
  await app.choose('ネズミ');
  const s = await app.state();
  expect(s.zones.hand.length).toBe(hand + 1);
  expect(s.pool.C).toBe(1);
  // 手動でタップすれば {C}{C}
  await app.endTurn();
  await app.act(await app.id('Sol Ring'), 'マナ：{C}{C}');
  expect((await app.state()).pool.C).toBe(2);
});

test('Rakdos Signet：手動は {1} を払って {B}{R}、自動支払いでは1マナ扱い', async ({ app, page }) => {
  await app.start();
  const signet = await app.put('Rakdos Signet', 'battlefield');
  // 詳細には自動支払い用の近似は出ない
  await app.card(signet).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^マナ/ })).toHaveCount(1);
  // プールが空だと払えない
  await page.getByRole('dialog').getByRole('button', { name: /\{1\}を払って/ }).click();
  expect((await app.state()).cards[signet].tapped).toBe(false);
  await app.dispatch({ type: 'pool', color: 'C', delta: 1 });
  await app.act(signet, /\{1\}を払って/);
  expect((await app.state()).pool).toMatchObject({ C: 0, B: 1, R: 1 });
  // 次のターン、Signet だけで {B} の呪文を唱えられる
  await app.dispatch({ type: 'endTurn' });
  const conviction = await app.put('Corrupted Conviction', 'hand');
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  await app.act(conviction, /唱える/);
  await app.choose('ネズミ');
  expect((await app.state()).cards[signet].tapped).toBe(true);
});

test('ペインランドとタリスマン：色マナで1点、無色ならただ', async ({ app }) => {
  await app.start();
  await app.put('Sulfurous Springs', 'battlefield');
  const whisper = await app.put("Night's Whisper", 'hand');
  await app.lands('Mountain');
  const hand = (await app.state()).zones.hand.length;
  await app.act(whisper, /唱える/);
  let s = await app.state();
  // 沼が無いので {B} は Springs から（1点）、{1} は山から。Night's Whisper で2点
  expect(s.life).toBe(40 - 1 - 2);
  expect(s.zones.hand.length).toBe(hand - 1 + 2);
  const talisman = await app.put('Talisman of Indulgence', 'battlefield');
  await app.act(talisman, /マナ：\{R\}/);
  expect((await app.state()).life).toBe(36);
  await app.endTurn();
  await app.act(talisman, 'マナ：{C}');
  s = await app.state();
  expect(s.life).toBe(36);
  // 不特定マナには無色を使い、ダメージを受けない
  await app.endTurn();
  const signet = await app.put('Arcane Signet', 'hand');
  await app.act(signet, /唱える/);
  expect((await app.state()).life).toBe(36);
});

test('Howlsquad Heavy：スピード・ゴブリンに速攻・戦闘開始時ゴブリン・最大スピードで {R}×ゴブリン', async ({ app, page }) => {
  await app.start();
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  const howl = await app.put('Howlsquad Heavy', 'battlefield', true);
  let s = await app.state();
  expect(s.speed).toBe(1);
  const [g1] = await tokenIds(app, 'Goblin');
  expect(s.cards[g1]).toMatchObject({ zone: 'battlefield' });
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 }, { type: 'token', name: 'Rat', count: 1 });
  // スピードがあれば変えない
  await app.dispatch({ type: 'speed', delta: 1 }, { type: 'move', id: howl, to: 'hand', trigger: false });
  await app.put('Howlsquad Heavy', 'battlefield', true);
  expect((await app.state()).speed).toBe(2);
  await page.getByRole('button', { name: '戦闘へ' }).click();
  expect(await tokenIds(app, 'Goblin')).toHaveLength(3);
  // ゴブリンは出たばかりでも攻撃できる、ネズミはできない
  const [rat] = await tokenIds(app, 'Rat');
  await app.dispatch({ type: 'planAll', opp: 0 });
  s = await app.state();
  expect(Object.keys(s.cards).filter((id) => s.cards[id].name === 'Goblin').every((id) => id in (s as never as { plan: object }).plan)).toBe(true);
  void rat;
  await app.dispatch({ type: 'attack' }, { type: 'damage' });
  // 最大スピードでなければマナ能力は無い
  await app.endTurn();
  await app.card(howl).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^マナ/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await app.dispatch({ type: 'speed', delta: 4 });
  await app.act(howl, /マナ：\{R\}×/);
  // ゴブリン・トークン3体＋自分自身（ゴブリン）
  expect((await app.state()).pool.R).toBe(4);
});

test('Loyal Apprentice：統率者がいれば飛行機械', async ({ app }) => {
  await app.start();
  await app.put('Loyal Apprentice', 'battlefield');
  await app.dispatch({ type: 'toCombat' });
  expect(await tokenIds(app, 'Thopter')).toHaveLength(0);
  await app.dispatch({ type: 'attack' }, { type: 'damage' });
  await app.endTurn();
  await app.put('Ingris Stingerquill', 'battlefield');
  await app.dispatch({ type: 'toCombat' });
  expect(await tokenIds(app, 'Thopter')).toHaveLength(1);
});

test('Weftstalker Ardent：クリーチャーかアーティファクトが出ると1点、ワープは終了時に追放して唱え直せる', async ({ app, page }) => {
  await app.start();
  await app.lands('Mountain');
  const weft = await app.put('Weftstalker Ardent', 'hand');
  await app.card(weft).click();
  await page.getByRole('dialog').getByRole('button', { name: /唱える：ワープ/ }).click();
  await app.dispatch({ type: 'token', name: 'Treasure', count: 1 });
  expect(await app.oppLife()).toEqual([39, 39, 39]);
  await app.dispatch({ type: 'token', name: 'Rat', count: 1 });
  expect(await app.oppLife()).toEqual([38, 38, 38]);
  await app.lands('Swamp');
  expect(await app.oppLife()).toEqual([38, 38, 38]);
  await app.endTurn();
  expect((await app.state()).cards[weft]).toMatchObject({ zone: 'exile' });
  // 追放領域からはワープでは唱えられない（通常のコストで唱える）
  await app.lands('Mountain', 'Mountain');
  await page.getByTestId('pile-exile').click();
  await app.card(weft).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /唱える：ワープ/ })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: /唱える：虚空間追いの情熱家/ }).click();
  expect((await app.state()).cards[weft].zone).toBe('battlefield');
});

test('Blasphemous Act：クリーチャーの数だけ軽くなり、全部死ぬ', async ({ app }) => {
  await app.start();
  await app.lands('Mountain', 'Mountain');
  await app.put('Garna, Bloodfist of Keld', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Rat', count: 7 });
  const act = await app.put('Blasphemous Act', 'hand');
  // {8}{R} − 8 = {R}
  await app.act(act, /唱える.*\{R\}）/);
  const s = await app.state();
  expect(s.zones.battlefield.filter((id) => s.cards[id].name !== 'Mountain')).toHaveLength(0);
  // 同時に死んだネズミ7体を Garna が見届ける → 7点
  expect(s.opponents[0].life).toBe(33);
});

test('右クリックはブラウザのメニューを出さずに詳細を開く', async ({ app, page }) => {
  await app.start();
  const id = (await app.state()).zones.hand[0];
  const prevented = await app.card(id).evaluate((el) => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  // 右ボタンで押して離してもドラッグにならない
  await app.card(id).click({ button: 'right' });
  await page.keyboard.press('Escape');
  // 押下なしで離す（右ボタンの離しが届くかはブラウザ次第なので、直接起こして確かめる）
  await app.card(id).dispatchEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await app.state()).cards[id].zone).toBe('hand');
});

test('手札を持ち上げると、ほかの欄より手前に見える', async ({ app, page }) => {
  await app.start();
  const id = (await app.state()).zones.hand[0];
  const box = (await app.card(id).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 2 });
  await page.mouse.move(x, y - 250, { steps: 4 });
  const top = await page.evaluate(([px, py]) => (document.elementFromPoint(px, py)?.closest('[data-card]') as HTMLElement | null)?.dataset.card, [x, y - 250]);
  expect(top).toBe(id);
  expect(await page.evaluate(() => document.body.classList.contains('dragging-card'))).toBe(true);
  await page.mouse.up();
  expect(await page.evaluate(() => document.body.classList.contains('dragging-card'))).toBe(false);
});
