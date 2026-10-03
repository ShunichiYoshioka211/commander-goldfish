// 相手ありモード。準備は ?rivals=1&seat=1&seed=1（1番手で、相手の1ターン目は何も出さない）と app.rival・app.put で行う。
import { expect, RIVALS, test, type App } from './fixtures';

/** トークンを出して1ターン進め、召喚酔いを解く（シード1の相手は1ターン目に何も出さないので、盤面は空のまま） */
async function readyTokens(app: App, name: string, count = 1) {
  await app.dispatch({ type: 'token', name, count });
  await app.endTurn();
  return app.tokens(name);
}

/** 戦闘へ進み、指定したクリーチャーだけで対戦相手 opp を攻撃する */
async function attackWith(app: App, ids: string[], opp = 0) {
  await app.dispatch({ type: 'toCombat' }, ...ids.map((id) => ({ type: 'plan' as const, id, opp })), { type: 'attack' });
}

const handSize = async (app: App) => (await app.state()).zones.hand.length;

test('相手あり／なしの切り替え：同じシードの新しい対局になり、性格と席が出る。モードは保存され、引き継がれる', async ({ app, page }) => {
  await app.open('seed=5&images=0');
  await expect(page.locator('.rival-board')).toHaveCount(0);
  await expect(page.getByTestId('seat')).toHaveCount(0);
  const hand = (await app.state()).zones.hand;
  await page.getByLabel('対戦相手', { exact: true }).selectOption('1');
  let s = await app.state();
  expect(s.rivals).not.toBeNull();
  expect(s.seed).toBe(5);
  expect(s.zones.hand).toEqual(hand);
  // シード5：あなたは1番手、相手はコントロール・トークン・トークン
  await expect(page.getByTestId('seat')).toHaveText('あなたは1番手');
  await expect(page.getByTestId('opp0')).toContainText('対戦相手1・コントロール');
  await expect(page.getByTestId('opp1')).toContainText('トークン');
  await expect(page.getByTestId('opp0').locator('.rival-chips')).toContainText('クリーチャーなし');
  // 相手の欄に英字が出ない
  expect(await page.locator('.opponents').innerText()).not.toMatch(/[A-Za-z]/);
  await page.getByRole('button', { name: 'ログ' }).click();
  await expect(page.getByTestId('log')).toContainText('相手あり：あなたは1番手（相手1 コントロール・相手2 トークン・相手3 トークン）');
  await page.keyboard.press('Escape');
  // 保存され、次に開いたときも相手あり。URL の ?rivals=0 が優先。?seat= は 1〜4 だけ（それ以外はシードで決める）
  await app.open('seed=5&images=0');
  expect((await app.state()).rivals).not.toBeNull();
  await app.open('seed=5&images=0&seat=9');
  await expect(page.getByTestId('seat')).toHaveText('あなたは1番手');
  await app.open('seed=5&images=0&seat=3');
  await expect(page.getByTestId('seat')).toHaveText('あなたは3番手');
  await app.open('seed=5&images=0&rivals=0');
  expect((await app.state()).rivals).toBeNull();
  await app.open('seed=5&images=0');
  // 新しいゲーム・同じシード・デッキの切り替えは、いまのモードを引き継ぐ
  await page.getByRole('button', { name: '新しいゲーム' }).click();
  expect((await app.state()).rivals).not.toBeNull();
  await page.getByRole('button', { name: '同じシード' }).click();
  await page.getByLabel('デッキ').selectOption('test-goblins');
  s = await app.state();
  expect([s.deckId, s.rivals !== null]).toEqual(['test-goblins', true]);
  await page.getByLabel('対戦相手', { exact: true }).selectOption('0');
  s = await app.state();
  expect([s.deckId, s.rivals]).toEqual(['test-goblins', null]);
  await expect(page.locator('.rival-board')).toHaveCount(0);
});

