// 賢きモスマンのデッキのカードの自動処理（切削・RADカウンター・増殖・+1/+1カウンターの受け皿・勝ち筋）。
// 対戦相手の切削は近似：累計 m 枚に対し、土地でないカードは floor(3m/5) 枚（1枚目は土地・2枚目は土地でない・3枚目は土地…）
import { expect, test, type App } from './fixtures';

const MOTHMAN = 'seed=1&images=0&deck=mothman';
const RIVALS = 'rivals=1&seat=1&seed=1&images=0&deck=mothman';

/** ライブラリーの上を names の順にする（先頭が一番上）。置いたカードの ID を同じ順で返す */
async function stackLibrary(app: App, names: string[]) {
  const ids: string[] = [];
  for (const name of [...names].reverse()) ids.unshift(await app.put(name, 'library'));
  return ids;
}

async function attackWith(app: App, plan: [string, number][]) {
  await app.dispatch({ type: 'toCombat' }, ...plan.map(([id, opp]) => ({ type: 'plan' as const, id, opp })), { type: 'attack' });
}

const pool = (app: App, colors: Record<string, number>) =>
  app.dispatch(...Object.entries(colors).map(([color, delta]) => ({ type: 'pool' as const, color: color as 'U', delta })));

test('縫い師への供給者・生垣裁断機：出たときと死亡したときに3枚切削し、切削した土地はタップ状態で戦場に出る', async ({ app }) => {
  await app.start(MOTHMAN);
  await app.put('Hedge Shredder', 'battlefield');
  const [forest, ring, island, scales, swamp, signet] = await stackLibrary(app, ['Forest', 'Sol Ring', 'Island', 'Hardened Scales', 'Swamp', 'Arcane Signet']);
  const supplier = await app.put("Stitcher's Supplier", 'battlefield', true);
  let s = await app.state();
  expect([s.cards[forest].zone, s.cards[forest].tapped, s.cards[ring].zone, s.cards[island].zone]).toEqual(['battlefield', true, 'graveyard', 'battlefield']);
  await app.dispatch({ type: 'move', id: supplier, to: 'graveyard', trigger: true });
  s = await app.state();
  expect([s.cards[scales].zone, s.cards[swamp].zone, s.cards[signet].zone]).toEqual(['graveyard', 'battlefield', 'graveyard']);
  // 土地が無い切削では何もしない
  const rest = await stackLibrary(app, ['Mindcrank', 'Altar of the Brood', 'Talisman of Curiosity']);
  await app.dispatch({ type: 'move', id: supplier, to: 'battlefield', trigger: true });
  s = await app.state();
  expect(rest.map((id) => s.cards[id].zone)).toEqual(['graveyard', 'graveyard', 'graveyard']);
});

test('六番：攻撃したとき3枚切削し、その中の土地1枚を手札に加えられる（土地が無ければ選ばない）', async ({ app }) => {
  await app.start(MOTHMAN);
  const six = await app.put('Six', 'battlefield');
  await app.endTurn();
  const [, forest] = await stackLibrary(app, ['Sol Ring', 'Forest', 'Hardened Scales']);
  await attackWith(app, [[six, 0]]);
  await app.choose('森');
  let s = await app.state();
  expect(s.cards[forest].zone).toBe('hand');
  expect(s.zones.graveyard.map((id) => s.cards[id].name)).toEqual(['Sol Ring', 'Hardened Scales']);
  await app.dispatch({ type: 'damage' }, { type: 'endCombat' });
  await app.endTurn();
  await stackLibrary(app, ['Arcane Signet', 'Mindcrank', 'Altar of the Brood']);
  const before = (await app.state()).zones.graveyard.length;
  await attackWith(app, [[six, 0]]);
  s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.zones.graveyard).toHaveLength(before + 3);
});

