// 生け贄を追加コストにするドロー呪文と、生け贄の受け皿、除去。
import { chooseCards, createToken, creatures, def, destroyAll, draw, isCreature, sacrifice, typeOf } from '../../engine/core';
import { youLoseLife } from '../../engine/damage';
import { destroyRival, destroyTarget } from '../../engine/rivals';
import { findRival, kindOf, rivalCreatures } from '../../engine/rivals/board';
import type { CardInstance, GameState } from '../../engine/types';
import type { CardScript } from '../types';

/**
 * 除去。相手ありモードでは唱えるときに対象を選び、解決で破壊してライフを失う。
 * 相手なしモードでは対象を選ばないので、今までどおり何もしない（編集モードで手動）
 */
export const removal = (mine: (s: GameState, card: CardInstance) => boolean, lose: (s: GameState, target: string) => number, extra?: 'discardOrLife'): CardScript => ({
  rivalsOnly: true,
  cast: {
    extra,
    target: { mine },
    resolve: (s, _card, info) => {
      if (info.target === null) return;
      const loss = lose(s, info.target);
      destroyTarget(s, info.target);
      youLoseLife(s, loss);
    },
  },
});

const drawTwo = (extra: 'sacCreature' | 'sacArtifactOrCreature', flashback?: string): CardScript => ({
  cast: { extra, flashback, resolve: (s) => draw(s, 2) },
});

export const SPELL_SCRIPTS: Record<string, CardScript> = {
  "Altar's Reap": drawTwo('sacCreature'),
  'Village Rites': drawTwo('sacCreature'),
  'Corrupted Conviction': drawTwo('sacCreature'),
  "Night's Whisper": {
    cast: {
      resolve: (s) => {
        draw(s, 2);
        youLoseLife(s, 2);
      },
    },
  },
  // 13点で自分のクリーチャーはすべて死ぬ。相手ありモードでは相手のクリーチャーも数え、すべて流す（タフネスは最大6）
  'Blasphemous Act': {
    cast: {
      reduce: (s) => creatures(s).length + rivalCreatures(s).length,
      // 同時に死ぬので、相手のクリーチャーを先に処理し、病的な日和見主義者が見届けられるようにする
      resolve: (s) => {
        for (const { opp, p } of rivalCreatures(s)) destroyRival(s, opp, p.id);
        destroyAll(s, creatures(s).map((c) => c.id));
      },
    },
  },
  'Infernal Grasp': removal((_s, c) => isCreature(c), () => 2),
  'Withering Torment': removal((_s, c) => isCreature(c) || typeOf(c, 'Enchantment'), () => 2),
  // 相手のクリーチャーだけが対象。そのマナ総量ぶんのライフを失う
  'Feed the Swarm': removal(() => false, (s, target) => kindOf(findRival(s, target)!.p).mv),
  'Costly Plunder': drawTwo('sacArtifactOrCreature'),
  "Eviscerator's Insight": drawTwo('sacArtifactOrCreature', '{4}{B}'),
  'Deadly Dispute': {
    cast: {
      extra: 'sacArtifactOrCreature',
      resolve: (s) => {
        draw(s, 2);
        createToken(s, 'Treasure', 1);
      },
    },
  },
  'Fanatical Offering': {
    cast: {
      extra: 'sacArtifactOrCreature',
      resolve: (s) => {
        draw(s, 2);
        createToken(s, 'Map', 1);
      },
    },
  },
  'Nasty End': {
    cast: { extra: 'sacCreature', resolve: (s, _c, info) => draw(s, typeOf(info.sacrificed!, 'Legendary') ? 3 : 2) },
  },
  "Reckoner's Bargain": {
    cast: {
      extra: 'sacArtifactOrCreature',
      resolve: (s, _c, info) => {
        s.life += def(info.sacrificed!).cmc;
        draw(s, 2);
      },
    },
  },
  'Bitter Triumph': removal((_s, c) => isCreature(c) || typeOf(c, 'Planeswalker'), () => 0, 'discardOrLife'),
  'My Precious // Allure of Power': {
    cast: {
      modes: [
        { label: 'いとしいしと', cost: '{3}' },
        { label: '力の魅惑（出来事）', cost: '{1}{B}', instant: true, extra: 'sacCreature' },
      ],
      resolve: (s, _c, info) => {
        if (info.mode === 1) draw(s, 2);
      },
    },
  },
  'Vampiric Rites': {
    abilities: [
      {
        label: 'クリーチャーを生け贄に、1点回復して1枚引く',
        cost: '{1}{B}',
        can: (s) => creatures(s).length > 0,
        run: (s) =>
          chooseCards(s, '生け贄に捧げるクリーチャー', creatures(s).map((c) => c.id), 1, 1, (st, [id]) => {
            sacrifice(st, id);
            st.life += 1;
            draw(st, 1);
          }),
      },
    ],
  },
};