test('ターン終了で相手の盤面が育つ（前の席の相手が先に動く・要約とログ・元に戻せる・同じシードなら同じ盤面）', async ({ app, page }) => {
  // シード6：相手はアグロ・ミッドレンジ・ミッドレンジ。3番手なので、相手2・3はキープのあと先に1ターン進む
  const query = 'rivals=1&seat=3&seed=6&images=0';
  await app.start(query);
  let s = await app.state();
  expect(s.rivals!.turns).toEqual([0, 1, 1]);
  expect(s.rivals!.recap).toEqual(['', '動きなし', '動きなし']);
  await expect(page.getByTestId('opp1').locator('.recap')).toHaveText('動きなし');
  await expect(page.getByTestId('opp0').locator('.recap')).toHaveCount(0);
  // ターン終了をまたいで元に戻す・やり直す
  const before = JSON.stringify((await app.state()).opponents);
  await app.dispatch({ type: 'endTurn' });
  expect((await app.state()).rivals!.turns).toEqual([1, 2, 2]);
  await page.getByRole('button', { name: '元に戻す' }).click();
  expect(JSON.stringify((await app.state()).opponents)).toBe(before);
  await page.getByRole('button', { name: 'やり直す' }).click();
  for (let i = 0; i < 4; i++) await app.endTurn();
  s = await app.state();
  expect(s.rivals!.turns).toEqual([5, 6, 6]);
  expect(s.active).toBeNull();
  const ids = s.opponents.flatMap((o) => o.board.map((p) => p.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(s.opponents.every((o) => o.board.length <= 8)).toBe(true);
  expect(ids.length).toBeGreaterThan(3);
  expect(s.log.some((l) => l.includes('［相手1のターン5］'))).toBe(true);
  expect(s.rivals!.recap.every((r) => r.length > 0)).toBe(true);
  // 同じシードで同じように進めると、同じ盤面になる
  await app.start(query);
  for (let i = 0; i < 5; i++) await app.endTurn();
  expect(JSON.stringify((await app.state()).opponents)).toBe(JSON.stringify(s.opponents));
});

test('作り直し：その相手のターン数ぶん育て直し（統率者も出る）、同じ条件なら同じ盤面になる', async ({ app, page }) => {
  await app.start(RIVALS);
  for (let i = 0; i < 5; i++) await app.endTurn();
  await page.getByRole('button', { name: '編集モード' }).click();
  const toolbar = page.getByTestId('edit-toolbar');
  await toolbar.getByRole('button', { name: '相手の盤面を作り直す' }).click();
  const a = await app.state();
  expect(a.rivals!.rebuilds).toBe(3);
  // 統率者は登場ターン（ミッドレンジ・トークンは4）に出る。消耗で倒れていることもあるので、少なくとも1人
  expect(a.opponents.some((o) => o.board.some((p) => p.kind.startsWith('cmd')))).toBe(true);
  await expect(page.locator('.opponents')).toContainText('★統率者');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await toolbar.getByRole('button', { name: '相手の盤面を作り直す' }).click();
  expect((await app.state()).opponents).toEqual(a.opponents);
  // 相手ごとの作り直しは一覧から
  await page.getByRole('button', { name: /^対戦相手2のクリーチャー/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'この相手の盤面を作り直す' }).click();
  const b = await app.state();
  expect(b.rivals!.rebuilds).toBe(4);
  expect(b.opponents[0]).toEqual(a.opponents[0]);
});

test('ブロックの前で止まり、「ブロックへ」で熊がゴブリンを止める。ブロックの印・一覧・ダメージ', async ({ app, page }) => {
  await app.start(RIVALS);
  const [goblin] = await readyTokens(app, 'Goblin');
  await app.lands('Swamp', 'Swamp');
  await app.put('Infernal Grasp', 'hand');
  const bear = await app.rival(0, 'bear');
  await app.attackAll();
  expect((await app.state()).phase).toBe('declared');
  await expect(page.getByTestId('turn')).toContainText('戦闘（ブロック前）');
  await expect(page.locator('.controls')).toContainText('ブロックの前。インスタントで相手のクリーチャーを除去できる');
  await page.getByRole('button', { name: 'ブロックへ' }).click();
  expect((await app.state()).blocks).toEqual({ [goblin]: bear });
  await expect(app.card(goblin).locator('.block-badge')).toHaveText('ブロック');
  await expect(page.getByTestId('block-list')).toContainText('ゴブリン ← 熊 2/2（相手1）');
  await expect(app.chip(bear)).toHaveClass(/blocking/);
  await page.getByRole('button', { name: '戦闘ダメージ' }).click();
  const s = await app.state();
  expect(s.cards[goblin]).toBeUndefined();
  expect(s.opponents[0].board[0].damage).toBe(1);
  expect(s.opponents[0].life).toBe(40);
  await expect(app.chip(bear)).toContainText('2/2（1）');
  // ダメージはクリンナップで消える
  await app.dispatch({ type: 'endCombat' });
  await app.endTurn();
  expect((await app.state()).opponents[0].board.find((p) => p.id === bear)!.damage).toBe(0);
});

test('ブロックの前に冥府の掌握で熊を除去すれば、ゴブリンは通る。応答手段かブロッカーが無ければ止まらない', async ({ app, page }) => {
  await app.start(RIVALS);
  const [goblin] = await readyTokens(app, 'Goblin');
  await app.lands('Swamp', 'Swamp');
  const grasp = await app.put('Infernal Grasp', 'hand');
  await app.rival(0, 'bear');
  await app.attackAll();
  await app.act(grasp, /唱える/);
  // 対象：相手のクリーチャーはチップ、自分のクリーチャーはカードの絵
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.rival-choice')).toHaveCount(1);
  await expect(dialog.locator('.card-choice')).toHaveCount(1);
  await app.choose('相手1の 熊 2/2');
  let s = await app.state();
  expect(s.opponents[0].board).toEqual([]);
  expect(s.life).toBe(38);
  await page.getByRole('button', { name: 'ブロックへ' }).click();
  await expect(page.locator('.controls')).toContainText('ブロックされなかった');
  await page.getByRole('button', { name: '戦闘ダメージ' }).click();
  expect((await app.oppLife())[0]).toBe(39);
  expect((await app.state()).cards[goblin].zone).toBe('battlefield');

  // 応答手段が無い（マナが無い）ときは止まらない
  await app.start(RIVALS);
  const [g2] = await readyTokens(app, 'Goblin');
  const bear2 = await app.rival(0, 'bear');
  await app.attackAll();
  s = await app.state();
  expect(s.phase).toBe('attacking');
  expect(s.blocks).toEqual({ [g2]: bear2 });

  // ブロッカーがいないときも止まらない
  await app.start(RIVALS);
  await readyTokens(app, 'Goblin');
  await app.lands('Swamp', 'Swamp');
  await app.put('Infernal Grasp', 'hand');
  await app.attackAll();
  expect((await app.state()).phase).toBe('attacking');
});

test('トーブランがいると熊はゴブリンを止めない。チャンプブロックした熊に憤怒獣は4点、本体に5点', async ({ app }) => {
  await app.start(RIVALS);
  const [goblin] = await readyTokens(app, 'Goblin');
  await app.put('Torbran, Thane of Red Fell', 'battlefield');
  await app.rival(0, 'bear');
  await attackWith(app, [goblin]);
  expect((await app.state()).blocks).toEqual({});
  await app.dispatch({ type: 'damage' });
  expect((await app.oppLife())[0]).toBe(37);

  await app.start(RIVALS);
  await app.put('Torbran, Thane of Red Fell', 'battlefield');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -33 }, { type: 'token', name: 'Lightning Rager', count: 1 });
  const [rager] = await app.tokens('Lightning Rager');
  const bear = await app.rival(0, 'bear');
  await attackWith(app, [rager]);
  expect((await app.state()).blocks).toEqual({ [rager]: bear });
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  expect(s.opponents[0].life).toBe(2);
  expect(s.opponents[0].board).toEqual([]);
  expect(s.log.some((l) => l.includes('稲妻の憤怒獣 → 相手1の熊 に 4点'))).toBe(true);
  expect(s.cards[rager]).toBeUndefined();
});