test('土地が出るたび：進化の賢者で増殖、遺跡ガニ・群の祭壇で各対戦相手が切削、テイト農夫・マリポーサ軍事基地でRADカウンター', async ({ app, page }) => {
  await app.start(MOTHMAN);
  for (const name of ['Evolution Sage', 'Ruin Crab', 'Altar of the Brood', 'Tato Farmer']) await app.put(name, 'battlefield');
  await app.dispatch({ type: 'rad', who: 0, delta: 1 });
  const base = await app.put('Mariposa Military Base', 'hand');
  await app.dispatch({ type: 'playLand', id: base });
  // 軍事基地：タップ状態で出して RAD 2個
  await expect(page.getByRole('dialog')).toContainText('マリポーサ軍事基地');
  await app.choose('はい');
  // テイト農夫：得ない
  await expect(page.getByRole('dialog')).toContainText('テイト農夫');
  await app.choose('いいえ');
  const s = await app.state();
  expect(s.cards[base].tapped).toBe(true);
  expect(s.rad).toBe(2);
  // 相手1のRADは増殖で2個。各対戦相手は遺跡ガニで3枚、群の祭壇で1枚
  expect(s.opponents.map((o) => [o.rad, o.library])).toEqual([[2, 88], [0, 88], [0, 88]]);
  // 2枚目：森。軍事基地は出ないので聞かれず、テイト農夫で RAD 2個を得る
  const forest = await app.put('Forest', 'hand');
  await app.dispatch({ type: 'playLand', id: forest });
  await app.choose('はい');
  expect((await app.state()).rad).toBe(4);
});

test('事件現場の分析者：出たとき3枚切削し、生け贄で墓地の土地をすべて戻す（戻った土地ごとに上陸）', async ({ app }) => {
  await app.start(MOTHMAN);
  await app.put('Evolution Sage', 'battlefield');
  const [ring] = await stackLibrary(app, ['Sol Ring', 'Mindcrank', 'Arcane Signet']);
  const analyst = await app.put('Aftermath Analyst', 'battlefield', true);
  expect((await app.state()).cards[ring].zone).toBe('graveyard');
  const forest = await app.put('Forest', 'graveyard');
  const island = await app.put('Island', 'graveyard');
  await app.dispatch({ type: 'rad', who: 1, delta: 1 });
  await pool(app, { G: 1, C: 3 });
  await app.act(analyst, /墓地の土地をすべて/);
  const s = await app.state();
  expect([s.cards[forest].zone, s.cards[forest].tapped, s.cards[island].zone]).toEqual(['battlefield', true, 'battlefield']);
  expect(s.cards[analyst].zone).toBe('graveyard');
  // 進化の賢者：土地2枚で2回増殖
  expect(s.opponents[1].rad).toBe(3);
});

test('賢きモスマンと金切り声のスコーチビーストの攻撃で全員にRADカウンター。スコーチビーストは切削でトークン（1ターンに1回）', async ({ app }) => {
  await app.start(MOTHMAN);
  const mothman = await app.put('The Wise Mothman', 'battlefield');
  const beast = await app.put('Screeching Scorchbeast', 'battlefield');
  await app.endTurn();
  await attackWith(app, [[mothman, 0], [beast, 1]]);
  let s = await app.state();
  expect([s.rad, ...s.opponents.map((o) => o.rad)]).toEqual([3, 3, 3, 3]);
  await app.dispatch({ type: 'damage' }, { type: 'endCombat' });
  // 思考掃きで相手3に2枚（土地でない1枚）→ モスマンは選ぶ（2体）、スコーチビーストはゾンビ・ミュータント1体
  const scour = await app.put('Thought Scour', 'hand');
  await pool(app, { U: 1 });
  await app.act(scour, /唱える/);
  await app.choose(/^対戦相手3/);
  await app.choose('金切り声のスコーチビースト');
  s = await app.state();
  expect(s.cards[beast].counters['+1/+1']).toBe(1);
  expect(await app.tokens('Zombie Mutant')).toHaveLength(1);
  // 群の祭壇：パーマネントが出るたび各対戦相手が1枚。1回目（太陽の指輪）は全員が土地なので何も誘発しない
  await app.put('Altar of the Brood', 'battlefield');
  await app.put('Sol Ring', 'battlefield', true);
  expect(await app.tokens('Zombie Mutant')).toHaveLength(1);
  // 2回目（秘儀の印鑑）は3人とも土地でないカード → X=3 で3体（モスマン・スコーチビースト・ゾンビ）全員に置く。
  // スコーチビーストのトークンはこのターンもう作らない
  await app.put('Arcane Signet', 'battlefield', true);
  s = await app.state();
  expect(await app.tokens('Zombie Mutant')).toHaveLength(1);
  const [zombie] = await app.tokens('Zombie Mutant');
  expect([s.cards[mothman].counters['+1/+1'], s.cards[beast].counters['+1/+1'], s.cards[zombie].counters['+1/+1']]).toEqual([1, 2, 1]);
});

