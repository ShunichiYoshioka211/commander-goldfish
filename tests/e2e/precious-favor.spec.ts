// いとしいしとの装備と、しっぺ返しのコピー。
import { expect, RIVALS, test, type App } from './fixtures';

const handSize = async (app: App) => (await app.state()).zones.hand.length;
const recent = async (app: App) => (await app.state()).recent.map((r) => r.label);
const MANUAL = '手動で処理する（起動型能力・対象を取る呪文など）';

test('いとしいしと：装備（{2}・2点）で印と詳細に出て、相手は装備したクリーチャーをブロックしない。クリーチャーが離れると外れる', async ({ app, page }) => {
  await app.start(RIVALS);
  const ingris = await app.put('Ingris Stingerquill', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  const mp = await app.put('My Precious // Allure of Power', 'battlefield');
  await app.lands('Swamp', 'Swamp');
  await app.endTurn();
  const [goblin] = await app.tokens('Goblin');
  await app.act(mp, '{2}：装備（2点のライフを支払う）');
  await expect(page.getByRole('dialog')).toContainText('いとしいしと：装備するクリーチャー');
  await app.choose('イングリス・スティンガークイル');
  let s = await app.state();
  expect([s.cards[mp].attachedTo, s.life]).toEqual([ingris, 38]);
  expect(s.log.some((l) => l.includes('いとしいしとをイングリス・スティンガークイルに装備'))).toBe(true);
  await expect(app.card(ingris).locator('.equip-badge')).toHaveText('装備');
  await expect(app.card(mp).locator('.equip-badge')).toHaveText('装備中');
  await expect(app.card(goblin).locator('.equip-badge')).toHaveCount(0);
  await app.card(ingris).click();
  await expect(page.getByTestId('equip-info')).toContainText('装備：いとしいしと');
  await expect(page.getByTestId('equip-info')).toContainText('（呪禁・ブロックされない）');
  await page.keyboard.press('Escape');
  await app.card(mp).click();
  await expect(page.getByTestId('equip-info')).toHaveText('装備先：イングリス・スティンガークイル');
  await page.keyboard.press('Escape');
  await app.card(goblin).click();
  await expect(page.getByTestId('equip-info')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // 蜘蛛（到達）は装備していなければ価値の大きいイングリスを止めるが、ブロックされないのでゴブリンを止める
  const spider = await app.rival(0, 'spider');
  await app.dispatch({ type: 'toCombat' }, { type: 'plan', id: ingris, opp: 0 }, { type: 'plan', id: goblin, opp: 0 }, { type: 'attack' });
  expect((await app.state()).blocks).toEqual({ [goblin]: [spider] });
  await app.dispatch({ type: 'damage' }, { type: 'endCombat' });
  // 攻撃時の1点×2体と、イングリスの戦闘ダメージ1点
  expect(await app.oppLife()).toEqual([37, 38, 38]);
  // 付け替える先のクリーチャーがいなければ、マナがあっても装備できない
  await app.dispatch({ type: 'pool', color: 'C', delta: 2 });
  await app.card(mp).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /装備/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // イングリスが戦場を離れると外れる
  await app.dispatch({ type: 'move', id: ingris, to: 'graveyard', trigger: true });
  s = await app.state();
  expect([s.cards[ingris].zone, s.cards[mp].attachedTo]).toEqual(['command', null]);
  await expect(app.card(mp).locator('.equip-badge')).toHaveCount(0);
});

test('いとしいしと：装備はメイン・フェイズだけ・ライフが2未満なら払えない。付け替えられ、相手は付いていない方をブロックする', async ({ app, page }) => {
  await app.start(RIVALS);
  await app.dispatch({ type: 'token', name: 'Goblin', count: 2 });
  const mp = await app.put('My Precious // Allure of Power', 'battlefield');
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp');
  await app.endTurn();
  const [g1, g2] = await app.tokens('Goblin');
  // ライフが2未満なら払えないので装備できない
  await app.dispatch({ type: 'life', delta: -39 });
  await app.card(mp).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /装備/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await app.dispatch({ type: 'life', delta: 39 });
  await app.act(mp, /装備/);
  await app.dispatch({ type: 'answer', values: [g2] });
  await app.act(mp, /装備/);
  // 付いている先は選べない
  expect((await app.state()).prompt!.options.map((o) => o.value)).toEqual([g1]);
  await app.dispatch({ type: 'answer', values: [g1] });
  expect([(await app.state()).cards[mp].attachedTo, (await app.state()).life]).toEqual([g1, 36]);
  // 戦闘中はマナがあっても装備できない
  await app.dispatch({ type: 'toCombat' }, { type: 'pool', color: 'C', delta: 2 });
  await app.card(mp).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /装備/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await app.dispatch({ type: 'pool', color: 'C', delta: -2 });
  // 同じ価値なら熊は並びが先の g1 を止めるが、g1 はブロックされないので g2 を止める
  const bear = await app.rival(0, 'bear');
  await app.dispatch({ type: 'planAll', opp: 0 }, { type: 'attack' });
  expect((await app.state()).blocks).toEqual({ [g2]: [bear] });
});

test('いとしいしと：クリーチャーでなくなった土地（不穏な火道）からはターンの終わりに外れ、クリーチャーからは外れない', async ({ app }) => {
  await app.start();
  const vents = await app.put('Restless Vents', 'battlefield');
  const mp = await app.put('My Precious // Allure of Power', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  const [goblin] = await app.tokens('Goblin');
  await app.dispatch({ type: 'pool', color: 'B', delta: 1 }, { type: 'pool', color: 'R', delta: 1 }, { type: 'pool', color: 'C', delta: 3 });
  await app.dispatch({ type: 'activate', id: vents, index: 0 });
  await app.act(mp, /装備/);
  await app.dispatch({ type: 'answer', values: [vents] });
  expect((await app.state()).cards[mp].attachedTo).toBe(vents);
  await app.endTurn();
  expect((await app.state()).cards[mp].attachedTo).toBeNull();
  await expect(app.card(vents).locator('.equip-badge')).toHaveCount(0);
  await app.dispatch({ type: 'pool', color: 'C', delta: 2 });
  await app.act(mp, /装備/);
  await app.dispatch({ type: 'answer', values: [goblin] });
  await app.endTurn();
  expect((await app.state()).cards[mp].attachedTo).toBe(goblin);
});

test('しっぺ返し：直前に解決した誘発をコピーする（同じ名前は1つにまとめる）。ほかの操作をするとコピーできず、対象の変更だけ唱えられる', async ({ app, page }) => {
  await app.start();
  await app.put('Ingris Stingerquill', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 2 });
  const rtf = await app.put('Return the Favor', 'hand');
  await app.lands('Mountain', 'Mountain', 'Mountain');
  await app.endTurn();
  // ターンの進行（ドロー・RADカウンター）はコピーの候補にならない
  expect(await recent(app)).toEqual([]);
  await app.dispatch({ type: 'toCombat' }, { type: 'planAll', opp: 0 }, { type: 'attack' });
  expect(await app.oppLife()).toEqual([37, 37, 37]);
  expect(await recent(app)).toEqual([
    'イングリス・スティンガークイル の攻撃：各対戦相手に1点',
    'ゴブリン の攻撃：各対戦相手に1点',
    'ゴブリン の攻撃：各対戦相手に1点',
  ]);
  // 4マナの「コピーと対象の変更」は、山3枚では唱えられない
  await app.card(rtf).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /唱える/ })).toHaveCount(2);
  await page.getByRole('dialog').getByRole('button', { name: '唱える：しっぺ返し（コピー）（{1}{R}{R}）' }).click();
  const prompt = (await app.state()).prompt!;
  expect([prompt.title, prompt.options.map((o) => o.label)]).toEqual([
    'しっぺ返し：コピーする誘発型能力か呪文',
    ['イングリス・スティンガークイル の攻撃：各対戦相手に1点', 'ゴブリン の攻撃：各対戦相手に1点', MANUAL],
  ]);
  await app.choose('ゴブリン の攻撃：各対戦相手に1点');
  let s = await app.state();
  expect(s.opponents.map((o) => o.life)).toEqual([36, 36, 36]);
  expect(s.log.some((l) => l.includes('しっぺ返しで「ゴブリン の攻撃：各対戦相手に1点」をコピー'))).toBe(true);
  // ほかの操作（ここでは編集で手札に戻す）をすると記録は消える。コピーの面は唱えられるが、選べるのは「手動で処理する」だけ
  await app.put('Return the Favor', 'hand');
  expect(await recent(app)).toEqual([]);
  await app.dispatch({ type: 'pool', color: 'R', delta: 2 }, { type: 'pool', color: 'C', delta: 1 });
  await app.act(rtf, '唱える：しっぺ返し（コピー）（{1}{R}{R}）');
  expect((await app.state()).prompt!.options.map((o) => o.label)).toEqual([MANUAL]);
  await app.choose(MANUAL);
  s = await app.state();
  expect([s.cards[rtf].zone, s.opponents[0].life]).toEqual(['graveyard', 36]);
  expect(s.log.some((l) => l.includes('しっぺ返しのコピーは手動で処理する'))).toBe(true);
  // 対象の変更は何もしない（手動）
  await app.put('Return the Favor', 'hand');
  await app.dispatch({ type: 'pool', color: 'R', delta: 2 }, { type: 'pool', color: 'C', delta: 1 });
  await app.act(rtf, '唱える：しっぺ返し（対象の変更）（{1}{R}{R}）');
  s = await app.state();
  expect([s.prompt, s.cards[rtf].zone, s.opponents[0].life]).toEqual([null, 'graveyard', 36]);
});

