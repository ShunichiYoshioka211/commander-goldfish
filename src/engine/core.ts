// エンジンの基本操作。カードスクリプトもここの関数だけを使って盤面を動かす。
import { TOKENS } from '../cards/tokens';
import { scriptOf } from '../cards/registry';
import { shuffleWith } from './rng';
import { addCounters } from './counters';
import { defByName } from './deck';
import type { CardDef, CardInstance, GameState, Prompt, TurnFlags, ZoneId } from './types';

export { defByName };
export const def = (card: CardInstance): CardDef => defByName(card.name);
export const typeOf = (card: CardInstance, t: string) => def(card).typeLine.includes(t);
export const isCreature = (card: CardInstance) => typeOf(card, 'Creature') || card.animated !== null;
export const isLand = (card: CardInstance) => typeOf(card, 'Land');
export const isRed = (card: CardInstance) => def(card).colors.includes('R');
export const isCommander = (s: GameState, card: CardInstance) => !card.token && s.commanders.includes(card.name);
/** キーワード能力。クリーチャー化した土地は、そのときに得た能力も見る（不穏な火道の威迫） */
export const hasKeyword = (card: CardInstance, k: string) => def(card).keywords.includes(k) || (card.animated?.keywords.includes(k) ?? false);
export const nameJa = (card: CardInstance) => def(card).jaName;

export const battlefield = (s: GameState) => s.zones.battlefield.map((id) => s.cards[id]);
export const creatures = (s: GameState) => battlefield(s).filter(isCreature);
export const lands = (s: GameState) => battlefield(s).filter(isLand);
export const onField = (s: GameState, name: string) => battlefield(s).filter((c) => c.name === name);
export const aliveOpponents = (s: GameState) => s.opponents.flatMap((o, i) => (o.deadTurn === null ? [i] : []));

export function power(card: CardInstance): number {
  const base = card.animated ? card.animated.power : def(card).power!;
  return Math.max(0, base + (card.counters['+1/+1'] ?? 0) + card.tempPower);
}

export function toughness(card: CardInstance): number {
  const base = card.animated ? card.animated.toughness : def(card).toughness!;
  return base + (card.counters['+1/+1'] ?? 0) + card.tempToughness;
}

export const canAttack = (card: CardInstance) =>
  isCreature(card) && !card.tapped && (!card.sick || card.haste || hasKeyword(card, 'Haste'));

export const freshFlags = (): TurnFlags => ({
  attacked: false, creaturesDied: 0, nonlandLeft: false, warped: false, noncombatToOpps: 0, morbidUsed: false, loyaltyUsed: [],
  oppLifeLost: [0, 0, 0], spellsCast: 0, onceUsed: [],
});

/** 「毎ターン1回」の誘発。このターンにまだ使っていなければ、使ったことにして true を返す */
export function once(s: GameState, key: string) {
  if (s.flags.onceUsed.includes(key)) return false;
  s.flags.onceUsed.push(key);
  return true;
}

/**
 * どのターンのクリンナップでも行うこと（CR 514.2）：ターン終了までの効果と、相手のクリーチャーが受けたダメージを消す。
 * あなたのクリーチャーが受けたダメージは持たない（相手のクリーチャーからダメージを受けるのは戦闘だけで、その場で生死を決める）
 */
export function endOfTurnCleanup(s: GameState) {
  for (const c of battlefield(s)) Object.assign(c, { tempPower: 0, tempToughness: 0, haste: false, animated: null });
  for (const o of s.opponents) for (const p of o.board) p.damage = 0;
}

export function log(s: GameState, text: string) {
  s.log.push(`T${s.turn} ${text}`);
}

/**
 * 誘発を積む。解決中に積まれたものは、すでに待っているものより先に解決する（スタックと同じ順）。
 * copy=false はターンの進行や呪文の解決など、しっぺ返しでコピーできないもの（エンジンが使う）
 */
export function enqueue(s: GameState, label: string, run: (s: GameState) => void, copy = true) {
  s.fresh.push({ label, run, copy });
}