test('光る輩・群生するラッドローチ・かき鳴らし鳥・厄介なラッドガル：戦闘ダメージでRADカウンターか増殖。光る輩は切削で回復、ラッドローチは墓地から戻る', async ({ app }) => {
  await app.start(MOTHMAN);
  const ids: Record<string, string> = {};
  for (const name of ['Glowing One', 'Infesting Radroach', 'Thrummingbird', 'Vexing Radgull']) ids[name] = await app.put(name, 'battlefield');
  await app.endTurn();
  await app.dispatch({ type: 'rad', who: 1, delta: 1 }, { type: 'rad', who: 2, delta: 1 });
  await attackWith(app, [
    [ids['Glowing One'], 0],
    [ids['Infesting Radroach'], 0],
    [ids.Thrummingbird, 1],
    [ids['Vexing Radgull'], 2],
  ]);
  await app.dispatch({ type: 'damage' });
  let s = await app.state();
  // 相手1：光る輩で4、ラッドローチで2（与えた点数）→ 6。かき鳴らし鳥の増殖で全員 +1 → [7, 2, 2]。
  // ラッドガルが殴った相手3は RAD を持っているので、もう一度増殖 → [8, 3, 3]
  expect(s.opponents.map((o) => o.rad)).toEqual([8, 3, 3]);
  await app.dispatch({ type: 'endCombat' });
  // ラッドローチを墓地に置き、相手が土地でないカードを切削すると戻る。光る輩は土地でないカード1枚につき1点回復
  await app.dispatch({ type: 'move', id: ids['Infesting Radroach'], to: 'graveyard', trigger: false });
  const life = s.life;
  const scour = await app.put('Thought Scour', 'hand');
  await pool(app, { U: 1 });
  await app.act(scour, /唱える/);
  await app.choose(/^対戦相手1/);
  s = await app.state();
  expect(s.cards[ids['Infesting Radroach']].zone).toBe('hand');
  expect(s.life).toBe(life + 1);
});

test('フェラル・グール：ほかのクリーチャーが死亡すると大きくなり、死亡したらパワーに等しいRADカウンターを各対戦相手に', async ({ app }) => {
  await app.start(MOTHMAN);
  const ghoul = await app.put('Feral Ghoul', 'battlefield');
  const supplier = await app.put("Stitcher's Supplier", 'battlefield');
  await app.dispatch({ type: 'move', id: supplier, to: 'graveyard', trigger: true });
  expect((await app.state()).cards[ghoul].counters['+1/+1']).toBe(1);
  await app.dispatch({ type: 'move', id: ghoul, to: 'graveyard', trigger: true });
  expect((await app.state()).opponents.map((o) => o.rad)).toEqual([3, 3, 3]);
});

