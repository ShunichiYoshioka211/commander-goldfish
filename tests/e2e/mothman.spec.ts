// 賢きモスマンのデッキ（黒緑青）。土地のタップインの条件・マナの出し方と、固有色に合わせた表示
import { expect, test } from './fixtures';

const MOTHMAN = 'seed=1&images=0&deck=mothman';

test('モスマンのデッキで始まり、統率者・枚数・固有色が合っている', async ({ app, page }) => {
  await app.start(MOTHMAN);
  const s = await app.state();
  expect(s.deckId).toBe('mothman');
  expect(s.zones.command.map((id) => s.cards[id].name)).toEqual(['The Wise Mothman']);
  expect(s.zones.library).toHaveLength(99 - 7);
  await expect(page.getByRole('combobox', { name: 'デッキ' })).toHaveValue('mothman');
  // 編集モードのマナ・プールは、統率者の固有色（青・黒・緑）と無色
  await page.getByRole('button', { name: '編集モード' }).click();
  const pool = page.getByTestId('pool');
  for (const c of ['U', 'B', 'G', 'C']) await expect(pool.getByRole('button', { name: `${c}を足す` })).toBeVisible();
  await expect(pool.getByRole('button', { name: 'Rを足す' })).toHaveCount(0);
  // 統率の塔は固有色のマナを出す
  const tower = await app.put('Command Tower', 'battlefield');
  await page.getByRole('button', { name: '編集モード' }).click();
  await app.card(tower).click();
  for (const c of ['U', 'B', 'G']) await expect(page.getByRole('dialog').getByRole('button', { name: `マナ：{${c}}` })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'マナ：{R}' })).toHaveCount(0);
});

test('タップインの条件：チェックランド・基本土地2つ・スローランド・常にタップイン', async ({ app }) => {
  await app.start(MOTHMAN);
  const play = async (name: string) => {
    const id = await app.put(name, 'hand');
    await app.dispatch({ type: 'playLand', id });
    const tapped = (await app.state()).cards[id].tapped;
    // 次の土地を試せるように、編集で手札へ戻す（戻した土地は「ほかの土地」に数えない）
    await app.dispatch({ type: 'move', id, to: 'hand', trigger: false });
    return tapped;
  };
  // 土地が無い：どれもタップイン（チェックランド・バトルランド・スローランド・宮殿）
  expect(await play('Hinterland Harbor')).toBe(true);
  expect(await play('Woodland Cemetery')).toBe(true);
  expect(await play('Sunken Hollow')).toBe(true);
  expect(await play('Shipwreck Marsh')).toBe(true);
  // 森と沼がある（基本土地2つ・ほかの土地2つ）：チェックランド・バトルランド・スローランドはアンタップ、宮殿はタップイン
  await app.lands('Forest', 'Swamp');
  expect(await play('Hinterland Harbor')).toBe(false);
  expect(await play('Woodland Cemetery')).toBe(false);
  expect(await play('Sunken Hollow')).toBe(false);
  expect(await play('Deathcap Glade')).toBe(false);
  expect(await play('Dreamroot Cascade')).toBe(false);
  expect(await play('Opulent Palace')).toBe(true);
});

test('進化する未開地は基本土地をタップ状態で出す（土地が4つあってもタップのまま）', async ({ app }) => {
  await app.start(MOTHMAN);
  await app.lands('Forest', 'Swamp', 'Island');
  const wilds = await app.put('Evolving Wilds', 'battlefield');
  await app.act(wilds, '基本土地を探す');
  await app.choose('森');
  const s = await app.state();
  const forest = s.zones.battlefield.filter((id) => s.cards[id].name === 'Forest');
  expect(forest).toHaveLength(2);
  expect(forest.map((id) => s.cards[id].tapped).sort()).toEqual([false, true]);
  expect(s.cards[wilds].zone).toBe('graveyard');
});

test('好奇のタリスマンの色マナは1点受け、溢れかえる果樹園は {G/U} を払って2マナ出す', async ({ app, page }) => {
  await app.start(MOTHMAN);
  const talisman = await app.put('Talisman of Curiosity', 'battlefield');
  await app.act(talisman, 'マナ：{G}（1点受ける）');
  let s = await app.state();
  expect(s.life).toBe(39);
  expect(s.pool.G).toBe(1);
  // 反発のタリスマンも同じ（{B}・{G} は1点、{C} はただ）
  const resilience = await app.put('Talisman of Resilience', 'battlefield');
  await app.act(resilience, 'マナ：{C}');
  expect((await app.state()).life).toBe(39);
  await app.dispatch({ type: 'tap', id: resilience });
  await app.act(resilience, 'マナ：{B}（1点受ける）');
  s = await app.state();
  expect(s.life).toBe(38);
  expect(s.pool).toMatchObject({ B: 1, C: 1 });
  const grove = await app.put('Flooded Grove', 'battlefield');
  await app.act(grove, 'マナ：{G/U}を払って {U}{U}');
  s = await app.state();
  expect(s.pool).toMatchObject({ G: 0, U: 2 });
  // プールに {G} も {U} も無ければ出せない
  await app.dispatch({ type: 'tap', id: grove }, { type: 'pool', color: 'U', delta: -2 });
  await app.act(grove, 'マナ：{G/U}を払って {G}{G}');
  await page.getByRole('button', { name: 'ログ' }).click();
  await expect(page.getByTestId('log')).toContainText('マナ・プールに {G} か {U} が必要');
});

test('スクリプトの無いインスタント（対抗呪文）は唱えると墓地へ行き、しっぺ返しでコピーできるものには数えない', async ({ app }) => {
  await app.start(MOTHMAN);
  const counter = await app.put('Counterspell', 'hand');
  await app.dispatch({ type: 'pool', color: 'U', delta: 2 });
  await app.act(counter, /唱える/);
  const s = await app.state();
  expect([s.cards[counter].zone, s.recent]).toEqual(['graveyard', []]);
});