/** 解決したものを、しっぺ返しでコピーできるように覚える */
export function remember(s: GameState, item: { label: string; run: (s: GameState) => void }) {
  s.recent.push({ label: item.label, run: item.run });
}

/** そのクリーチャーに付いている装備品 */
export const equipmentOn = (s: GameState, card: CardInstance) => battlefield(s).filter((e) => e.attachedTo === card.id);

/** 装備品から得ているキーワード能力（いとしいしとの「ブロックされない」など） */
export const grantedKeyword = (s: GameState, card: CardInstance, k: string) =>
  equipmentOn(s, card).some((e) => scriptOf(e).equipKeywords?.includes(k));

export function ask(s: GameState, prompt: Prompt) {
  s.prompt = prompt;
}

/** 誘発を順に解決する。選択が必要になったら止まり、回答後に再開する */
export function drain(s: GameState) {
  s.queue.unshift(...s.fresh.splice(0));
  while (!s.prompt && s.queue.length > 0 && s.phase !== 'over') {
    const item = s.queue.shift()!;
    item.run(s);
    if (item.copy) remember(s, item);
    // 状況起因処理：タフネスが0以下のクリーチャーは死亡する（CR 704.5f）
    destroyAll(s, creatures(s).filter((c) => toughness(c) <= 0).map((c) => c.id));
    s.queue.unshift(...s.fresh.splice(0));
  }
}

export function shuffleLibrary(s: GameState) {
  [s.zones.library, s.rng] = shuffleWith(s.zones.library, s.rng);
}

export function draw(s: GameState, n: number) {
  for (let i = 0; i < n; i++) {
    const id = s.zones.library[0];
    if (!id) {
      log(s, 'ライブラリが空で引けない');
      return;
    }
    moveTo(s, id, 'hand');
  }
}

export function blankInstance(id: string, name: string, token: boolean, zone: ZoneId): CardInstance {
  return {
    id, name, token, zone, tapped: false, counters: {}, sick: false, haste: false, attacking: null,
    tempPower: 0, tempToughness: 0, atEnd: null, animated: null, castable: false, doors: [], attachedTo: null,
  };
}

/** 領域の移動。trigger=false なら誘発を起こさない（編集モード） */
export function moveTo(
  s: GameState,
  id: string,
  to: ZoneId,
  opts: { trigger?: boolean; bottom?: boolean; tapped?: boolean; observers?: CardInstance[]; counters?: Record<string, number> } = {},
) {
  const trigger = opts.trigger ?? true;
  const card = s.cards[id];
  const from = card.zone;
  // 蘇生・エレボスの鞭で戻したものは、戦場を離れるなら代わりに追放される（置換なので死亡しない）。編集の移動（誘発なし）は指定どおり
  to = trigger && from === 'battlefield' && card.atEnd === 'exile' ? 'exile' : to;
  s.zones[from] = s.zones[from].filter((x) => x !== id);
  if (from === 'battlefield') leaveBattlefield(s, card, to, trigger, opts.observers ?? []);
  // 統率者が墓地か追放に行くなら統率領域に戻す
  const dest: ZoneId = isCommander(s, card) && (to === 'graveyard' || to === 'exile') ? 'command' : to;
  if (card.token && dest !== 'battlefield') {
    delete s.cards[id];
    return;
  }
  const moved = blankInstance(id, card.name, card.token, dest);
  s.cards[id] = moved;
  if (opts.bottom || dest !== 'library') s.zones[dest].push(id);
  else s.zones[dest].unshift(id);
  if (dest === 'battlefield') {
    // 出るときに持つカウンター（CR 122.6：出るときに与えられるカウンターも「置かれる」）。置換も効く
    for (const [kind, n] of Object.entries(opts.counters ?? {})) addCounters(s, moved, kind, n);
    enterBattlefield(s, moved, trigger, opts.tapped ?? false);
  }
}

