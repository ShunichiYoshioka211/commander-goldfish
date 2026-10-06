// ダメージ源と増幅。このデッキの勝ち筋の中心。
import { createToken, creatures, draw, enqueue, isCreature, isRed, moveTo, nameJa, typeOf } from '../../engine/core';
import { damageAny, damageEach } from '../../engine/damage';
import type { GameState } from '../../engine/types';
import type { CardScript } from '../types';

const pingOnEnter = (n: number): CardScript['onCreatureEnters'] => (s, card) =>
  enqueue(s, `${nameJa(card)}：${n}点`, (st) => damageEach(st, card, n));

const devils = (s: GameState) => createToken(s, 'Devil', 3);

export const DAMAGE_SCRIPTS: Record<string, CardScript> = {
  'Ingris Stingerquill': {
    onAttack: (s, _card, attackers) => {
      for (const a of attackers) enqueue(s, `${nameJa(a)} の攻撃：各対戦相手に1点`, (st) => damageEach(st, a, 1));
    },
    abilities: [
      {
        label: '実習生トークンを出し、全員に速攻',
        cost: '{4}',
        run: (s) => {
          createToken(s, 'Cadet', 1);
          for (const c of creatures(s)) c.haste = true;
        },
      },
    ],
  },
  'Far Fortune, End Boss': {
    onEnter: (s) => {
      if (s.speed === 0) s.speed = 1;
    },
    onAttack: (s, card) => enqueue(s, 'ファー・フォーチュン：各対戦相手に1点', (st) => damageEach(st, card, 1)),
    damageBonus: (s) => (s.speed === 4 ? 1 : 0),
  },
  'Torbran, Thane of Red Fell': { damageBonus: (_s, _c, source) => (isRed(source) ? 2 : 0) },
  'Mechanized Warfare': { damageBonus: (_s, _c, source) => (isRed(source) || typeOf(source, 'Artifact') ? 1 : 0) },
  'Fated Firepower': {
    cast: { x: true, resolve: (_s, card, info) => void (card.counters.fire = info.x) },
    damageBonus: (_s, card) => card.counters.fire ?? 0,
  },
  'Spiked Corridor // Torture Pit': {
    cast: {
      modes: [
        { label: '突刺回廊', cost: '{3}{R}' },
        { label: '拷問部屋', cost: '{3}{R}' },
      ],
      resolve: (s, card, info) => {
        card.doors.push(info.mode === 0 ? 'Spiked Corridor' : 'Torture Pit');
        if (info.mode === 0) devils(s);
      },
    },
    abilities: [
      {
        label: 'もう一方の扉を開ける',
        cost: '{3}{R}',
        sorcery: true,
        can: (_s, card) => card.doors.length === 1,
        run: (s, card) => {
          const opening = card.doors[0] === 'Spiked Corridor' ? 'Torture Pit' : 'Spiked Corridor';
          card.doors.push(opening);
          if (opening === 'Spiked Corridor') devils(s);
        },
      },
    ],
    damageBonus: (_s, card, _source, combat) => (card.doors.includes('Torture Pit') && !combat ? 2 : 0),
  },
  Devil: { onDies: (s, card) => enqueue(s, 'デビル：1点', (st) => damageAny(st, card, 1)) },
  'Impact Tremors': { onCreatureEnters: pingOnEnter(1) },
  'Molten Gatekeeper': {
    onCreatureEnters: pingOnEnter(1),
    abilities: [
      {
        label: '蘇生',
        zone: 'graveyard',
        cost: '{R}',
        sorcery: true,
        run: (s, card) => {
          moveTo(s, card.id, 'battlefield');
          Object.assign(s.cards[card.id], { haste: true, atEnd: 'exile' });
        },
      },
    ],
  },
  'Witty Roastmaster': { onCreatureEnters: pingOnEnter(1) },
  'Weftstalker Ardent': {
    onPermanentEnters: (s, card, entered) => {
      if (isCreature(entered) || typeOf(entered, 'Artifact')) {
        enqueue(s, `${nameJa(card)}：1点`, (st) => damageEach(st, card, 1));
      }
    },
    cast: {
      modes: [
        { label: '虚空間追いの情熱家', cost: '{2}{R}' },
        { label: 'ワープ', cost: '{R}', hand: true },
      ],
      // ワープで出したら終了ステップに追放し、あとで追放領域から普通に唱え直せる
      resolve: (s, card, info) => {
        if (info.mode === 1) {
          card.atEnd = 'warp';
          s.flags.warped = true;
        }
      },
    },
  },
  'Slash, Reptile Rampager': {
    onCreatureEnters: pingOnEnter(2),
    onAttack: (s, card, attackers) => {
      if (attackers.some((a) => a.id === card.id)) enqueue(s, 'スラッシュ：ミュータント', (st) => void createToken(st, 'Mutant', 1));
    },
  },
  'General Kreat, the Boltbringer': {
    onCreatureEnters: pingOnEnter(1),
    onAttack: (s, _card, attackers) => {
      const goblin = attackers.find((a) => typeOf(a, 'Goblin'));
      if (goblin) {
        const opp = goblin.attacking;
        enqueue(s, 'クレート：攻撃しているゴブリン', (st) => void createToken(st, 'Goblin', 1, { tapped: true, attacking: opp }));
      }
    },
  },
  'Court of Embereth': {
    onEnter: (s) => void (s.monarch = true),
    onUpkeep: (s, card) =>
      enqueue(s, 'エンバレスの宮廷', (st) => {
        createToken(st, 'Knight', 1);
        // 同じ誘発の後半なので、これだけをしっぺ返しでコピーさせない（コピーするなら宮廷の誘発ごと）
        if (st.monarch) enqueue(st, 'エンバレスの宮廷：クリーチャーの数だけ', (st2) => damageEach(st2, card, creatures(st2).length), false);
      }),
  },
  'Garna, Bloodfist of Keld': {
    onCreatureDies: (s, card, _died, wasAttacking) =>
      enqueue(s, wasAttacking ? 'ガルナ：1枚引く' : 'ガルナ：各対戦相手に1点', (st) => {
        if (wasAttacking) draw(st, 1);
        else damageEach(st, card, 1);
      }),
  },
  'Wildfire Elemental': {
    onNoncombatDamage: (s) =>
      enqueue(s, '野火の精霊：+1/+0', (st) => {
        for (const c of creatures(st)) c.tempPower++;
      }),
  },
  "Chandra's Incinerator": { cast: { reduce: (s) => s.flags.noncombatToOpps } },
};