test('飛行・到達・威迫：イングリスは蜘蛛が止めて熊は止めない。海賊と不穏な火道（威迫）は壁でも止めない', async ({ app }) => {
  await app.start(RIVALS);
  const ingris = await app.put('Ingris Stingerquill', 'battlefield');
  const vents = await app.put('Restless Vents', 'battlefield');
  await app.endTurn();
  await app.dispatch({ type: 'token', name: 'Pirate', count: 1 });
  const [pirate] = await app.tokens('Pirate');
  await app.dispatch({ type: 'pool', color: 'B', delta: 1 }, { type: 'pool', color: 'R', delta: 1 }, { type: 'pool', color: 'C', delta: 1 });
  await app.dispatch({ type: 'activate', id: vents, index: 0 });
  await app.rival(0, 'bear');
  const spider = await app.rival(0, 'spider');
  await app.rival(1, 'wall');
  await app.dispatch({ type: 'toCombat' }, { type: 'plan', id: ingris, opp: 0 }, { type: 'plan', id: pirate, opp: 1 }, { type: 'plan', id: vents, opp: 1 }, { type: 'attack' });
  expect((await app.state()).blocks).toEqual({ [ingris]: spider });
  await app.dispatch({ type: 'damage' });
  // イングリスの攻撃時の1点×3体ぶんと、海賊1点・火道2点
  expect(await app.oppLife()).toEqual([37, 34, 37]);
});

test('壁はゴブリンを止める（倒せなくても生き残る）。ブロックが多いと「ほか N 件」', async ({ app, page }) => {
  await app.start(RIVALS);
  await readyTokens(app, 'Goblin', 5);
  for (let i = 0; i < 5; i++) await app.rival(0, 'wall');
  await app.attackAll();
  expect(Object.keys((await app.state()).blocks)).toHaveLength(5);
  await expect(page.getByTestId('block-list')).toContainText('ほか 1 件');
  await expect(page.getByTestId('block-list')).toContainText('ゴブリン ← 壁 0/4 防衛（相手1）');
  // 同じ種類・同じ状態のものは1つのチップにまとめる
  await expect(page.getByTestId('opp0').locator('.chip-count')).toHaveText('×5');
  await app.dispatch({ type: 'damage' });
  expect((await app.oppLife())[0]).toBe(40);
});

test('接死の蛇は獣も倒す。致死ならチャンプブロックする（価値の小さいものから。ライフでも統率者ダメージでも）', async ({ app }) => {
  await app.start(RIVALS);
  const [snake] = await readyTokens(app, 'Snake');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -39 });
  const beast = await app.rival(0, 'beast');
  const wall = await app.rival(0, 'wall');
  // 獣は蛇と相討ち、壁は蛇に倒されるだけなので、普通はどちらも止めない。通すと致死なので、価値の小さい壁でチャンプブロックする
  await app.attackAll();
  expect((await app.state()).blocks).toEqual({ [snake]: wall });
  await app.dispatch({ type: 'damage' });
  let s = await app.state();
  expect(s.opponents[0].board.map((p) => p.id)).toEqual([beast]);
  expect(s.opponents[0].life).toBe(1);
  expect(s.cards[snake].zone).toBe('battlefield');
  // 次のターン：相手1を獣だけにすると、獣がチャンプブロックし、接死で獣も倒れる
  await app.dispatch({ type: 'endCombat' });
  await app.endTurn();
  for (const p of (await app.state()).opponents[0].board) await app.dispatch({ type: 'rivalRemove', opp: 0, id: p.id, trigger: false });
  const beast2 = await app.rival(0, 'beast');
  await attackWith(app, [snake]);
  expect((await app.state()).blocks).toEqual({ [snake]: beast2 });
  await app.dispatch({ type: 'damage' });
  s = await app.state();
  expect(s.opponents[0].board).toEqual([]);
  expect(s.cards[snake]).toBeUndefined();

  // 統率者ダメージ20の相手は、イングリスの1点も通せないので鳥でチャンプブロックする（普通は止めない）
  await app.start(RIVALS);
  const ingris = await app.put('Ingris Stingerquill', 'battlefield');
  await app.endTurn();
  await app.dispatch({ type: 'cmdDamage', opp: 0, delta: 20 });
  const bird = await app.rival(0, 'bird');
  await attackWith(app, [ingris]);
  expect((await app.state()).blocks).toEqual({ [ingris]: bird });
  await app.dispatch({ type: 'damage' });
  s = await app.state();
  expect(s.opponents[0].commanderDamage).toBe(20);
  expect(s.opponents[0].board).toEqual([]);
});

