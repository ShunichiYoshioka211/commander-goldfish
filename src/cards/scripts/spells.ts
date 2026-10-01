// 生け贄を追加コストにするドロー呪文と、生け贄の受け皿。
import { chooseCards, createToken, creatures, def, draw, sacrifice, typeOf } from '../../engine/core';
import type { CardScript } from '../types';

const drawTwo = (extra: 'sacCreature' | 'sacArtifactOrCreature', flashback?: string): CardScript => ({
  cast: { extra, flashback, resolve: (s) => draw(s, 2) },
});

export const SPELL_SCRIPTS: Record<string, CardScript> = {
  "Altar's Reap": drawTwo('sacCreature'),
  'Village Rites': drawTwo('sacCreature'),
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
  'Bitter Triumph': { cast: { extra: 'discardOrLife' } },
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
