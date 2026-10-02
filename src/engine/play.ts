// 土地のプレイ・呪文を唱える・起動型能力。
// 選択待ちをまたぐ続きの処理は、必ず引数で渡される最新の状態（st）を使う。
import { scriptOf } from '../cards/registry';
import type { Ability, CastInfo, ExtraCost } from '../cards/types';
import { ask, def, drain, hasKeyword, isCreature, isLand, log, moveTo, nameJa, typeOf } from './core';
import { canPay, parseCost, pay, type Cost } from './mana';
import type { CardInstance, GameState } from './types';

export interface CastMode {
  index: number;
  label: string;
  cost: Cost;
  instant: boolean;
  /** 手札からしか唱えられない（ワープ） */
  hand: boolean;
}

const isMain = (s: GameState) => s.phase === 'main1' || s.phase === 'main2';
export const idle = (s: GameState) => s.prompt === null && s.phase !== 'over' && s.phase !== 'mulligan';

const firstType = (card: CardInstance) => def(card).typeLine.split(' // ')[0];
const isInstantType = (card: CardInstance) => /Instant/.test(firstType(card)) || hasKeyword(card, 'Flash');
const isPermanentType = (card: CardInstance) => !/Instant|Sorcery/.test(firstType(card));

export function canPlayLand(s: GameState, card: CardInstance) {
  return idle(s) && isMain(s) && isLand(card) && card.zone === 'hand' && !s.landPlayed;
}

export function playLand(s: GameState, id: string) {
  s.landPlayed = true;
  log(s, `${nameJa(s.cards[id])} をプレイ`);
  moveTo(s, id, 'battlefield');
  drain(s);
}

/** いま唱えられる唱え方の一覧（タイミングが合い、マナが払えるものだけ） */
export function castModes(s: GameState, card: CardInstance): CastMode[] {
  if (!idle(s) || isLand(card)) return [];
  const spec = scriptOf(card).cast ?? {};
  const fromGraveyard = card.zone === 'graveyard';
  const castableZone =
    card.zone === 'hand' || card.zone === 'command' || (card.zone === 'exile' && card.castable) || (fromGraveyard && !!spec.flashback);
  if (!castableZone) return [];
  const raw = spec.modes ?? [{ label: nameJa(card), cost: def(card).manaCost }];
  const modes: CastMode[] = raw.map((m, index) => ({
    index,
    label: m.label,
    cost: parseCost(fromGraveyard ? spec.flashback! : m.cost),
    instant: 'instant' in m && m.instant === true,
    hand: 'hand' in m && m.hand === true,
  }));
  return modes.filter((m) => {
    if ((card.zone === 'exile' && m.instant) || (m.hand && card.zone !== 'hand')) return false;
    if (!(isInstantType(card) || m.instant || isMain(s))) return false;
    m.cost.generic = Math.max(0, m.cost.generic - (spec.reduce?.(s) ?? 0));
    if (card.zone === 'command') m.cost.generic += 2 * (s.commanderCasts[card.name] ?? 0);
    return canPay(s, m.cost);
  });
}

export function cast(s: GameState, id: string, modeIndex: number) {
  const card = s.cards[id];
  const mode = castModes(s, card).find((m) => m.index === modeIndex)!;
  const spec = scriptOf(card).cast ?? {};
  const extra = spec.modes?.[modeIndex]?.extra ?? spec.extra;
  const info: CastInfo = { x: 0, sacrificed: null, mode: modeIndex, from: card.zone };
  const afterX = (st: GameState) => chooseExtra(st, id, extra, info, (st2) => finishCast(st2, id, mode, info));
  if (spec.x) {
    const options = [];
    for (let x = 0; canPay(s, { ...mode.cost, generic: mode.cost.generic + x }); x++) options.push({ label: `X=${x}`, value: x });
    ask(s, {
      title: `${nameJa(card)} の X は？`,
      options,
      min: 1,
      max: 1,
      resolve: (st, [v]) => {
        info.x = v as number;
        mode.cost.generic += info.x;
        afterX(st);
      },
    });
  } else {
    afterX(s);
  }
  drain(s);
}

function chooseExtra(s: GameState, id: string, extra: ExtraCost | undefined, info: CastInfo, next: (s: GameState) => void) {
  if (!extra) return next(s);
  if (extra === 'discardOrLife') {
    const others = s.zones.hand.filter((x) => x !== id);
    ask(s, {
      title: '追加コスト：カードを1枚捨てるか、3点のライフを支払う',
      options: [{ label: '3点のライフを支払う', value: 'life' }, ...others.map((x) => ({ label: `捨てる：${nameJa(s.cards[x])}`, value: x, card: x }))],
      min: 1,
      max: 1,
      resolve: (st, [v]) => {
        if (v === 'life') st.life -= 3;
        else moveTo(st, v as string, 'graveyard');
        next(st);
      },
    });
    return;
  }
  const candidates = s.zones.battlefield.filter((x) => {
    const c = s.cards[x];
    return isCreature(c) || (extra === 'sacArtifactOrCreature' && typeOf(c, 'Artifact'));
  });
  if (candidates.length === 0) {
    log(s, '生け贄にできるパーマネントが無い');
    return;
  }
  ask(s, {
    title: `${nameJa(s.cards[id])}：生け贄に捧げるパーマネント`,
    options: candidates.map((x) => ({ label: nameJa(s.cards[x]), value: x, card: x })),
    min: 1,
    max: 1,
    resolve: (st, [v]) => {
      info.sacrificed = { ...st.cards[v as string] };
      next(st);
    },
  });
}

/** マナは castModes で払えることを確かめてあるので、ここでは失敗しない */
function finishCast(s: GameState, id: string, mode: CastMode, info: CastInfo) {
  const card = s.cards[id];
  pay(s, mode.cost);
  if (info.sacrificed) {
    log(s, `${nameJa(info.sacrificed)} を生け贄に`);
    moveTo(s, info.sacrificed.id, 'graveyard');
  }
  if (info.from === 'command') s.commanderCasts[card.name] = (s.commanderCasts[card.name] ?? 0) + 1;
  log(s, `${mode.label} を唱えた`);
  const resolve = scriptOf(card).cast?.resolve;
  if (isPermanentType(card) && !mode.instant) {
    moveTo(s, id, 'battlefield');
    resolve?.(s, s.cards[id], info);
    return;
  }
  moveTo(s, id, info.from === 'graveyard' || mode.instant ? 'exile' : 'graveyard');
  // 出来事で追放したカードは、あとでパーマネント側を唱えられる
  s.cards[id].castable = mode.instant;
  resolve?.(s, s.cards[id], info);
}

// ---- 起動型能力 ----

export function abilitiesOf(card: CardInstance): Ability[] {
  return (scriptOf(card).abilities ?? []).filter((a) => (a.zone ?? 'battlefield') === card.zone);
}

export function canActivate(s: GameState, card: CardInstance, a: Ability) {
  if (!idle(s)) return false;
  if (a.sorcery && !isMain(s)) return false;
  if (a.tap && (card.tapped || (isCreature(card) && card.sick && !card.haste))) return false;
  if (a.can && !a.can(s, card)) return false;
  return !a.cost || canPay(s, parseCost(a.cost));
}

export function activate(s: GameState, id: string, index: number) {
  const card = s.cards[id];
  const a = abilitiesOf(card)[index];
  if (a.cost) pay(s, parseCost(a.cost));
  if (a.tap) card.tapped = true;
  log(s, `${nameJa(card)}：${a.label}`);
  a.run(s, card);
  drain(s);
}
