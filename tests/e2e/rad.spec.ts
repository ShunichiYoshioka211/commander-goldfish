// RADカウンター・切削・増殖・+1/+1カウンターの置換（賢きモスマンのデッキ）。エンジンの仕組みを確かめる。
// 対戦相手のライブラリーは近似：切削した枚数の累計 m に対し、土地でないカードは floor(3m/5) 枚（1枚目は土地、2枚目は土地でない…）
import { expect, test, type App } from './fixtures';

const MOTHMAN = 'seed=1&images=0&deck=mothman';

/** ライブラリーの上を names の順にする（先頭が一番上） */
async function stackLibrary(app: App, names: string[]) {
  for (const name of [...names].reverse()) await app.put(name, 'library');
}

test('対戦相手のターン：ドローとRADカウンターの切削。土地でないカード1枚につき1点失い、RADカウンターが減る', async ({ app, page }) => {
  await app.start(MOTHMAN);
  await app.dispatch({ type: 'rad', who: 0, delta: 3 }, { type: 'rad', who: 1, delta: 5 });
  await expect(page.getByTestId('opp0-library')).toContainText('RAD 3');
  await app.endTurn();
  const s = await app.state();
  // 相手1：1枚引いて 91、3枚切削（土地でない1枚）で 88。1点失い、RADは2
  expect(s.opponents[0]).toMatchObject({ life: 39, rad: 2, library: 88, milled: 3, graveyard: 3 });
  // 相手2：5枚切削（土地でない3枚）
  expect(s.opponents[1]).toMatchObject({ life: 37, rad: 2, library: 86 });
  expect(s.opponents[2]).toMatchObject({ life: 40, rad: 0, library: 91 });
  await expect(page.getByTestId('opp0-library')).toHaveText('ライブラリー 88・墓地 3RAD 2');
  await expect(page.getByTestId('opp2-library')).toHaveText('ライブラリー 91・墓地 0');
  // ダメージの記録にも入る
  await page.getByRole('button', { name: '記録' }).click();
  await expect(page.getByTestId('stats')).toContainText('RADカウンター');
  expect(s.log.some((l) => l.includes('対戦相手1 は3枚を切削（土地でないカード1枚とみなす）'))).toBe(true);
});

test('あなたのRADカウンター：最初のメイン・フェイズの開始時に切削し、土地でないカードの数だけ失う', async ({ app, page }) => {
  await app.start(MOTHMAN);
  // 2ターン目のドローは島、そのあとの3枚（太陽の指輪・森・硬化した鱗）を切削する
  await stackLibrary(app, ['Island', 'Sol Ring', 'Forest', 'Hardened Scales']);
  await page.getByRole('button', { name: '編集モード' }).click();
  await page.locator('.status').getByRole('button', { name: 'RAD+' }).click();
  await page.locator('.status').getByRole('button', { name: 'RAD+' }).click();
  await page.locator('.status').getByRole('button', { name: 'RAD+' }).click();
  await page.locator('.status').getByRole('button', { name: 'RAD−' }).click();
  await page.locator('.status').getByRole('button', { name: 'RAD+' }).click();
  await expect(page.getByTestId('my-rad')).toHaveText('RAD 3');
  await app.endTurn();
  const s = await app.state();
  const names = s.zones.graveyard.map((id) => s.cards[id].name);
  expect(names).toEqual(['Sol Ring', 'Forest', 'Hardened Scales']);
  expect(s.life).toBe(38);
  expect(s.rad).toBe(1);
  expect(s.cards[s.zones.hand.at(-1)!].name).toBe('Island');
  // 編集：相手のRADカウンターも足し引きできる（0より下にはならない）
  const opp = page.getByTestId('opp1');
  await opp.getByRole('button', { name: 'RAD+1' }).click();
  await opp.getByRole('button', { name: 'RAD−1' }).click();
  await opp.getByRole('button', { name: 'RAD−1' }).click();
  expect((await app.state()).opponents[1].rad).toBe(0);
  // 手動で処理するカードの切削：ライブラリーと墓地のあいだで枚数を動かす（墓地より多くは戻せない）
  await opp.getByRole('button', { name: '切削+1' }).click();
  await opp.getByRole('button', { name: '切削+1' }).click();
  await opp.getByRole('button', { name: '切削−1' }).click();
  await opp.getByRole('button', { name: '切削−1' }).click();
  await opp.getByRole('button', { name: '切削−1' }).click();
  await opp.getByRole('button', { name: '切削+1' }).click();
  expect((await app.state()).opponents[1]).toMatchObject({ library: 90, graveyard: 1 });
});