test('相手の天使の絆魂でライフが増え、イングリスは倒されて統率領域へ。パワー0の攻撃はダメージを与えない', async ({ app }) => {
  await app.start(RIVALS);
  const ingris = await app.put('Ingris Stingerquill', 'battlefield');
  await app.endTurn();
  const angel = await app.rival(0, 'angel');
  await attackWith(app, [ingris]);
  expect((await app.state()).blocks).toEqual({ [ingris]: angel });
  await app.dispatch({ type: 'damage' });
  let s = await app.state();
  // 攻撃時の1点で39、天使の絆魂で+4
  expect(s.opponents[0].life).toBe(43);
  expect(s.cards[ingris].zone).toBe('command');
  expect(s.opponents[0].board[0].damage).toBe(1);

  // トーブランがいても、0点のダメージには増幅が乗らない（熊は生き残って倒せるので止める）
  await app.start(RIVALS);
  await app.put('Torbran, Thane of Red Fell', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Phyrexian Horror', count: 1 });
  const [horror] = await app.tokens('Phyrexian Horror');
  const bear = await app.rival(0, 'bear');
  await app.attackAll();
  expect((await app.state()).blocks).toEqual({ [horror]: bear });
  await app.dispatch({ type: 'damage' });
  s = await app.state();
  expect(s.opponents[0].board[0].damage).toBe(0);
  expect(s.cards[horror]).toBeUndefined();
});

test('ブロックのあとにブロッカーを除去すると、トランプルの無いものは0点、トランプルは全点が本体へ', async ({ app, page }) => {
  await app.start(RIVALS);
  const [goblin] = await readyTokens(app, 'Goblin');
  await app.dispatch({ type: 'token', name: 'Lightning Rager', count: 1 }, { type: 'oppLife', opp: 0, delta: -35 });
  const [rager] = await app.tokens('Lightning Rager');
  const bear = await app.rival(0, 'bear');
  const knight = await app.rival(0, 'knight');
  await app.attackAll();
  // 熊はゴブリンを止め、騎士は（通すと致死なので）憤怒獣をチャンプブロックする
  expect((await app.state()).blocks).toEqual({ [goblin]: bear, [rager]: knight });
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp');
  await app.act(await app.put('Infernal Grasp', 'hand'), /唱える/);
  await app.choose('相手1の 熊');
  await app.act(await app.put('Bitter Triumph', 'hand'), /唱える/);
  await app.choose('相手1の 騎士');
  await app.choose('3点のライフを支払う');
  await expect(page.getByTestId('block-list')).toContainText('ゴブリン ← （除去済み）');
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  // ゴブリンはブロックされたままなので0点、憤怒獣はトランプルなので5点すべてが本体へ
  expect(s.opponents[0].life).toBe(0);
  expect(s.cards[goblin].zone).toBe('battlefield');
});

test('ブロックされたトークンを村の儀式で生け贄にするとガルナで引ける。ガルナと同時に死んだトークンでも引ける', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Garna, Bloodfist of Keld', 'battlefield');
  const [goblin] = await readyTokens(app, 'Goblin');
  await app.lands('Swamp');
  const rites = await app.put('Village Rites', 'hand');
  const bear = await app.rival(0, 'bear');
  await attackWith(app, [goblin]);
  // 村の儀式を唱えられるので、ブロックの前で止まる
  expect((await app.state()).phase).toBe('declared');
  await app.dispatch({ type: 'toBlocks' });
  expect((await app.state()).blocks).toEqual({ [goblin]: bear });
  const hand = await handSize(app);
  await app.act(rites, /唱える/);
  await app.choose('ゴブリン');
  // 村の儀式で2枚、攻撃中のゴブリンが死んだのでガルナで1枚
  expect(await handSize(app)).toBe(hand - 1 + 3);

  // ガルナを獣が（相討ち）、ゴブリンを熊が止め、どちらも同時に死ぬ
  await app.start(RIVALS);
  const garna = await app.put('Garna, Bloodfist of Keld', 'battlefield');
  const [goblin2] = await readyTokens(app, 'Goblin');
  const beast = await app.rival(0, 'beast');
  const bear2 = await app.rival(0, 'bear');
  await attackWith(app, [garna, goblin2]);
  expect((await app.state()).blocks).toEqual({ [garna]: beast, [goblin2]: bear2 });
  const before = await handSize(app);
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  expect(s.cards[garna].zone).toBe('graveyard');
  expect(s.cards[goblin2]).toBeUndefined();
  expect(s.opponents[0].board.map((p) => p.id)).toEqual([bear2]);
  expect(s.zones.hand.length).toBe(before + 1);
});