test('しっぺ返し：エンバレスの宮廷のアップキープの誘発を、宮廷の誘発ごとコピーする（マナを出しても記録は消えない）', async ({ app }) => {
  await app.start();
  await app.put('Court of Embereth', 'battlefield', true);
  const rtf = await app.put('Return the Favor', 'hand');
  await app.lands('Mountain', 'Mountain', 'Mountain', 'Mountain');
  await app.endTurn();
  // 騎士1体を出して1点ずつ。後半のダメージだけはコピーの候補に出さない
  expect(await app.oppLife()).toEqual([39, 39, 39]);
  expect(await recent(app)).toEqual(['エンバレスの宮廷']);
  const s = await app.state();
  const mountain = s.zones.battlefield.find((id) => s.cards[id].name === 'Mountain')!;
  await app.dispatch({ type: 'tapMana', id: mountain, option: 0 });
  expect(await recent(app)).toEqual(['エンバレスの宮廷']);
  await app.act(rtf, /しっぺ返し（コピーと対象の変更）/);
  await app.choose('エンバレスの宮廷');
  // 騎士がもう1体出て、2体ぶんの2点
  expect(await app.oppLife()).toEqual([37, 37, 37]);
  expect(await app.tokens('Knight')).toHaveLength(2);
});

test('しっぺ返し：直前に解決したインスタントもコピーできる（追加コストは払い直さない）。対象を取る呪文はコピーできない', async ({ app }) => {
  await app.start(RIVALS);
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  const dd = await app.put('Deadly Dispute', 'hand');
  const rtf = await app.put('Return the Favor', 'hand');
  const grasp = await app.put('Infernal Grasp', 'hand');
  await app.rival(0, 'bear');
  await app.dispatch({ type: 'pool', color: 'B', delta: 1 }, { type: 'pool', color: 'C', delta: 1 });
  const before = await handSize(app);
  await app.act(dd, /唱える/);
  await app.choose('ゴブリン');
  expect(await handSize(app)).toBe(before + 1);
  expect(await recent(app)).toEqual(['命取りの論争（呪文）']);
  // マナを足しても記録は残る
  await app.dispatch({ type: 'pool', color: 'R', delta: 2 }, { type: 'pool', color: 'C', delta: 1 });
  await app.act(rtf, /しっぺ返し（コピー）/);
  await app.choose('命取りの論争（呪文）');
  // さらに2枚引いて宝物がもう1つ。生け贄にするものはもういないが、コピーは追加コストを払わない
  expect(await handSize(app)).toBe(before + 2);
  expect(await app.tokens('Treasure')).toHaveLength(2);
  // 対象を取る冥府の掌握は、解決しても記録に残らない
  await app.dispatch({ type: 'pool', color: 'B', delta: 1 }, { type: 'pool', color: 'C', delta: 1 });
  await app.act(grasp, /唱える/);
  await app.choose('相手1の 熊 2/2');
  const s = await app.state();
  expect([s.opponents[0].board, s.recent]).toEqual([[], []]);
});
