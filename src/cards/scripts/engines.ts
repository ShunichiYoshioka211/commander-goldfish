// トークン生成源と、戦闘・ターンの区切りで誘発するもの。
import {
  ask, battlefield, chooseCards, confirm, createToken, creatures, draw, enqueue, isCommander, isCreature, isLand, log,
  moveTo, nameJa, power, sacrifice, shuffleLibrary, typeOf,
} from '../../engine/core';
import { damageAny } from '../../engine/damage';
import { pay, parseCost } from '../../engine/mana';
import type { CardInstance, GameState } from '../../engine/types';
import type { CardScript } from '../types';

const atCombat = (label: string, make: (s: GameState, card: CardInstance) => void): CardScript['onCombatStart'] => (s, card) =>
  enqueue(s, label, (st) => make(st, st.cards[card.id]));

/** 戦闘ダメージを受けた対戦相手（重複なし） */
const playersHit = (hits: { opp: number }[]) => [...new Set(hits.map((h) => h.opp))];

function explore(s: GameState, card: CardInstance) {
  const top = s.zones.library[0];
  const revealed = s.cards[top];
  log(s, `${nameJa(card)} が探検：${nameJa(revealed)}`);
  if (isLand(revealed)) {
    moveTo(s, top, 'hand');
    return;
  }
  card.counters['+1/+1'] = (card.counters['+1/+1'] ?? 0) + 1;
  confirm(s, `探検：「${nameJa(revealed)}」を墓地に置く？`, (st) => moveTo(st, top, 'graveyard'), [top]);
}