test('冒涜の行動：相手のクリーチャーも数えて軽くなり、相手の盤面も流す。病的な日和見主義者は1枚だけ', async ({ app }) => {
  await app.start(RIVALS);
  await app.lands('Mountain', 'Mountain', 'Mountain');
  await app.put('Morbid Opportunist', 'battlefield');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 2 });
  const act = await app.put('Blasphemous Act', 'hand');
  // 自分の3体だけなら {5}{R} で、3マナでは唱えられない
  await app.card(act).click();
  await expect(app.page.getByRole('dialog').getByRole('button', { name: /唱える/ })).toHaveCount(0);
  await app.page.getByRole('button', { name: '閉じる' }).click();
  await app.rival(0, 'beast');
  await app.rival(1, 'wall');
  await app.rival(2, 'soldier');
  const hand = await handSize(app);
  await app.act(act, /唱える/);
  const s = await app.state();
  expect(s.opponents.every((o) => o.board.length === 0)).toBe(true);
  expect(s.flags.creaturesDied).toBe(6);
  // 冒涜の行動を唱えて -1、日和見主義者で +1
  expect(s.zones.hand.length).toBe(hand);
});

test('除去：対象は唱えるときに選ぶ。大群への給餌は相手のクリーチャーだけ・マナ総量ぶん失う。自分のものも壊せる', async ({ app, page }) => {
  await app.start(RIVALS);
  await app.lands('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp');
  const feed = await app.put('Feed the Swarm', 'hand');
  await app.dispatch({ type: 'token', name: 'Goblin', count: 1 });
  // 相手のクリーチャーがいなければ唱えられない
  await app.card(feed).click();
  await expect(page.getByRole('dialog')).toContainText('相手ありモードで自動処理');
  await expect(page.getByRole('dialog').getByRole('button', { name: /唱える/ })).toHaveCount(0);
  await page.getByRole('button', { name: '閉じる' }).click();
  await app.rival(0, 'knight');
  await app.act(feed, /唱える/);
  await expect(page.getByRole('dialog').locator('.card-choice')).toHaveCount(0);
  await app.choose('相手1の 騎士 3/2');
  let s = await app.state();
  expect(s.life).toBe(37);
  expect(s.opponents[0].board).toEqual([]);
  // 冥府の掌握で自分のゴブリンを壊す（2点失う）
  const [goblin] = await app.tokens('Goblin');
  await app.act(await app.put('Infernal Grasp', 'hand'), /唱える/);
  await app.choose('ゴブリン');
  s = await app.state();
  expect(s.cards[goblin]).toBeUndefined();
  expect(s.life).toBe(35);
  // 萎縮させる責め苦は自分のエンチャントも対象にできる
  const tremors = await app.put('Impact Tremors', 'battlefield');
  await app.act(await app.put('Withering Torment', 'hand'), /唱える/);
  await app.choose('衝撃の震え');
  s = await app.state();
  expect(s.cards[tremors].zone).toBe('graveyard');
  expect(s.life).toBe(33);
  // 苦々しい勝利は対象を選んでから追加コスト。相手の統率者を壊すと統率領域に戻ったとみなし、出し直しの数を数える
  await app.rival(1, 'cmdMidrange');
  await app.dispatch({ type: 'pool', color: 'B', delta: 2 });
  await app.act(await app.put('Bitter Triumph', 'hand'), /唱える/);
  await expect(page.getByRole('dialog')).toHaveAccessibleName('苦々しい勝利 の対象');
  await app.choose('相手2の ★統率者 4/4 飛行');
  await expect(page.getByRole('dialog')).toHaveAccessibleName(/追加コスト/);
  await app.choose('3点のライフを支払う');
  s = await app.state();
  expect(s.opponents[1].board).toEqual([]);
  expect(s.life).toBe(30);
  expect(s.rivals!.cmdCasts[1]).toBe(1);
  // 相手2はまだ1ターンも終えていないので、出し直しは本来の登場ターン（4）より早まらない（遅れ方は commanderLeft のユニットテスト）
  expect(s.rivals!.cmdReady[1]).toBe(4);
});

test('自分のターンに使った病的な日和見主義者が、相手のターンの消耗でもう一度引ける', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Morbid Opportunist', 'battlefield');
  // 自分のターンに相手のクリーチャーを1体倒して、1回使っておく
  const target = await app.rival(0, 'bear');
  await app.dispatch({ type: 'rivalRemove', opp: 0, id: target, trigger: true });
  expect((await app.state()).flags.morbidUsed).toBe(true);
  // 消耗が起きるよう、相手の盤面を埋めておく（同じシードなので結果は決まっている）
  for (const opp of [0, 1, 2]) for (let i = 0; i < 8; i++) await app.rival(opp, 'soldier');
  await app.endTurn();
  const s = await app.state();
  const deaths = [1, 2, 3].filter((n) => s.log.some((l) => l.startsWith('T1') && l.includes(`［相手${n}のターン1］`) && l.includes('倒れた')));
  expect(deaths.length).toBeGreaterThan(0);
  // 手札を7枚に捨てたあと、消耗があった相手のターンごとに1枚、自分のドローで1枚
  expect(s.zones.hand.length).toBe(7 + deaths.length + 1);
  // 8体いる相手はそれ以上出さない
  expect(s.opponents.every((o) => o.board.length <= 8)).toBe(true);
});

