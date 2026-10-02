// 土地・マナ発生源。タップインの条件と、条件付きのマナ能力。
import { ask, chooseCards, enqueue, lands, log, moveTo, nameJa, sacrifice, shuffleLibrary, typeOf } from '../../engine/core';
import { identity, type ManaOption } from '../../engine/mana';
import type { CardInstance, GameState } from '../../engine/types';
import type { CardScript } from '../types';

const otherLands = (s: GameState, card: CardInstance) => lands(s).filter((l) => l.id !== card.id);
const controls = (s: GameState, card: CardInstance, t: string) => otherLands(s, card).some((l) => typeOf(l, t));
const BR: ManaOption[] = [
  { label: '{B}', produce: ['B'] },
  { label: '{R}', produce: ['R'] },
];
const C: ManaOption = { label: '{C}', produce: ['C'] };

function scry1(s: GameState) {
  const top = s.zones.library[0];
  ask(s, {
    title: `占術1：一番上は「${nameJa(s.cards[top])}」`,
    cards: [top],
    options: [
      { label: '上に残す', value: 'top' },
      { label: '下に置く', value: 'bottom' },
    ],
    min: 1,
    max: 1,
    resolve: (st, [v]) => {
      if (v === 'bottom') moveTo(st, top, 'library', { bottom: true });
    },
  });
}

const filterMana = (produce: ['B' | 'R', 'B' | 'R']): ManaOption => ({
  label: `{B/R}を払って {${produce[0]}}{${produce[1]}}`,
  produce,
  manual: true,
  extra: (s) => {
    const color = s.pool.B > 0 ? 'B' : s.pool.R > 0 ? 'R' : null;
    if (!color) {
      log(s, 'マナ・プールに {B} か {R} が必要');
      return false;
    }
    s.pool[color]--;
    return true;
  },
});

/** ペインランド・タリスマン：{C} はただ、{B}/{R} は1点受ける */
const painOrColorless: ManaOption[] = [C, ...BR.map((o) => ({ ...o, pain: true, label: `${o.label}（1点受ける）` }))];

/** プールから不特定マナを1つ払う（無色を優先） */
const payOneFromPool = (s: GameState) => {
  const color = (['C', 'B', 'R'] as const).find((c) => s.pool[c] > 0);
  if (!color) {
    log(s, 'マナ・プールに払うマナが無い');
    return false;
  }
  s.pool[color]--;
  return true;
};

export const LAND_SCRIPTS: Record<string, CardScript> = {
  'Blackcleave Cliffs': { etbTapped: (s, c) => otherLands(s, c).length > 2 },
  'Dragonskull Summit': { etbTapped: (s, c) => !controls(s, c, 'Swamp') && !controls(s, c, 'Mountain') },
  'Foreboding Ruins': {
    etbTapped: (s) => !s.zones.hand.some((id) => typeOf(s.cards[id], 'Swamp') || typeOf(s.cards[id], 'Mountain')),
  },
  'Razortrap Gorge': {
    etbTapped: (s) => s.life > 13 && s.opponents.every((o) => o.deadTurn !== null || o.life > 13),
  },
  'Smoldering Marsh': { etbTapped: (s, c) => otherLands(s, c).filter((l) => typeOf(l, 'Basic')).length < 2 },
  'Temple of Malice': { etbTapped: () => true, onEnter: (s) => enqueue(s, '占術1', scry1) },
  'Lavaclaw Reaches': {
    etbTapped: () => true,
    abilities: [{ label: '2/2 クリーチャーになる', cost: '{1}{B}{R}', run: (_s, c) => void (c.animated = { power: 2, toughness: 2 }) }],
  },
  'Restless Vents': {
    etbTapped: () => true,
    abilities: [{ label: '2/3 威迫クリーチャーになる', cost: '{1}{B}{R}', run: (_s, c) => void (c.animated = { power: 2, toughness: 3 }) }],
  },
  'Dark Fortress': {
    mana: (s, c) => (c.sick || controls(s, c, 'Basic') ? [C, ...BR] : [C]),
  },
  'Tainted Peak': {
    mana: (s, c) => (controls(s, c, 'Swamp') ? [C, ...BR] : [C]),
  },
  'Graven Cairns': {
    mana: () => [C, filterMana(['B', 'B']), filterMana(['B', 'R']), filterMana(['R', 'R'])],
  },
  'Fabled Passage': {
    abilities: [
      {
        label: '基本土地を探す',
        tap: true,
        can: (s) => s.zones.library.some((id) => typeOf(s.cards[id], 'Basic')),
        run: (s, card) => {
          sacrifice(s, card.id);
          const basics = s.zones.library.filter((id) => typeOf(s.cards[id], 'Basic'));
          const firstByName = basics.filter((id, i) => basics.findIndex((x) => s.cards[x].name === s.cards[id].name) === i);
          chooseCards(s, '戦場に出す基本土地', firstByName, 1, 1, (st, [id]) => {
            moveTo(st, id, 'battlefield', { tapped: true });
            if (lands(st).length >= 4) st.cards[id].tapped = false;
            shuffleLibrary(st);
          });
        },
      },
    ],
  },
  'Sulfurous Springs': { mana: () => painOrColorless },
  'Talisman of Indulgence': { mana: () => painOrColorless },
  // マナは装備品を唱えるか装備にしか使えないので、自動支払いには使わない（詳細から手動でタップする）
  'Freya Crescent': { mana: () => [{ label: '{R}（装備品・装備にだけ使える）', produce: ['R'], manual: true }] },
  'Sol Ring': { mana: () => [{ label: '{C}{C}', produce: ['C', 'C'] }] },
  'Rakdos Signet': {
    // 自動支払いでは「{B}か{R}を1つ出す」とみなす（{1}を払って2つ出すので、ほかに発生源があれば正味の量は同じ）
    mana: () => [
      { label: '{1}を払って {B}{R}', produce: ['B', 'R'], manual: true, extra: payOneFromPool },
      { label: '{B}', produce: ['B'], auto: true },
      { label: '{R}', produce: ['R'], auto: true },
    ],
  },
  Treasure: {
    mana: (s) =>
      identity(s).map((color) => ({
        label: `生け贄に捧げて {${color}}`,
        produce: [color],
        manual: true,
        extra: (s, card) => {
          sacrifice(s, card.id);
          return true;
        },
      })),
  },
};