test('マイアラーク・クイーン：出たとき選んだプレイヤーにRAD2個。切削で引いて大きくなる（1ターンに1回）', async ({ app }) => {
  await app.start(MOTHMAN);
  const queen = await app.put('Mirelurk Queen', 'battlefield', true);
  await app.choose(/^対戦相手2/);
  expect((await app.state()).opponents[1].rad).toBe(2);
  await app.dispatch({ type: 'move', id: queen, to: 'hand', trigger: false });
  await app.dispatch({ type: 'move', id: queen, to: 'battlefield', trigger: true });
  await app.choose('あなた');
  expect((await app.state()).rad).toBe(2);
  // 思考掃きで自分を切削（土地でないカード）→ 1枚引いて+1/+1カウンター。同じターンの2回目は無い
  await stackLibrary(app, ['Sol Ring', 'Arcane Signet', 'Island']);
  const hand = (await app.state()).zones.hand.length;
  const scour = await app.put('Thought Scour', 'hand');
  await pool(app, { U: 2 });
  await app.act(scour, /唱える/);
  await app.choose('あなた');
  let s = await app.state();
  // 思考掃きを手札に置いて +1、唱えて -1、思考掃きで +1、クイーンで +1
  expect(s.zones.hand.length).toBe(hand + 2);
  expect(s.cards[queen].counters['+1/+1']).toBe(1);
  await app.dispatch({ type: 'move', id: scour, to: 'hand', trigger: false });
  await app.act(scour, /唱える/);
  await app.choose('あなた');
  s = await app.state();
  expect(s.cards[queen].counters['+1/+1']).toBe(1);
});

test('放射性降下物：タフネスが 2X 以下のクリーチャーは死に、残りは −2X/−2X、全員が RAD X個（X=0 なら何も起きない）', async ({ app }) => {
  await app.start(MOTHMAN);
  const ghoul = await app.put('Feral Ghoul', 'battlefield');
  const corpsejack = await app.put('Corpsejack Menace', 'battlefield');
  const fallout = await app.put('Nuclear Fallout', 'hand');
  await pool(app, { B: 2, C: 1 });
  await app.act(fallout, /唱える/);
  await app.choose('X=1');
  let s = await app.state();
  expect(s.cards[ghoul].zone).toBe('graveyard');
  expect(s.cards[corpsejack].zone).toBe('battlefield');
  await expect(app.card(corpsejack).locator('.pt')).toHaveText('2/2');
  // フェラル・グールの死亡（パワー2−2=0）では RAD は増えない。降下物で全員 1個
  expect([s.rad, ...s.opponents.map((o) => o.rad)]).toEqual([1, 1, 1, 1]);
  await app.dispatch({ type: 'move', id: fallout, to: 'hand', trigger: false });
  await pool(app, { B: 2 });
  await app.act(fallout, /唱える/);
  await app.choose('X=0');
  s = await app.state();
  expect([s.rad, ...s.opponents.map((o) => o.rad)]).toEqual([1, 1, 1, 1]);
  // ターン終了で修整は消える
  await app.endTurn();
  await expect(app.card(corpsejack).locator('.pt')).toHaveText('4/4');
});

test('相手ありモード：放射性降下物は相手のクリーチャーも（タフネス 2X 以下は死亡、残りはダメージ）', async ({ app }) => {
  await app.start(RIVALS);
  const bear = await app.rival(0, 'bear');
  const spider = await app.rival(0, 'spider');
  const fallout = await app.put('Nuclear Fallout', 'hand');
  await pool(app, { B: 2, C: 1 });
  await app.act(fallout, /唱える/);
  await app.choose('X=1');
  const s = await app.state();
  expect(s.opponents[0].board.map((p) => [p.id, p.damage])).toEqual([[spider, 2]]);
  expect(s.opponents[0].board.some((p) => p.id === bear)).toBe(false);
});

test('勝ち筋：血の長の昇天（探索カウンター3個）＋精神クランクで、切削とライフの喪失が止まらずに続く', async ({ app }) => {
  await app.start(MOTHMAN);
  const ascension = await app.put('Bloodchief Ascension', 'battlefield');
  await app.put('Mindcrank', 'battlefield');
  await app.dispatch({ type: 'counter', id: ascension, kind: 'quest', delta: 3 });
  const scour = await app.put('Thought Scour', 'hand');
  await pool(app, { U: 1 });
  await app.act(scour, /唱える/);
  await app.choose(/^対戦相手1/);
  const s = await app.state();
  // 2枚が墓地へ → 2点ずつ失う → その点数ぶん切削 → … ライフ40なら20枚で死ぬ
  expect(s.opponents[0].deadTurn).toBe(1);
  expect(s.opponents[0].life).toBeLessThanOrEqual(0);
  expect(s.life).toBeGreaterThanOrEqual(80);
  expect(s.opponents[1].life).toBe(40);
});