function leaveBattlefield(s: GameState, card: CardInstance, to: ZoneId, trigger: boolean, observers: CardInstance[]) {
  if (!isLand(card)) s.flags.nonlandLeft = true;
  // 戦場を離れた攻撃クリーチャーは戦闘から取り除かれる（ブロックされていた記録も消す）
  delete s.blocks[card.id];
  // 付いていた装備品は外れる（装備品が離れたときは、移動先で作り直されるので自然に外れる）
  for (const e of equipmentOn(s, card)) e.attachedTo = null;
  if (!(trigger && isCreature(card) && to === 'graveyard')) return;
  s.flags.creaturesDied++;
  const wasAttacking = card.attacking !== null;
  log(s, `${nameJa(card)} が死亡`);
  scriptOf(card).onDies?.(s, card);
  for (const other of [...observers, ...battlefield(s)]) scriptOf(other).onCreatureDies?.(s, other, card, wasAttacking);
}

function enterBattlefield(s: GameState, card: CardInstance, trigger: boolean, tapped: boolean) {
  const script = scriptOf(card);
  card.sick = true;
  card.tapped = tapped || (trigger && (script.etbTapped?.(s, card) ?? false));
  if (!trigger) return;
  script.onEnter?.(s, card);
  for (const other of battlefield(s)) {
    if (other.id === card.id) continue;
    scriptOf(other).onPermanentEnters?.(s, other, card);
    if (isCreature(card)) scriptOf(other).onCreatureEnters?.(s, other, card);
  }
}

export function createToken(s: GameState, name: string, n: number, opts: Partial<CardInstance> = {}): CardInstance[] {
  const made: CardInstance[] = [];
  log(s, `${TOKENS[name].jaName}トークンを${n}体生成`);
  for (let i = 0; i < n; i++) {
    const id = `t${s.nextToken++}`;
    const card = blankInstance(id, name, true, 'battlefield');
    s.cards[id] = card;
    s.zones.battlefield.push(id);
    Object.assign(card, opts);
    enterBattlefield(s, card, true, opts.tapped ?? false);
    made.push(card);
  }
  return made;
}

/** 全体除去。同時に死ぬので、先に墓地へ行ったものも後のものの死亡を見届ける（Garna など） */
export function destroyAll(s: GameState, ids: string[]) {
  const died = ids.map((id) => ({ ...s.cards[id] }));
  ids.forEach((id, i) => moveTo(s, id, 'graveyard', { observers: died.slice(0, i) }));
}

export function sacrifice(s: GameState, id: string) {
  log(s, `${nameJa(s.cards[id])} を生け贄に`);
  moveTo(s, id, 'graveyard');
}

/** 対戦相手を1人選ぶ。生き残りが1人なら聞かない */
export function chooseOpponent(s: GameState, title: string, then: (s: GameState, opp: number) => void) {
  const alive = aliveOpponents(s);
  if (alive.length === 1) {
    then(s, alive[0]);
    return;
  }
  ask(s, {
    title,
    options: alive.map((i) => ({ label: `対戦相手${i + 1}（${s.opponents[i].life}）`, value: i })),
    min: 1,
    max: 1,
    resolve: (st, [v]) => then(st, v as number),
  });
}

export function chooseCards(
  s: GameState,
  title: string,
  ids: string[],
  min: number,
  max: number,
  then: (s: GameState, ids: string[]) => void,
) {
  ask(s, {
    title,
    options: ids.map((id) => ({ label: nameJa(s.cards[id]), value: id, card: id })),
    min,
    max,
    resolve: (st, vs) => then(st, vs as string[]),
  });
}

/** はい／いいえ。cards は判断に要るカード（めくったカードなど）で、選択画面に並べて見せる */
export function confirm(s: GameState, title: string, then: (s: GameState) => void, cards?: string[]) {
  ask(s, {
    title,
    cards,
    options: [
      { label: 'はい', value: 1 },
      { label: 'いいえ', value: 0 },
    ],
    min: 1,
    max: 1,
    resolve: (st, [v]) => {
      if (v === 1) then(st);
    },
  });
}