test('手札が8枚以上でターンを終えても、捨てたあとに相手のターンが進む。脱落した相手は動かない', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Swamp', 'hand');
  await app.put('Mountain', 'hand');
  await app.dispatch({ type: 'oppLife', opp: 2, delta: -40 }, { type: 'endTurn' });
  let s = await app.state();
  expect(s.prompt?.title).toContain('手札が多い');
  await app.dispatch({ type: 'answer', values: s.zones.hand.slice(0, 2) });
  s = await app.state();
  expect(s.turn).toBe(2);
  expect(s.rivals!.turns).toEqual([1, 1, 0]);
  await expect(app.page.getByTestId('opp2')).toHaveClass(/dead/);
});

test('編集：相手に出す・タップ・取り除く（誘発あり／なし）・ブロックを外す・全クリーチャー破壊、一覧の開閉', async ({ app, page }) => {
  await app.start(RIVALS);
  await app.put('Morbid Opportunist', 'battlefield');
  await page.getByRole('button', { name: '編集モード' }).click();
  const toolbar = page.getByTestId('edit-toolbar');
  await expect(toolbar.getByLabel('相手のクリーチャーの種類')).toContainText('★統率者 3/3 トランプル（アグロ）');
  await toolbar.getByLabel('相手のクリーチャーの種類').selectOption('beast');
  await toolbar.getByLabel('出す相手').selectOption('1');
  await toolbar.getByRole('button', { name: '相手に出す' }).click();
  await toolbar.getByRole('button', { name: '相手に出す' }).click();
  let s = await app.state();
  expect(s.opponents[1].board.map((p) => p.kind)).toEqual(['beast', 'beast']);
  await expect(page.getByTestId('opp1').locator('.chip-count')).toHaveText('×2');
  // 一覧を開く（閉じるボタン・背景・Esc で閉じる）
  const open = () => page.getByRole('button', { name: /^対戦相手2のクリーチャー/ }).click();
  await open();
  const viewer = page.getByRole('dialog', { name: '対戦相手2のクリーチャー' });
  await expect(viewer).toContainText('対戦相手2・ミッドレンジ（2体）');
  await expect(viewer).toContainText('能力なし');
  await expect(viewer).toContainText('召喚酔い');
  await viewer.getByRole('button', { name: 'タップ', exact: true }).first().click();
  await expect(viewer).toContainText('タップ・召喚酔い');
  await expect(app.chip(s.opponents[1].board[0].id)).toHaveClass(/tapped/);
  await viewer.getByRole('button', { name: 'アンタップ' }).click();
  // 誘発なしで取り除く：日和見主義者は引かない
  const hand = await handSize(app);
  await viewer.getByRole('button', { name: '取り除く' }).first().click();
  expect(await handSize(app)).toBe(hand);
  // 誘発ありで取り除く：死亡として扱う
  await viewer.getByRole('button', { name: '閉じる' }).click();
  await toolbar.getByLabel('移動で誘発させる').check();
  await open();
  await viewer.getByRole('button', { name: '取り除く' }).click();
  expect(await handSize(app)).toBe(hand + 1);
  await expect(viewer.locator('.rival-list tr')).toHaveCount(0);
  await viewer.getByRole('button', { name: '閉じる' }).click();
  await expect(viewer).toHaveCount(0);
  await open();
  await page.locator('.modal-back').first().dispatchEvent('pointerdown');
  await expect(viewer).toHaveCount(0);
  await open();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await page.keyboard.press('Escape');

  // ブロックを外す（いとしいしとの装備など、近似で扱えないものの逃げ道）
  await toolbar.getByLabel('移動で誘発させる').uncheck();
  await page.getByRole('button', { name: '編集モード' }).click();
  const [goblin] = await readyTokens(app, 'Goblin');
  const wall = await app.rival(0, 'wall');
  await attackWith(app, [goblin]);
  await app.dispatch({ type: 'damage' });
  // ダメージを受けてブロック中の壁を一覧で見る
  await page.getByRole('button', { name: /^対戦相手1のクリーチャー/ }).click();
  await expect(page.getByRole('dialog')).toContainText('防衛：攻撃しない（ブロックはする）');
  await expect(page.getByRole('dialog')).toContainText('召喚酔い・ブロック中・1点のダメージ');
  await expect(page.getByRole('dialog')).toContainText('直前のターン：動きなし');
  await page.keyboard.press('Escape');
  expect((await app.oppLife())[0]).toBe(40);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.getByRole('button', { name: '編集モード' }).click();
  await app.act(goblin, 'ブロックを外す');
  expect((await app.state()).blocks).toEqual({});
  await app.dispatch({ type: 'damage' });
  expect((await app.oppLife())[0]).toBe(39);
  expect((await app.state()).opponents[0].board.map((p) => p.id)).toEqual([wall]);
  // 全クリーチャー破壊は相手のクリーチャーも壊す
  await toolbar.getByRole('button', { name: '全クリーチャー破壊' }).click();
  expect((await app.state()).opponents[0].board).toEqual([]);
});