test('血の長の昇天：対戦相手が2点以上失ったターンの終了ステップに探索カウンター（相手のターンでも）', async ({ app }) => {
  await app.start(MOTHMAN);
  const ascension = await app.put('Bloodchief Ascension', 'battlefield');
  // 自分のターンは失っていないので置かれない。相手2のターンに RAD で2点失うと置かれる
  await app.dispatch({ type: 'rad', who: 1, delta: 4 });
  await app.endTurn();
  expect((await app.state()).cards[ascension].counters.quest).toBe(1);
});

test('湖の町の統領：ライフを失ったプレイヤーはその点数だけ切削（あなたも）。死亡したら7枚以上の墓地1つにつき1枚引く', async ({ app }) => {
  await app.start(MOTHMAN);
  const master = await app.put('The Master of Lake-town', 'battlefield');
  const talisman = await app.put('Talisman of Curiosity', 'battlefield');
  await app.act(talisman, 'マナ：{G}（1点受ける）');
  let s = await app.state();
  expect(s.zones.graveyard).toHaveLength(1);
  await app.dispatch({ type: 'oppLife', opp: 0, delta: -1 });
  // 編集でのライフの増減は誘発させない。RADカウンターで失うと切削する
  await app.dispatch({ type: 'rad', who: 0, delta: 5 });
  await app.endTurn();
  s = await app.state();
  // 相手1：RADで5枚（土地でない3枚）→ 3点失い → 統領で3枚
  expect(s.opponents[0].graveyard).toBe(8);
  const hand = s.zones.hand.length;
  await app.dispatch({ type: 'move', id: master, to: 'graveyard', trigger: true });
  // 墓地7枚以上は相手1だけ
  expect((await app.state()).zones.hand.length).toBe(hand + 1);
});

test('増殖の呪文：流束の媒介者（クリーチャーでない呪文）、原子化（相手なしでは増殖だけ）、変異の賜物、実験的占い、ラッドストーム（ストーム）', async ({ app }) => {
  await app.start(MOTHMAN);
  await app.put('Flux Channeler', 'battlefield');
  await app.dispatch({ type: 'rad', who: 0, delta: 1 });
  const rad = async () => (await app.state()).opponents[0].rad;
  // クリーチャー呪文では増殖しない
  const sage = await app.put('Evolution Sage', 'hand');
  await pool(app, { G: 1, C: 2 });
  await app.act(sage, /唱える/);
  expect(await rad()).toBe(1);
  // 原子化：増殖2回（流束の媒介者と原子化）
  await pool(app, { B: 1, G: 1, C: 2 });
  await app.act(await app.put('Atomize', 'hand'), /唱える/);
  expect(await rad()).toBe(3);
  await pool(app, { G: 1, U: 1, C: 1 });
  await app.act(await app.put('Mutational Advantage', 'hand'), /唱える/);
  expect(await rad()).toBe(5);
  // 実験的占い：上の3枚から1枚を手札、残りは下
  const [a, b, c] = await stackLibrary(app, ['Sol Ring', 'Mindcrank', 'Arcane Signet']);
  await pool(app, { U: 1, C: 1 });
  await app.act(await app.put('Experimental Augury', 'hand'), /唱える/);
  await app.choose('秘儀の印鑑');
  let s = await app.state();
  expect(s.cards[c].zone).toBe('hand');
  expect(s.zones.library.slice(-2)).toEqual([a, b]);
  expect(await rad()).toBe(7);
  // ラッドストーム：このターンに唱えた5つ目なので、増殖5回（＋流束の媒介者1回）
  await pool(app, { U: 1, C: 3 });
  await app.act(await app.put('Radstorm', 'hand'), /唱える/);
  s = await app.state();
  expect(s.opponents[0].rad).toBe(13);
});