test('ライブラリーが無くなった対戦相手は、引こうとしたときに敗北する（水のクリスタルで切削を増やす・青の呪文が軽い）', async ({ app, page }) => {
  await app.start(MOTHMAN);
  const crystal = await app.put('The Water Crystal', 'battlefield');
  // 青の呪文は不特定マナが{1}軽い：実験的占い {1}{U} → {U}
  const augury = await app.put('Experimental Augury', 'hand');
  await app.dispatch({ type: 'pool', color: 'U', delta: 1 });
  await app.card(augury).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '唱える：実験的占い（{U}）' })).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await app.dispatch({ type: 'pool', color: 'U', delta: -1 });
  // 起動するたび、各対戦相手は手札の枚数（8枚）＋4枚を切削する
  for (let i = 0; i < 8; i++) {
    await app.dispatch({ type: 'pool', color: 'U', delta: 2 }, { type: 'pool', color: 'C', delta: 4 }, { type: 'activate', id: crystal, index: 0 }, { type: 'tap', id: crystal });
  }
  let s = await app.state();
  expect(s.opponents.map((o) => o.library)).toEqual([0, 0, 0]);
  expect(s.opponents.every((o) => o.deadTurn === null)).toBe(true);
  await app.endTurn();
  s = await app.state();
  expect(s.opponents.map((o) => [o.decked, o.deadTurn])).toEqual([[true, 1], [true, 1], [true, 1]]);
  expect(s.phase).toBe('over');
});

test('賢きモスマン：出たときに全員がRADカウンター（巻きつき蛇であなたは2個）、切削でカウンターを配る（多ければ選ぶ）', async ({ app }) => {
  await app.start(MOTHMAN);
  await app.put('Winding Constrictor', 'battlefield');
  const mothman = await app.put('The Wise Mothman', 'battlefield', true);
  let s = await app.state();
  expect([s.rad, ...s.opponents.map((o) => o.rad)]).toEqual([2, 1, 1, 1]);
  // 思考掃きで相手1に2枚切削させる（土地でないカード1枚）→ X=1、クリーチャー2体なので選ぶ
  const scour = await app.put('Thought Scour', 'hand');
  await app.dispatch({ type: 'pool', color: 'U', delta: 1 });
  const hand = (await app.state()).zones.hand.length;
  await app.act(scour, /唱える/);
  await app.choose(/^対戦相手1/);
  s = await app.state();
  expect(s.zones.hand.length).toBe(hand - 1 + 1);
  expect(s.prompt?.title).toContain('賢きモスマン：+1/+1カウンターを置くクリーチャー（1体まで）');
  await app.choose('賢きモスマン');
  await app.decide();
  // 1個 ＋ 巻きつき蛇 1個
  expect((await app.state()).cards[mothman].counters['+1/+1']).toBe(2);
});