test('記録はモードで分かれ、結果画面にモードが出る。脱落した相手の盤面は除かれる', async ({ app, page }) => {
  await app.start('seed=1&images=0');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 1, delta: -40 }, { type: 'oppLife', opp: 2, delta: -40 });
  await expect(page.getByRole('dialog', { name: '結果' })).toContainText('相手なし');
  await page.getByRole('dialog', { name: '結果' }).getByRole('button', { name: '閉じる' }).click();
  await page.getByLabel('対戦相手', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'キープ' }).click();
  await page.getByRole('button', { name: '記録' }).click();
  await expect(page.getByTestId('stats')).toContainText('これまでの記録（相手あり・平均キルターン —）');
  await page.keyboard.press('Escape');
  await app.rival(0, 'bear');
  await app.rival(2, 'wall');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 }, { type: 'oppLife', opp: 1, delta: -40 }, { type: 'oppLife', opp: 2, delta: -40 });
  const result = page.getByRole('dialog', { name: '結果' });
  await expect(result).toContainText(/相手あり・\d番手/);
  await result.getByRole('button', { name: 'ダメージを見る' }).click();
  await expect(page.getByTestId('stats')).toContainText('これまでの記録（相手あり・平均キルターン 1.0）');
  const results = await page.evaluate(() => JSON.parse(localStorage.getItem('goldfish.results')!));
  expect(results.map((r: { rivals: boolean }) => r.rivals)).toEqual([false, true]);
  // 脱落した相手の盤面は除かれる
  expect((await app.state()).opponents.every((o) => o.board.length === 0)).toBe(true);
});

test('戦闘ダメージは同時：相手のライフが途中で0になっても、その相手のブロックは行われる（ガルナで引ける）', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Garna, Bloodfist of Keld', 'battlefield');
  // 騎士（3/1）を先に、ゴブリン（1/1）をあとに出す。戦場の順に戦闘ダメージを処理しても結果が変わらないこと
  await app.dispatch({ type: 'token', name: 'Knight', count: 1 }, { type: 'token', name: 'Goblin', count: 1 });
  await app.endTurn();
  const [knight] = await app.tokens('Knight');
  const [goblin] = await app.tokens('Goblin');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -38 });
  const bear = await app.rival(0, 'bear');
  await attackWith(app, [knight, goblin]);
  expect((await app.state()).blocks).toEqual({ [goblin]: bear });
  const hand = await handSize(app);
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  // 熊の2点でゴブリンは死に、攻撃中だったのでガルナで1枚。相手1は騎士の3点で脱落し、盤面は除かれる
  expect(s.cards[goblin]).toBeUndefined();
  expect(s.zones.hand.length).toBe(hand + 1);
  expect(s.opponents[0].deadTurn).toBe(2);
  expect(s.opponents[0].board).toEqual([]);
});

test('同時に死ぬ病的な日和見主義者も、相手のクリーチャーの死亡で引ける（戦闘・冒涜の行動）', async ({ app }) => {
  await app.start(RIVALS);
  const morbid = await app.put('Morbid Opportunist', 'battlefield');
  await app.endTurn();
  // 日和見主義者（1/3、価値8）を毒蛇（1/1 接死）が相討ちで止める
  const viper = await app.rival(0, 'viper');
  await attackWith(app, [morbid]);
  expect((await app.state()).blocks).toEqual({ [morbid]: viper });
  let hand = await handSize(app);
  await app.dispatch({ type: 'damage' });
  let s = await app.state();
  expect(s.cards[morbid].zone).toBe('graveyard');
  expect(s.opponents[0].board).toEqual([]);
  expect(s.zones.hand.length).toBe(hand + 1);

  // 冒涜の行動：自分の場は日和見主義者だけ
  await app.start(RIVALS);
  await app.put('Morbid Opportunist', 'battlefield');
  await app.lands('Mountain');
  for (let i = 0; i < 7; i++) await app.rival(i % 3, 'bear');
  const act = await app.put('Blasphemous Act', 'hand');
  hand = await handSize(app);
  await app.act(act, /唱える/);
  s = await app.state();
  expect(s.flags.creaturesDied).toBe(8);
  // 冒涜の行動を唱えて -1、日和見主義者で +1
  expect(s.zones.hand.length).toBe(hand);
});

test('相手の天使の絆魂でライフが減らなくても、戦闘ダメージを与えたのでエレジーの見習いは引く', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Elegy Acolyte', 'battlefield');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -35 }, { type: 'token', name: 'Lightning Rager', count: 1 });
  const [rager] = await app.tokens('Lightning Rager');
  const angel = await app.rival(0, 'angel');
  await attackWith(app, [rager]);
  // 通すと致死なので天使がチャンプブロック
  expect((await app.state()).blocks).toEqual({ [rager]: angel });
  const before = await app.state();
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  // 天使に4点、本体に1点。天使の絆魂で +4 なので相手は 5 → 8
  expect(s.opponents[0].life).toBe(8);
  expect(s.zones.hand.length).toBe(before.zones.hand.length + 1);
  expect(s.life).toBe(before.life - 1);
});

