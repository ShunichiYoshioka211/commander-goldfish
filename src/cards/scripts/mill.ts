// 賢きモスマンのデッキ：RADカウンター・切削・+1/+1カウンター・増殖と、その受け皿。
// 対戦相手のライブラリーは枚数だけを持ち、切削した中身は近似で数える（engine/mill.ts）。
// 「〜してもよい」は、損にならないものは自動で行う（ドロー・トークン・探索カウンター・血の長の昇天）。
import {
  aliveOpponents, ask, chooseCards, confirm, createToken, creatures, destroyAll, draw, enqueue, isCreature,
  isLand, moveTo, nameJa, once, power, sacrifice, toughness, typeOf, def,
} from '../../engine/core';
import { addCounters, oppGetsRad, proliferate, radEach, youGetRad } from '../../engine/counters';
import { oppLoseLife } from '../../engine/damage';
import { identity, type ManaOption } from '../../engine/mana';
import { millOpponents, millYou } from '../../engine/mill';
import { addRival, destroyRival, destroyTarget } from '../../engine/rivals';
import { findRival, kindOf, rivalCreatures } from '../../engine/rivals/board';
import type { CardInstance, GameState, ManaColor } from '../../engine/types';
import type { Ability, CardScript } from '../types';
import { removal } from './spells';

const attacks = (card: CardInstance, attackers: CardInstance[]) => attackers.some((a) => a.id === card.id);
const hitsBy = (card: CardInstance, hits: { attacker: CardInstance; opp: number; amount: number }[]) =>
  hits.filter((h) => h.attacker.id === card.id);
const plusOne = (card: CardInstance) => card.counters['+1/+1'] ?? 0;

/**
 * 賢きモスマン：落ちた土地でないカードの枚数（X）まで、クリーチャーに+1/+1カウンターを1個ずつ置く。
 * クリーチャーが X 体以下なら全員に置き（選ぶ必要が無い）、多ければ選ぶ
 */
function spreadCounters(s: GameState, x: number) {
  const ids = creatures(s).map((c) => c.id);
  if (ids.length <= x) {
    for (const id of ids) addCounters(s, s.cards[id], '+1/+1', 1);
    return;
  }
  chooseCards(s, `賢きモスマン：+1/+1カウンターを置くクリーチャー（${x}体まで）`, ids, 0, x, (st, picked) => {
    for (const id of picked) addCounters(st, st.cards[id], '+1/+1', 1);
  });
}

/** 進化：自分より大きいクリーチャーが出たら+1/+1カウンター。条件は解決時にも確かめる（CR 603.4） */
const bigger = (entered: CardInstance, card: CardInstance) => power(entered) > power(card) || toughness(entered) > toughness(card);
const evolve: CardScript['onCreatureEnters'] = (s, card, entered) => {
  if (!bigger(entered, card)) return;
  enqueue(s, `${nameJa(card)}：進化`, (st) => {
    // 出たものが戦場を離れていたら、最後の情報で比べる
    const now = { ...entered, ...st.cards[entered.id] };
    if (bigger(now, st.cards[card.id])) addCounters(st, st.cards[card.id], '+1/+1', 1);
  });
};

/** 順応 N：+1/+1カウンターが無いときだけ起動できる（あるときは何も起きないので、ボタンを出さない） */
const adapt = (n: number, cost: string): Ability => ({
  label: `順応${n}`,
  cost,
  can: (_s, card) => plusOne(card) === 0,
  run: (s, card) => void addCounters(s, card, '+1/+1', n),
});

/** このクリーチャー自身に+1/+1カウンターが置かれたとき */
const onOwnCounters = (run: (s: GameState, card: CardInstance, n: number) => void): CardScript['onCountersPut'] => (s, card, target, kind, n) => {
  if (target.id === card.id && kind === '+1/+1') run(s, card, n);
};

/**
 * 1色を n 点出すクリーチャー（囁かれる希望の神・培養ドルイド）。自動支払いでは1点として数え（少なめの近似）、
 * n 点出すときはカード詳細から手動でタップする
 */