test('+1/+1カウンターの置換は、足すものを先・倍にするものを後に。増殖は相手のRADとあなたのパーマネントのカウンターだけ', async ({ app }) => {
  await app.start(MOTHMAN);
  const mothman = await app.put('The Wise Mothman', 'battlefield');
  for (const name of ['Winding Constrictor', 'Hardened Scales', 'Corpsejack Menace', 'Branching Evolution', 'Bloodchief Ascension']) await app.put(name, 'battlefield');
  const bastion = await app.put("Karn's Bastion", 'battlefield');
  const ascension = await app.id('Bloodchief Ascension');
  await app.dispatch(
    { type: 'counter', id: mothman, kind: '+1/+1', delta: 1 },
    { type: 'counter', id: ascension, kind: 'quest', delta: 1 },
    { type: 'rad', who: null, delta: 2 },
    { type: 'rad', who: 0, delta: 1 },
    { type: 'pool', color: 'C', delta: 4 },
  );
  await app.act(bastion, '{4}：増殖');
  const s = await app.state();
  // モスマン：1 ＋（1 ＋ 巻きつき蛇 1 ＋ 硬化した鱗 1）×2（屍体屋の脅威）×2（枝分かれの進化）= 13
  expect(s.cards[mothman].counters['+1/+1']).toBe(13);
  // 血の長の昇天（エンチャント）は置換を受けない
  expect(s.cards[ascension].counters.quest).toBe(2);
  // 相手1のRADだけ増え（持っていない相手は増えない）、あなたのRADは増やさない
  expect(s.opponents.map((o) => o.rad)).toEqual([2, 0, 0]);
  expect(s.rad).toBe(2);
});

test('本題の流れ：対戦相手の最初のメイン・フェイズのRAD切削で、賢きモスマンが相手のターン中にカウンターを配る（相手なし・相手あり）', async ({ app }) => {
  for (const query of [MOTHMAN, 'rivals=1&seat=1&seed=1&images=0&deck=mothman']) {
    await app.start(query);
    const mothman = await app.put('The Wise Mothman', 'battlefield');
    await app.put('Winding Constrictor', 'battlefield');
    await app.dispatch({ type: 'rad', who: 0, delta: 2 });
    await app.dispatch({ type: 'endTurn' });
    let s = await app.state();
    // 相手1のターン：2枚切削（土地でない1枚）→ X=1、クリーチャー2体なので選ぶ
    expect(s.active).toBe(0);
    expect(s.prompt?.title).toContain('賢きモスマン');
    await app.choose('賢きモスマン');
    await app.decide();
    s = await app.state();
    expect(s.turn).toBe(2);
    expect(s.active).toBeNull();
    expect(s.cards[mothman].counters['+1/+1']).toBe(2);
    expect(s.opponents[0]).toMatchObject({ life: 39, rad: 1 });
  }
});

test('唱えたときの誘発は呪文より先に解決する（流束の媒介者の増殖のあとに放射性降下物）。{T} を含む能力の発生源は自分のマナを使えない', async ({ app, page }) => {
  await app.start(MOTHMAN);
  await app.put('Flux Channeler', 'battlefield');
  await app.dispatch({ type: 'pool', color: 'B', delta: 2 }, { type: 'pool', color: 'C', delta: 1 });
  await app.act(await app.put('Nuclear Fallout', 'hand'), /唱える/);
  await app.choose('X=1');
  // 増殖の時点では誰も RAD を持たないので増えず、降下物で1個ずつ
  expect((await app.state()).opponents.map((o) => o.rad)).toEqual([1, 1, 1]);
  // カーンの拠点（{4},{T}）：ほかの土地が3枚では起動できない
  const bastion = await app.put("Karn's Bastion", 'battlefield');
  await app.lands('Island', 'Island', 'Island');
  await app.card(bastion).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '{4}：増殖' })).toHaveCount(0);
  await page.getByRole('button', { name: '閉じる' }).click();
  await app.lands('Forest');
  await app.act(bastion, '{4}：増殖');
  const s = await app.state();
  expect(s.opponents.map((o) => o.rad)).toEqual([2, 2, 2]);
  expect(s.zones.battlefield.map((id) => s.cards[id]).filter((c) => c.name !== 'Flux Channeler').every((c) => c.tapped)).toBe(true);
});

test('水のクリスタルの「4枚多く」は、0枚の切削には足さない', async ({ app }) => {
  await app.start(MOTHMAN);
  const crystal = await app.put('The Water Crystal', 'battlefield');
  for (const id of (await app.state()).zones.hand) await app.dispatch({ type: 'move', id, to: 'graveyard', trigger: false });
  await app.dispatch({ type: 'pool', color: 'U', delta: 2 }, { type: 'pool', color: 'C', delta: 4 }, { type: 'activate', id: crystal, index: 0 });
  expect((await app.state()).opponents.map((o) => o.library)).toEqual([92, 92, 92]);
});