test('受け皿：水深の魔道士（進化・1個ごとに引く）、惑星共生（1ターンに1回）、沈思の教授（増分で引く）、日を浴びる繁殖鱗・進化の証人（順応）', async ({ app, page }) => {
  await app.start(MOTHMAN);
  const mage = await app.put('Fathom Mage', 'battlefield');
  const professor = await app.put('Pensive Professor', 'battlefield');
  await app.put('Terrasymbiosis', 'battlefield');
  let hand = (await app.state()).zones.hand.length;
  // 六番（2/4）が出る → 水深の魔道士が進化（1個 → 1枚）、惑星共生（このターン初めて → 1枚）
  await app.put('Six', 'battlefield', true);
  let s = await app.state();
  expect(s.cards[mage].counters['+1/+1']).toBe(1);
  expect(s.zones.hand.length).toBe(hand + 2);
  // 沈思の教授：1マナ払って唱えると増分（0/2 のパワーより多い）→ 1枚。惑星共生はこのターンもう引かない
  hand = s.zones.hand.length;
  await pool(app, { C: 1 });
  await app.act(await app.put('Sol Ring', 'hand'), /唱える/);
  s = await app.state();
  expect(s.cards[professor].counters['+1/+1']).toBe(1);
  expect(s.zones.hand.length).toBe(hand + 1 - 1 + 1);
  // 日を浴びる繁殖鱗：順応1 → 落とし子。カウンターがあれば順応は出さない
  const brood = await app.put('Basking Broodscale', 'battlefield');
  await pool(app, { G: 1, C: 1 });
  await app.act(brood, '{1}{G}：順応1');
  expect(await app.tokens('Eldrazi Spawn')).toHaveLength(1);
  await app.card(brood).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /順応/ })).toHaveCount(0);
  await page.getByRole('button', { name: '閉じる' }).click();
  // 進化の証人：順応2 → 墓地のパーマネント・カードを手札に
  const witness = await app.put('Evolution Witness', 'battlefield');
  const crank = await app.put('Mindcrank', 'graveyard');
  await pool(app, { G: 1, C: 1 });
  await app.act(witness, '{1}{G}：順応2');
  await app.choose('精神クランク');
  expect((await app.state()).cards[crank].zone).toBe('hand');
  // 墓地にパーマネント・カードが無ければ選ばない（カーンの拠点で増殖）
  const bastion = await app.put("Karn's Bastion", 'battlefield');
  await pool(app, { C: 4 });
  await app.act(bastion, '{4}：増殖');
  s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.cards[witness].counters['+1/+1']).toBe(3);
  expect(await app.tokens('Eldrazi Spawn')).toHaveLength(2);
});

test('受け皿：古代の災厄、ジェノバ（戦闘開始時にカウンター・ミュータントの死亡で引く）、搭載歩行機械（X・起動・飛行機械）', async ({ app }) => {
  await app.start(MOTHMAN);
  const jenova = await app.put('Jenova, Ancient Calamity', 'battlefield');
  const ghoul = await app.put('Feral Ghoul', 'battlefield');
  const walker = await app.put('Hangarback Walker', 'battlefield');
  await app.endTurn();
  await pool(app, { C: 1 });
  await app.act(walker, '{1}：+1/+1カウンターを置く');
  expect((await app.state()).cards[walker].counters['+1/+1']).toBe(1);
  await app.dispatch({ type: 'toCombat' });
  await app.choose('フェラル・グール');
  let s = await app.state();
  expect(s.cards[ghoul].counters['+1/+1']).toBe(1);
  // あなたのターンにミュータント（フェラル・グール 3/3）が死亡 → 3枚
  const hand = s.zones.hand.length;
  await app.dispatch({ type: 'move', id: ghoul, to: 'graveyard', trigger: true });
  expect((await app.state()).zones.hand.length).toBe(hand + 3);
  // 搭載歩行機械が死亡 → カウンターの数だけ飛行機械
  await app.dispatch({ type: 'move', id: walker, to: 'graveyard', trigger: true });
  expect(await app.tokens('Thopter')).toHaveLength(1);
  await app.dispatch({ type: 'endCombat' });
  await app.endTurn();
  // ほかにクリーチャーがいなければ、ジェノバは聞かない
  await app.dispatch({ type: 'move', id: (await app.tokens('Thopter'))[0], to: 'graveyard', trigger: false });
  await app.dispatch({ type: 'toCombat' });
  s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.cards[jenova].zone).toBe('battlefield');
});