export const ENGINE_SCRIPTS: Record<string, CardScript> = {
  'Goblin Assault': {
    onUpkeep: (s) => enqueue(s, 'ゴブリンの突撃', (st) => void createToken(st, 'Goblin', 1, { haste: true })),
  },
  'Legion Warboss': {
    onCombatStart: atCombat('軍勢の戦親分', (s) => void createToken(s, 'Goblin', 1, { haste: true })),
    onAttack: (s, card, attackers) => {
      if (!attackers.some((a) => a.id === card.id)) return;
      const target = attackers.find((a) => power(a) < power(card));
      if (target) {
        enqueue(s, '教導', (st) => {
          const t = st.cards[target.id];
          t.counters['+1/+1'] = (t.counters['+1/+1'] ?? 0) + 1;
        });
      }
    },
  },
  'Siege-Gang Lieutenant': {
    onCombatStart: (s) => {
      if (battlefield(s).some((c) => isCommander(s, c))) enqueue(s, '包囲攻撃の副官', (st) => void createToken(st, 'Goblin', 2, { haste: true }));
    },
    abilities: [
      {
        label: 'ゴブリンを生け贄に1点',
        cost: '{2}',
        can: (s) => creatures(s).some((c) => typeOf(c, 'Goblin')),
        run: (s, card) => {
          const goblins = creatures(s).filter((c) => typeOf(c, 'Goblin')).map((c) => c.id);
          chooseCards(s, '生け贄に捧げるゴブリン', goblins, 1, 1, (st, [id]) => {
            sacrifice(st, id);
            damageAny(st, card, 1);
          });
        },
      },
    ],
  },
  'Howlsquad Heavy': {
    // スピード開始。ほかのゴブリンは速攻（召喚酔いが効くのは出たターンだけなので、出たときに与える）
    onEnter: (s) => {
      if (s.speed === 0) s.speed = 1;
      for (const c of creatures(s)) if (typeOf(c, 'Goblin')) c.haste = true;
    },
    onCreatureEnters: (_s, _card, entered) => {
      if (typeOf(entered, 'Goblin')) entered.haste = true;
    },
    onCombatStart: atCombat('咆吼部隊の重量級', (s) => void createToken(s, 'Goblin', 1)),
    // 最大スピード：ゴブリンの数だけ {R}
    mana: (s) => {
      const goblins = creatures(s).filter((c) => typeOf(c, 'Goblin')).length;
      return s.speed === 4 ? [{ label: `{R}×${goblins}`, produce: Array(goblins).fill('R') }] : [];
    },
  },
  'Loyal Apprentice': {
    onCombatStart: (s) => {
      if (battlefield(s).some((c) => isCommander(s, c))) {
        enqueue(s, '忠実な弟子', (st) => void createToken(st, 'Thopter', 1, { haste: true }));
      }
    },
  },
  'Dockside Chef': {
    abilities: [
      {
        label: 'アーティファクトかクリーチャーを生け贄に1枚引く',
        cost: '{1}{B}',
        // 料理人自身も生け贄にできるので、候補が無いことはない
        run: (s) =>
          chooseCards(
            s,
            '生け贄に捧げるパーマネント',
            battlefield(s).filter((c) => isCreature(c) || typeOf(c, 'Artifact')).map((c) => c.id),
            1,
            1,
            (st, [id]) => {
              sacrifice(st, id);
              draw(st, 1);
            },
          ),
      },
    ],
  },
  'Harried Dronesmith': {
    onCombatStart: atCombat('急かされるドローン職人', (s) => void createToken(s, 'Thopter', 1, { haste: true, atEnd: 'sacrifice' })),
  },
  'Lagomos, Hand of Hatred': {
    onCombatStart: atCombat('ラゴモス', (s) => void createToken(s, 'Elemental 2/1', 1, { haste: true, atEnd: 'sacrifice' })),
    abilities: [
      {
        label: 'ライブラリーから1枚探す',
        tap: true,
        can: (s) => s.flags.creaturesDied >= 5,
        run: (s) =>
          chooseCards(s, '手札に加えるカード', [...s.zones.library], 1, 1, (st, [id]) => {
            moveTo(st, id, 'hand');
            shuffleLibrary(st);
          }),
      },
    ],
  },
  'Lord Skitter, Sewer King': {
    onCombatStart: atCombat('下水王', (s) => void createToken(s, 'Rat', 1)),
  },
  'Daring Piracy': {
    onCombatStart: atCombat('果敢な海賊行為', (s) => void createToken(s, 'Pirate', 1, { atEnd: 'exile' })),
  },
  "Urabrask's Forge": {
    onCombatStart: atCombat('ウラブラスクの溶鉱炉', (s, card) => {
      card.counters.oil = (card.counters.oil ?? 0) + 1;
      createToken(s, 'Phyrexian Horror', 1, { tempPower: card.counters.oil, atEnd: 'sacrifice' });
    }),
  },
  'Rite of the Raging Storm': {
    onUpkeep: (s) => enqueue(s, '荒れ狂う嵐の儀式', (st) => void createToken(st, 'Lightning Rager', 1, { atEnd: 'sacrifice' })),
  },
  Ophiomancer: {
    onUpkeep: (s) =>
      enqueue(s, '蛇術師', (st) => {
        if (!creatures(st).some((c) => typeOf(c, 'Snake'))) createToken(st, 'Snake', 1);
      }),
  },
  'Searslicer Goblin': {
    onEndStep: (s) => {
      if (s.flags.attacked) enqueue(s, '焦がし切りのゴブリン', (st) => void createToken(st, 'Goblin', 1));
    },
  },
  'Stensia Uprising': {
    onEndStep: (s, card) =>
      enqueue(s, 'ステンシアの蜂起', (st) => {
        createToken(st, 'Human', 1);
        if (st.zones.battlefield.length !== 13) return;
        confirm(st, 'パーマネントがちょうど13個。蜂起を生け贄に7点？', (st2) => {
          sacrifice(st2, card.id);
          damageAny(st2, card, 7);
        });
      }),
  },
  'Chandra, Acolyte of Flame': {
    onEnter: (_s, card) => void (card.counters.loyalty = 4),
    abilities: [
      {
        label: '0：エレメンタル2体',
        sorcery: true,
        can: (s, card) => !s.flags.loyaltyUsed.includes(card.id),
        run: (s, card) => {
          s.flags.loyaltyUsed.push(card.id);
          createToken(s, 'Elemental', 2, { haste: true, atEnd: 'sacrifice' });
        },
      },
    ],
  },
  'Morbid Opportunist': {
    onCreatureDies: (s) => {
      if (s.flags.morbidUsed) return;
      s.flags.morbidUsed = true;
      enqueue(s, '病的な日和見主義者', (st) => draw(st, 1));
    },
  },
  // ---- 戦闘ダメージ ----
  'Elegy Acolyte': {
    // 戦闘ダメージを受けたプレイヤー1人につき1回
    onCombatDamage: (s, _card, hits) => {
      for (const _opp of playersHit(hits)) {
        enqueue(s, 'エレジーの見習い', (st) => {
          draw(st, 1);
          st.life -= 1;
        });
      }
    },
    // 虚空：終了ステップの開始時に、このターンに土地以外のパーマネントが戦場を離れたか、呪文をワープしていたら
    onEndStep: (s) => {
      if (s.flags.nonlandLeft || s.flags.warped) enqueue(s, '虚空：ロボット', (st) => void createToken(st, 'Robot', 1));
    },
  },
  'Professional Face-Breaker': {
    // 戦闘ダメージを受けたプレイヤー1人につき1つ
    onCombatDamage: (s, _card, hits) => {
      for (const _opp of playersHit(hits)) enqueue(s, '顔壊しのプロ：宝物', (st) => void createToken(st, 'Treasure', 1));
    },
    abilities: [
      {
        label: '宝物を生け贄に、一番上を追放してプレイ可能に',
        can: (s) => battlefield(s).some((c) => c.name === 'Treasure'),
        run: (s) => {
          sacrifice(s, battlefield(s).find((c) => c.name === 'Treasure')!.id);
          const top = s.zones.library[0];
          moveTo(s, top, 'exile');
          s.cards[top].castable = true;
          log(s, `${nameJa(s.cards[top])} を追放（このターン唱えられる）`);
        },
      },
    ],
  },
  'Gix, Yawgmoth Praetor': {
    onCombatDamage: (s, _card, hits) =>
      enqueue(s, 'ギックス', (st0) => ask(st0, {
        title: 'ギックス：1点ずつ払って何枚引く？',
        options: hits.map((_, i) => ({ label: `${i + 1}枚`, value: i + 1 })).concat({ label: '引かない', value: 0 }),
        min: 1,
        max: 1,
        resolve: (st, [v]) => {
          st.life -= v as number;
          draw(st, v as number);
        },
      })),
  },
  'Francisco, Fowl Marauder': {
    // 海賊がダメージを与えたプレイヤー1人につき1回探検する。戦闘ダメージは同時なので相手ごとにまとめ、
    // それ以外（イングリスの攻撃時1点など）は1回のダメージごと
    onCombatDamage: (s, card, hits) => {
      for (const _opp of playersHit(hits.filter((h) => typeOf(h.attacker, 'Pirate')))) {
        enqueue(s, 'フランシスコ：探検', (st) => explore(st, st.cards[card.id]));
      }
    },
    onNoncombatDamageBy: (s, card, source) => {
      if (typeOf(source, 'Pirate')) enqueue(s, 'フランシスコ：探検', (st) => explore(st, st.cards[card.id]));
    },
  },
  'Phoenix Chick': {
    onAttackFromGraveyard: (s, card, attackers) => {
      if (attackers.length < 3) return;
      const opp = attackers[0].attacking;
      enqueue(s, 'フェニックスの雛', (st0) => confirm(st0, 'フェニックスの雛：{R}{R} を払って戦場に戻す？', (st) => {
        if (!pay(st, parseCost('{R}{R}'))) return;
        moveTo(st, card.id, 'battlefield', { tapped: true });
        Object.assign(st.cards[card.id], { attacking: opp, counters: { '+1/+1': 1 } });
      }));
    },
  },
  'Whip of Erebos': {
    abilities: [
      {
        label: '墓地のクリーチャーを戻す',
        cost: '{2}{B}{B}',
        tap: true,
        sorcery: true,
        can: (s) => s.zones.graveyard.some((id) => typeOf(s.cards[id], 'Creature')),
        run: (s) =>
          chooseCards(s, '戦場に戻すクリーチャー', s.zones.graveyard.filter((id) => typeOf(s.cards[id], 'Creature')), 1, 1, (st, [id]) => {
            moveTo(st, id, 'battlefield');
            Object.assign(st.cards[id], { haste: true, atEnd: 'exile' });
          }),
      },
    ],
  },
};