test('クリーチャー化した土地にもエレボスの鞭の絆魂が乗り、ブロッカーへのダメージでもライフを得る。フライヤは熊に止められない', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Whip of Erebos', 'battlefield');
  const reaches = await app.put('Lavaclaw Reaches', 'battlefield');
  const freya = await app.put('Freya Crescent', 'battlefield');
  await app.endTurn();
  await app.dispatch({ type: 'pool', color: 'B', delta: 1 }, { type: 'pool', color: 'R', delta: 1 }, { type: 'pool', color: 'C', delta: 1 });
  await app.dispatch({ type: 'activate', id: reaches, index: 0 });
  const wall = await app.rival(0, 'wall');
  await app.rival(1, 'bear');
  await app.dispatch({ type: 'toCombat' }, { type: 'plan', id: reaches, opp: 0 }, { type: 'plan', id: freya, opp: 1 }, { type: 'attack' });
  // 辺境（2/2）は壁が止める。フライヤは自分のターンは飛行なので、熊は止めない
  expect((await app.state()).blocks).toEqual({ [reaches]: wall });
  const life = (await app.state()).life;
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  // 壁に2点、相手2に1点。鞭の絆魂で +3
  expect(s.opponents[0].board[0].damage).toBe(2);
  expect(s.opponents[1].life).toBe(39);
  expect(s.life).toBe(life + 3);
});

test('蘇生で戻したクリーチャーは、戦闘で死ぬときも追放される（ガルナは誘発しない）', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Garna, Bloodfist of Keld', 'battlefield');
  const gate = await app.put('Molten Gatekeeper', 'graveyard');
  await app.dispatch({ type: 'pool', color: 'R', delta: 1 }, { type: 'activate', id: gate, index: 0 });
  expect((await app.state()).cards[gate].zone).toBe('battlefield');
  // 門番（2/3、価値8）を騎士（3/2）が相討ちで止める
  const knight = await app.rival(0, 'knight');
  await attackWith(app, [gate]);
  expect((await app.state()).blocks).toEqual({ [gate]: knight });
  const before = await app.state();
  await app.dispatch({ type: 'damage' });
  const s = await app.state();
  expect(s.cards[gate].zone).toBe('exile');
  expect(s.zones.hand.length).toBe(before.zones.hand.length);
  expect(s.opponents.map((o) => o.life)).toEqual(before.opponents.map((o) => o.life));
});

test('相手のクリーチャーが除去されても、相手が脱落して盤面が除かれても、エレジーの見習いの虚空を満たす', async ({ app }) => {
  await app.start(RIVALS);
  await app.put('Elegy Acolyte', 'battlefield');
  await app.lands('Swamp', 'Swamp');
  await app.rival(0, 'bear');
  await app.act(await app.put('Infernal Grasp', 'hand'), /唱える/);
  await app.choose('相手1の 熊');
  await app.endTurn();
  expect(await app.tokens('Robot')).toHaveLength(1);

  await app.start(RIVALS);
  await app.put('Elegy Acolyte', 'battlefield');
  await app.rival(1, 'bear');
  await app.dispatch({ type: 'oppLife', opp: 1, delta: -40 });
  expect((await app.state()).opponents[1].board).toEqual([]);
  await app.endTurn();
  expect(await app.tokens('Robot')).toHaveLength(1);
});

test('編集の道具：脱落した相手には出さない・1人8体まで。対象が無い除去は理由を出す。デッキ一覧の印', async ({ app, page }) => {
  await app.start(RIVALS);
  await page.getByRole('button', { name: '編集モード' }).click();
  const toolbar = page.getByTestId('edit-toolbar');
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -40 });
  // 相手1が脱落したので、出す相手は相手2になる
  await expect(toolbar.getByLabel('出す相手')).toHaveValue('1');
  await toolbar.getByRole('button', { name: '相手に出す' }).click();
  let s = await app.state();
  expect(s.opponents.map((o) => o.board.length)).toEqual([0, 1, 0]);
  for (let i = 0; i < 8; i++) await toolbar.getByRole('button', { name: '相手に出す' }).click();
  s = await app.state();
  expect(s.opponents[1].board).toHaveLength(8);
  expect(s.log.at(-1)).toContain('相手2のクリーチャーは8体まで');
  // 脱落した相手の一覧には作り直しを出さない
  await page.getByRole('button', { name: /^対戦相手1のクリーチャー/ }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'この相手の盤面を作り直す' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '編集モード' }).click();
  // 相手のクリーチャーを全部取り除くと、大群への給餌は対象が無くて唱えられない
  await app.dispatch({ type: 'wipe' });
  await app.lands('Swamp', 'Swamp');
  const feed = await app.put('Feed the Swarm', 'hand');
  await app.drag(feed, '[data-testid="battlefield"]');
  await expect(page.getByRole('status')).toHaveText('対象にできるものがいない');
  // デッキ一覧：相手ありのときだけ自動になる除去
  await page.getByRole('button', { name: 'デッキ' }).click();
  await expect(page.getByTestId('deck').locator('tr', { hasText: '大群への給餌' })).toContainText('相手ありで自動');
  await expect(page.getByTestId('deck').locator('tr', { hasText: '衝撃の震え' }).locator('.badge')).toHaveText('自動');
});