test('搭載歩行機械は {X}{X}：X=1 なら2マナ。硬化した鱗で2個。X=0 なら置換も効かず、死亡しても何も出ない', async ({ app }) => {
  await app.start(MOTHMAN);
  await app.put('Hardened Scales', 'battlefield');
  const walker = await app.put('Hangarback Walker', 'hand');
  await pool(app, { C: 2 });
  await app.act(walker, /唱える/);
  await app.choose('X=1');
  expect((await app.state()).cards[walker].counters['+1/+1']).toBe(2);
  await app.dispatch({ type: 'move', id: walker, to: 'hand', trigger: false });
  await app.act(walker, /唱える/);
  await app.choose('X=0');
  expect((await app.state()).cards[walker].counters['+1/+1']).toBeUndefined();
  await app.dispatch({ type: 'move', id: walker, to: 'graveyard', trigger: true });
  expect(await app.tokens('Thopter')).toHaveLength(0);
});

test('囁かれる希望の神（+1個・パワーぶんのマナ）、培養ドルイド（カウンターがあれば3マナ・順応3）、鼓舞する呼び声（カウンターのある体数を引く）', async ({ app, page }) => {
  await app.start(MOTHMAN);
  const kami = await app.put('Kami of Whispered Hopes', 'battlefield');
  const druid = await app.put('Incubation Druid', 'battlefield');
  await app.endTurn();
  await app.card(druid).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '{3}{G}{G}：順応3' })).toHaveCount(0);
  await page.getByRole('button', { name: '閉じる' }).click();
  await app.act(druid, 'マナ：{G}×1');
  expect((await app.state()).pool.G).toBe(1);
  // カーンの拠点の増殖：カウンターが無いものには置かれない。順応3（{3}{G}{G}）で培養ドルイドに 3＋神の1 = 4個
  await app.dispatch({ type: 'tap', id: druid }, { type: 'pool', color: 'G', delta: 1 }, { type: 'pool', color: 'C', delta: 3 });
  await app.act(druid, '{3}{G}{G}：順応3');
  expect((await app.state()).cards[druid].counters['+1/+1']).toBe(4);
  // 順応はタップしないので、そのまま3マナ出せる
  await app.act(druid, 'マナ：{G}×3');
  expect((await app.state()).pool.G).toBe(3);
  // 神にも1個（＋自身の1個）→ パワー3で {U}×3
  await app.dispatch({ type: 'counter', id: kami, kind: '+1/+1', delta: 2 });
  await app.act(kami, 'マナ：{U}×3');
  expect((await app.state()).pool.U).toBe(3);
  // 鼓舞する呼び声：カウンターのあるクリーチャー2体 → 2枚
  const hand = (await app.state()).zones.hand.length;
  await app.act(await app.put('Inspiring Call', 'hand'), /唱える/);
  expect((await app.state()).zones.hand.length).toBe(hand + 2);
});

test('海中の戦士、レイ・フィレット（進化・カウンターのある攻撃で引く）と狩りの仕込み（+1/+1カウンターのある攻撃で引く）', async ({ app }) => {
  await app.start(MOTHMAN);
  const ray = await app.put('Ray Fillet, Wave Warrior', 'battlefield');
  await app.put('Bred for the Hunt', 'battlefield');
  const bird = await app.put('Thrummingbird', 'battlefield');
  // かき鳴らし鳥（1/1）は 0/2 より小さいので進化しない。屍体屋の脅威（4/4）で進化
  expect((await app.state()).cards[ray].counters['+1/+1']).toBeUndefined();
  await app.put('Corpsejack Menace', 'battlefield', true);
  // 進化の1個は屍体屋の脅威で2個
  expect((await app.state()).cards[ray].counters['+1/+1']).toBe(2);
  await app.endTurn();
  await app.dispatch({ type: 'counter', id: bird, kind: '+1/+1', delta: 1 });
  const hand = (await app.state()).zones.hand.length;
  await attackWith(app, [[bird, 0], [ray, 1]]);
  await app.dispatch({ type: 'damage' });
  // かき鳴らし鳥とレイ・フィレット（どちらもカウンターあり）がプレイヤーにダメージ → レイ・フィレットで2枚、狩りの仕込みで2枚
  expect((await app.state()).zones.hand.length).toBe(hand + 4);
});