const oneColorMana = (s: GameState, n: number): ManaOption[] => [
  ...identity(s).map((c): ManaOption => ({ label: `{${c}}`, produce: [c], auto: true })),
  ...identity(s).map((c): ManaOption => ({ label: `{${c}}×${n}`, produce: Array<ManaColor>(n).fill(c), manual: true })),
];

/** 対象のプレイヤーを選ぶ（あなたか、生きている対戦相手） */
function choosePlayer(s: GameState, title: string, then: (s: GameState, who: 'you' | number) => void) {
  ask(s, {
    title,
    options: [
      { label: 'あなた', value: 'you' },
      ...aliveOpponents(s).map((i) => ({
        label: `対戦相手${i + 1}（RAD ${s.opponents[i].rad}・ライブラリー${s.opponents[i].library}枚）`,
        value: i,
      })),
    ],
    min: 1,
    max: 1,
    resolve: (st, [v]) => then(st, v === 'you' ? 'you' : (v as number)),
  });
}

export const MILL_SCRIPTS: Record<string, CardScript> = {
  // ---- 統率者 ----
  'The Wise Mothman': {
    onEnter: (s) => enqueue(s, '賢きモスマン：各プレイヤーにRADカウンター', (st) => radEach(st, 1)),
    onAttack: (s, card, attackers) => {
      if (attacks(card, attackers)) enqueue(s, '賢きモスマンの攻撃：各プレイヤーにRADカウンター', (st) => radEach(st, 1));
    },
    onMilled: (s, _card, ev) => {
      if (ev.nonland > 0) enqueue(s, '賢きモスマン：+1/+1カウンター', (st) => spreadCounters(st, ev.nonland));
    },
  },

  // ---- カウンターを増やす置換 ----
  'Hardened Scales': { moreCounters: (_s, _c, target, kind) => Number(target !== 'you' && kind === '+1/+1' && isCreature(target)) },
  'Winding Constrictor': {
    // アーティファクトかクリーチャーに置くカウンターと、あなたが得るカウンター（RADを含む）を1個多く
    moreCounters: (_s, _c, target) => Number(target === 'you' || isCreature(target) || typeOf(target, 'Artifact')),
  },
  'Kami of Whispered Hopes': {
    moreCounters: (_s, _c, target, kind) => Number(target !== 'you' && kind === '+1/+1'),
    mana: (s, card) => oneColorMana(s, power(card)),
  },
  'Corpsejack Menace': { doubleCounters: (_s, _c, target, kind) => kind === '+1/+1' && isCreature(target) },
  'Branching Evolution': { doubleCounters: (_s, _c, target, kind) => kind === '+1/+1' && isCreature(target) },

  // ---- RADカウンターを与える ----
  'Screeching Scorchbeast': {
    onAttack: (s, card, attackers) => {
      if (attacks(card, attackers)) enqueue(s, '金切り声のスコーチビースト：各プレイヤーにRADカウンター2個', (st) => radEach(st, 2));
    },
    // 1ターンに1回。このアプリでは、土地でないカードが落ちた最初の切削で作る
    onMilled: (s, card, ev) => {
      if (ev.nonland > 0 && once(s, `scorchbeast:${card.id}`)) {
        enqueue(s, '金切り声のスコーチビースト', (st) => void createToken(st, 'Zombie Mutant', ev.nonland));
      }
    },
  },
  'Nuclear Fallout': {
    cast: {
      x: true,
      resolve: (s, _card, info) => {
        const x = info.x;
        // 同時に死ぬので相手のクリーチャーを先に（病的な日和見主義者が見届けられるように）。
        // 相手のクリーチャーはタフネスが 2X 以下なら死に、残るものは 2X 点のダメージとして扱う（パワーの修整は近似で無視）
        for (const { opp, p } of rivalCreatures(s).filter((r) => kindOf(r.p).toughness - r.p.damage <= 2 * x)) destroyRival(s, opp, p.id);
        for (const { p } of rivalCreatures(s)) p.damage += 2 * x;
        for (const c of creatures(s)) Object.assign(c, { tempPower: c.tempPower - 2 * x, tempToughness: c.tempToughness - 2 * x });
        destroyAll(s, creatures(s).filter((c) => toughness(c) <= 0).map((c) => c.id));
        radEach(s, x);
      },
    },
  },
  'Glowing One': {
    onCombatDamage: (s, card, hits) => {
      for (const h of hitsBy(card, hits)) enqueue(s, '光る輩：RADカウンター4個', (st) => oppGetsRad(st, h.opp, 4));
    },
    // プレイヤーが土地でないカードを1枚切削するたび、1点回復する
    onMilled: (s, _card, ev) => {
      if (ev.nonland > 0) enqueue(s, '光る輩：ライフを得る', (st) => void (st.life += ev.nonland));
    },
  },
  'Infesting Radroach': {
    onCombatDamage: (s, card, hits) => {
      for (const h of hitsBy(card, hits)) enqueue(s, '群生するラッドローチ：RADカウンター', (st) => oppGetsRad(st, h.opp, h.amount));
    },
    // 墓地にあるとき、対戦相手が土地でないカードを切削したら手札に戻す
    onMilledInGraveyard: (s, card, ev) => {
      if (ev.opps.some((m) => m.nonland > 0)) enqueue(s, '群生するラッドローチ：手札に戻す', (st) => moveTo(st, card.id, 'hand'));
    },
  },
  'Feral Ghoul': {
    onCreatureDies: (s, card) => enqueue(s, 'フェラル・グール：+1/+1カウンター', (st) => void addCounters(st, st.cards[card.id], '+1/+1', 1)),
    onDies: (s, card) => {
      const n = power(card);
      enqueue(s, 'フェラル・グール：各対戦相手にRADカウンター', (st) => {
        for (const i of aliveOpponents(st)) oppGetsRad(st, i, n);
      });
    },
  },
  'Mirelurk Queen': {
    onEnter: (s) =>
      enqueue(s, 'マイアラーク・クイーン', (st) =>
        choosePlayer(st, 'マイアラーク・クイーン：RADカウンター2個を与えるプレイヤー', (st2, who) => {
          if (who === 'you') youGetRad(st2, 2);
          else oppGetsRad(st2, who, 2);
        }),
      ),
    // 毎ターン1回：切削で土地でないカードが落ちたら、1枚引いて+1/+1カウンター
    onMilled: (s, card, ev) => {
      if (ev.nonland > 0 && once(s, `queen:${card.id}`)) {
        enqueue(s, 'マイアラーク・クイーン：1枚引く', (st) => {
          draw(st, 1);
          addCounters(st, st.cards[card.id], '+1/+1', 1);
        });
      }
    },
  },
  'Vexing Radgull': {
    onCombatDamage: (s, card, hits) => {
      for (const h of hitsBy(card, hits)) {
        enqueue(s, '厄介なラッドガル', (st) => {
          if (st.opponents[h.opp].rad === 0) oppGetsRad(st, h.opp, 2);
          else proliferate(st);
        });
      }
    },
  },
  'Tato Farmer': {
    onPermanentEnters: (s, _card, entered) => {
      if (isLand(entered)) enqueue(s, 'テイト農夫', (st) => confirm(st, 'テイト農夫：RADカウンター2個を得る？', (st2) => youGetRad(st2, 2)));
    },
  },
  'Mariposa Military Base': {
    // 「タップ状態で出してもよい」は誘発型能力ではないので、しっぺ返しの候補に出さない
    onEnter: (s, card) =>
      enqueue(
        s,
        'マリポーサ軍事基地',
        (st) =>
          confirm(st, 'マリポーサ軍事基地：タップ状態で出して、RADカウンター2個を得る？', (st2) => {
            st2.cards[card.id].tapped = true;
            youGetRad(st2, 2);
          }),
        false,
      ),
  },

  // ---- 増殖 ----
  Thrummingbird: {
    onCombatDamage: (s, card, hits) => {
      for (const _ of hitsBy(card, hits)) enqueue(s, 'かき鳴らし鳥：増殖', proliferate);
    },
  },
  'Flux Channeler': {
    onCast: (s, _card, spell) => {
      if (!typeOf(spell, 'Creature')) enqueue(s, '流束の媒介者：増殖', proliferate);
    },
  },
  'Evolution Sage': {
    onPermanentEnters: (s, _card, entered) => {
      if (isLand(entered)) enqueue(s, '進化の賢者：増殖', proliferate);
    },
  },
  "Karn's Bastion": { abilities: [{ label: '増殖', cost: '{4}', tap: true, run: (s) => proliferate(s) }] },
  'Experimental Augury': {
    cast: {
      resolve: (s) => {
        const top = s.zones.library.slice(0, 3);
        const k = Math.min(1, top.length);
        chooseCards(s, '実験的占い：手札に加えるカード（残りはライブラリーの下へ）', top, k, k, (st, picked) => {
          for (const id of picked) moveTo(st, id, 'hand');
          for (const id of top.filter((x) => !picked.includes(x))) moveTo(st, id, 'library', { bottom: true });
          proliferate(st);
        });
      },
    },
  },
  // 相手ありモードでは対象を選んで破壊し、相手なしでは増殖だけ（破壊は編集モードで）
  Atomize: {
    cast: {
      target: { mine: (_s, c) => !isLand(c) },
      resolve: (s, _card, info) => {
        if (info.target !== null) destroyTarget(s, info.target);
        proliferate(s);
      },
    },
  },
  // 呪禁・破壊不能・ダメージの軽減は手動。増殖だけ自動
  'Mutational Advantage': { cast: { resolve: (s) => proliferate(s) } },
  // ストーム：このターンに先に唱えた呪文の数だけコピー（あなたの呪文だけを数える）
  Radstorm: {
    cast: {
      resolve: (s) => {
        for (let i = 0; i < s.flags.spellsCast; i++) proliferate(s);
      },
    },
  },

  // ---- 切削 ----
  'Thought Scour': {
    cast: {
      resolve: (s) =>
        choosePlayer(s, '思考掃き：カード2枚を切削するプレイヤー', (st, who) => {
          if (who === 'you') millYou(st, 2);
          else millOpponents(st, [who], 2);
          draw(st, 1);
        }),
    },
  },
  'Ruin Crab': {
    onPermanentEnters: (s, _card, entered) => {
      if (isLand(entered)) enqueue(s, '遺跡ガニ：各対戦相手が3枚切削', (st) => void millOpponents(st, aliveOpponents(st), 3));
    },
  },
  'Altar of the Brood': {
    onPermanentEnters: (s) => enqueue(s, '群の祭壇：各対戦相手が1枚切削', (st) => void millOpponents(st, aliveOpponents(st), 1)),
  },
  "Stitcher's Supplier": {
    onEnter: (s) => enqueue(s, '縫い師への供給者：3枚切削', (st) => void millYou(st, 3)),
    onDies: (s) => enqueue(s, '縫い師への供給者：3枚切削', (st) => void millYou(st, 3)),
  },
  'Aftermath Analyst': {
    onEnter: (s) => enqueue(s, '事件現場の分析者：3枚切削', (st) => void millYou(st, 3)),
    abilities: [
      {
        label: '生け贄に捧げ、墓地の土地をすべてタップ状態で戻す',
        cost: '{3}{G}',
        run: (s, card) => {
          sacrifice(s, card.id);
          for (const id of s.zones.graveyard.filter((x) => isLand(s.cards[x]))) moveTo(s, id, 'battlefield', { tapped: true });
        },
      },
    ],
  },
  // 攻撃したとき3枚切削し、その中の土地1枚を手札に加えてもよい（回顧は手動）
  Six: {
    onAttack: (s, card, attackers) => {
      if (!attacks(card, attackers)) return;
      enqueue(s, '六番：3枚切削', (st) => {
        const lands = millYou(st, 3).you.filter((id) => isLand(st.cards[id]));
        if (lands.length > 0) {
          chooseCards(st, '六番：手札に加える土地（加えないなら選ばずに決定）', lands, 0, 1, (st2, ids) => {
            for (const id of ids) moveTo(st2, id, 'hand');
          });
        }
      });
    },
  },
  // ライブラリーから墓地に置かれた土地を、タップ状態で戦場に出す（搭乗して攻撃したときの切削は手動）
  'Hedge Shredder': {
    onMilled: (s, _card, ev) => {
      const lands = ev.you.filter((id) => isLand(s.cards[id]));
      if (lands.length === 0) return;
      enqueue(s, '生垣裁断機：切削した土地を戦場へ', (st) => {
        for (const id of lands.filter((x) => st.cards[x].zone === 'graveyard')) moveTo(st, id, 'battlefield', { tapped: true });
      });
    },
  },
  'The Water Crystal': {
    oppMillBonus: 4,
    spellCostReduction: (_s, _c, spell) => Number(def(spell).colors.includes('U')),
    abilities: [
      {
        label: '各対戦相手は手札の枚数だけ切削',
        cost: '{4}{U}{U}',
        tap: true,
        run: (s) => void millOpponents(s, aliveOpponents(s), s.zones.hand.length),
      },
    ],
  },

  // ---- 勝ち筋：血の長の昇天＋精神クランク（湖の町の統領） ----
  Mindcrank: {
    onOpponentLosesLife: (s, _card, opp, n) => enqueue(s, '精神クランク', (st) => void millOpponents(st, [opp], n)),
  },
  'The Master of Lake-town': {
    onOpponentLosesLife: (s, _card, opp, n) => enqueue(s, '湖の町の統領', (st) => void millOpponents(st, [opp], n)),
    onYouLoseLife: (s, _card, n) => enqueue(s, '湖の町の統領：あなたが切削', (st) => void millYou(st, n)),
    // 死亡したとき、7枚以上ある墓地1つにつき1枚引く
    onDies: (s) =>
      enqueue(s, '湖の町の統領：引く', (st) =>
        draw(
          st,
          [st.zones.graveyard.length, ...st.opponents.filter((o) => o.deadTurn === null).map((o) => o.graveyard)].filter((n) => n >= 7).length,
        ),
      ),
  },
  'Bloodchief Ascension': {
    // 各終了ステップ：このターンに対戦相手のだれかが2点以上失っていたら、探索カウンター
    onEachEndStep: (s, card) => {
      if (s.flags.oppLifeLost.some((n) => n >= 2)) enqueue(s, '血の長の昇天：探索カウンター', (st) => void addCounters(st, st.cards[card.id], 'quest', 1));
    },
    // 探索カウンターが3個以上なら、対戦相手の墓地にカードが1枚置かれるたび、その相手は2点失い、あなたは2点得る。
    // このアプリでは、対戦相手の墓地に置かれるカードは切削だけを数える
    onMilled: (s, card, ev) => {
      if ((card.counters.quest ?? 0) < 3) return;
      for (const m of ev.opps.filter((x) => x.total > 0)) {
        enqueue(s, '血の長の昇天', (st) => {
          for (let i = 0; i < m.total; i++) st.life += oppLoseLife(st, m.opp, 2, '血の長の昇天');
        });
      }
    },
  },

  // ---- +1/+1カウンターの受け皿 ----
  'Fathom Mage': {
    onCreatureEnters: evolve,
    onCountersPut: onOwnCounters((s, _card, n) => enqueue(s, '水深の魔道士：引く', (st) => draw(st, n))),
  },
  'Pensive Professor': {
    onCountersPut: onOwnCounters((s) => enqueue(s, '沈思の教授：1枚引く', (st) => draw(st, 1))),
    // 増分：支払ったマナがパワーかタフネスより多い呪文を唱えたら
    onCast: (s, card, _spell, spent) => {
      if (spent > Math.min(power(card), toughness(card))) enqueue(s, '沈思の教授：増分', (st) => void addCounters(st, st.cards[card.id], '+1/+1', 1));
    },
  },
  'Ray Fillet, Wave Warrior': {
    onCreatureEnters: evolve,
    onCombatDamage: (s, _card, hits) => {
      for (const _ of hits.filter((h) => Object.values(h.attacker.counters).some((n) => n > 0))) {
        enqueue(s, '海中の戦士、レイ・フィレット：1枚引く', (st) => draw(st, 1));
      }
    },
  },
  'Bred for the Hunt': {
    onCombatDamage: (s, _card, hits) => {
      for (const _ of hits.filter((h) => plusOne(h.attacker) > 0)) enqueue(s, '狩りの仕込み：1枚引く', (st) => draw(st, 1));
    },
  },
  'Basking Broodscale': {
    abilities: [adapt(1, '{1}{G}')],
    onCountersPut: onOwnCounters((s) => enqueue(s, '日を浴びる繁殖鱗：落とし子', (st) => void createToken(st, 'Eldrazi Spawn', 1))),
  },
  'Evolution Witness': {
    abilities: [adapt(2, '{1}{G}')],
    onCountersPut: onOwnCounters((s) =>
      enqueue(s, '進化の証人：墓地のパーマネント・カードを手札に', (st) => {
        const ids = st.zones.graveyard.filter((id) => !/Instant|Sorcery/.test(def(st.cards[id]).typeLine));
        if (ids.length > 0) chooseCards(st, '進化の証人：手札に戻すパーマネント・カード', ids, 1, 1, (st2, [id]) => moveTo(st2, id, 'hand'));
      }),
    ),
  },
  Terrasymbiosis: {
    // 毎ターン1回：あなたのクリーチャーに+1/+1カウンターを置いたら、その個数だけ引く
    onCountersPut: (s, card, target, kind, n) => {
      if (kind === '+1/+1' && isCreature(target) && once(s, `terrasymbiosis:${card.id}`)) enqueue(s, '惑星共生：引く', (st) => draw(st, n));
    },
  },
  'Jenova, Ancient Calamity': {
    // 戦闘開始時：ほかのクリーチャー最大1体に、ジェノバのパワーに等しい+1/+1カウンター（ミュータントになるのは近似で無視）
    onCombatStart: (s, card) =>
      enqueue(s, '古代の災厄、ジェノバ', (st) => {
        const n = power(st.cards[card.id]);
        const others = creatures(st).filter((c) => c.id !== card.id).map((c) => c.id);
        if (others.length > 0) {
          chooseCards(st, `ジェノバ：+1/+1カウンター${n}個を置くクリーチャー（置かないなら選ばずに決定）`, others, 0, 1, (st2, ids) => {
            for (const id of ids) addCounters(st2, st2.cards[id], '+1/+1', n);
          });
        }
      }),
    // あなたのターンにミュータントが死亡したら、そのパワーだけ引く
    onCreatureDies: (s, _card, died) => {
      if (typeOf(died, 'Mutant') && s.active === null) {
        const n = power(died);
        enqueue(s, 'ジェノバ：引く', (st) => draw(st, n));
      }
    },
  },
  'Hangarback Walker': {
    // X個の+1/+1カウンターが置かれた状態で戦場に出る（0個なら 0/0 で死亡する）
    cast: { x: true, entersWith: (info) => ({ '+1/+1': info.x }) },
    abilities: [{ label: '+1/+1カウンターを置く', cost: '{1}', tap: true, run: (s, card) => void addCounters(s, card, '+1/+1', 1) }],
    onDies: (s, card) => {
      const n = plusOne(card);
      if (n > 0) enqueue(s, '搭載歩行機械：飛行機械', (st) => void createToken(st, 'Thopter', n));
    },
  },
  'Incubation Druid': {
    abilities: [adapt(3, '{3}{G}{G}')],
    mana: (s, card) => oneColorMana(s, plusOne(card) > 0 ? 3 : 1),
  },
  // 破壊不能は手動。引く枚数だけ自動
  'Inspiring Call': { cast: { resolve: (s) => draw(s, creatures(s).filter((c) => plusOne(c) > 0).length) } },

  // ---- 除去（相手ありモードで対象を選ぶ） ----
  'Go for the Throat': removal((_s, c) => isCreature(c) && !typeOf(c, 'Artifact'), () => 0),
  // 対戦相手のパーマネントだけが対象（相手がライブラリーから基本土地を探すのは数えない）
  "Assassin's Trophy": removal(() => false, () => 0),
  // 壊したパーマネントのコントローラーが3/3のビーストを得る
  'Beast Within': {
    rivalsOnly: true,
    cast: {
      target: { mine: () => true },
      resolve: (s, _card, info) => {
        if (info.target === null) return;
        const rival = findRival(s, info.target);
        destroyTarget(s, info.target);
        if (rival) addRival(s, rival.opp, 'beastToken');
        else createToken(s, 'Beast', 1);
      },
    },
  },
};