test('相手ありモードの除去：喉首狙い・暗殺者の戦利品（相手のものだけ）・内にいる獣（壊したもののコントローラーにビースト）・原子化（破壊と増殖）', async ({ app, page }) => {
  await app.start(RIVALS);
  const bear = await app.rival(0, 'bear');
  const knight = await app.rival(1, 'knight');
  const spider = await app.rival(2, 'spider');
  const ghoul = await app.put('Feral Ghoul', 'battlefield');
  await pool(app, { B: 1, C: 1 });
  await app.act(await app.put('Go for the Throat', 'hand'), /唱える/);
  await app.choose('相手1の 熊');
  // 暗殺者の戦利品：自分のフェラル・グールは候補に出ない
  await pool(app, { B: 1, G: 1 });
  await app.act(await app.put("Assassin's Trophy", 'hand'), /唱える/);
  await expect(page.getByRole('dialog').locator('.card-choice')).toHaveCount(0);
  await app.choose('相手2の 騎士');
  // 内にいる獣：相手3の蜘蛛を壊すと、相手3に 3/3 のビースト
  await pool(app, { G: 1, C: 2 });
  const within = await app.put('Beast Within', 'hand');
  await app.act(within, /唱える/);
  await app.choose('相手3の 蜘蛛');
  let s = await app.state();
  expect(s.opponents.map((o) => o.board.map((p) => p.kind))).toEqual([[], [], ['beastToken']]);
  expect([bear, knight, spider].some((id) => s.opponents.some((o) => o.board.some((p) => p.id === id)))).toBe(false);
  // 自分のフェラル・グールを壊すと、自分にビースト
  await app.dispatch({ type: 'move', id: within, to: 'hand', trigger: false });
  await pool(app, { G: 1, C: 2 });
  await app.act(within, /唱える/);
  await app.choose('フェラル・グール');
  s = await app.state();
  expect(s.cards[ghoul].zone).toBe('graveyard');
  expect(await app.tokens('Beast')).toHaveLength(1);
  // 原子化：対象を壊して増殖（相手3はフェラル・グールの死亡で RAD 2個 → 3個）
  await pool(app, { B: 1, G: 1, C: 2 });
  await app.act(await app.put('Atomize', 'hand'), /唱える/);
  await app.choose('相手3の ビースト 3/3');
  s = await app.state();
  expect(s.opponents[2].board).toEqual([]);
  expect(s.opponents.map((o) => o.rad)).toEqual([3, 3, 3]);
});

test('厄介なラッドガルは RAD の無い相手に2個。六番は自分が攻撃しないときは切削しない。相手なしの内にいる獣は対象を選ばない（手動）', async ({ app }) => {
  await app.start(MOTHMAN);
  const gull = await app.put('Vexing Radgull', 'battlefield');
  await app.put('Six', 'battlefield');
  await app.endTurn();
  const graveyard = (await app.state()).zones.graveyard.length;
  await attackWith(app, [[gull, 0]]);
  await app.dispatch({ type: 'damage' });
  let s = await app.state();
  expect(s.opponents[0].rad).toBe(2);
  expect(s.zones.graveyard).toHaveLength(graveyard);
  await app.dispatch({ type: 'endCombat' });
  const within = await app.put('Beast Within', 'hand');
  await pool(app, { G: 1, C: 2 });
  await app.act(within, /唱える/);
  s = await app.state();
  expect(s.prompt).toBeNull();
  expect(s.cards[within].zone).toBe('graveyard');
  expect(await app.tokens('Beast')).toHaveLength(0);
});
