import type { CardDef } from '../engine/types';

function token(
  name: string,
  jaName: string,
  typeLine: string,
  typeJa: string,
  colors: string[],
  power: number | null,
  toughness: number | null,
  textJa = '',
  keywords: string[] = [],
): CardDef {
  return {
    name, jaName, typeJa, textJa, tip: '', count: 0, manaCost: '', cmc: 0, typeLine, oracle: '', power, toughness, colors,
    producedMana: [], keywords, image: null,
  };
}

/** トークンの定義。キーはエンジン内の名前（実カードの名前と衝突しないもの）。名前は日本語版のカードの表記に合わせる */
export const TOKENS: Record<string, CardDef> = Object.fromEntries(
  [
    token('Goblin', 'ゴブリン', 'Token Creature — Goblin', 'トークン・クリーチャー — ゴブリン', ['R'], 1, 1),
    token('Pirate', '海賊', 'Token Creature — Pirate', 'トークン・クリーチャー — 海賊', ['R'], 1, 1, '威迫、速攻', ['Menace', 'Haste']),
    token('Knight', '騎士', 'Token Creature — Knight', 'トークン・クリーチャー — 騎士', ['R'], 3, 1),
    token('Elemental', 'エレメンタル', 'Token Creature — Elemental', 'トークン・クリーチャー — エレメンタル', ['R'], 1, 1),
    token('Elemental 2/1', 'エレメンタル（2/1）', 'Token Creature — Elemental', 'トークン・クリーチャー — エレメンタル', ['R'], 2, 1, 'トランプル、速攻', ['Trample', 'Haste']),
    token('Thopter', '飛行機械', 'Token Artifact Creature — Thopter', 'トークン・アーティファクト・クリーチャー — 飛行機械', [], 1, 1, '飛行', ['Flying']),
    token('Cadet', '実習生', 'Token Creature — Wizard Soldier', 'トークン・クリーチャー — ウィザード・兵士', [], 2, 2),
    token('Rat', 'ネズミ', 'Token Creature — Rat', 'トークン・クリーチャー — ネズミ', ['B'], 1, 1, 'このクリーチャーではブロックできない。'),
    token('Mutant', 'ミュータント', 'Token Creature — Mutant', 'トークン・クリーチャー — ミュータント', ['R'], 2, 2),
    token('Devil', 'デビル', 'Token Creature — Devil', 'トークン・クリーチャー — デビル', ['R'], 1, 1, 'このクリーチャーが死亡したとき、１つを対象とする。これはそれに１点のダメージを与える。'),
    token('Human', '人間', 'Token Creature — Human', 'トークン・クリーチャー — 人間', ['R'], 1, 1),
    token('Phyrexian Horror', 'ファイレクシアン・ホラー', 'Token Creature — Phyrexian Horror', 'トークン・クリーチャー — ファイレクシアン・ホラー', ['R'], 0, 1, 'トランプル、速攻', ['Trample', 'Haste']),
    token('Snake', '蛇', 'Token Creature — Snake', 'トークン・クリーチャー — 蛇', ['B'], 1, 1, '接死', ['Deathtouch']),
    token(
      'Lightning Rager',
      '稲妻の憤怒獣',
      'Token Creature — Elemental',
      'トークン・クリーチャー — エレメンタル',
      ['R'],
      5,
      1,
      'トランプル、速攻\n終了ステップの開始時に、このクリーチャーを生け贄に捧げる。',
      ['Trample', 'Haste'],
    ),
    token('Beast', 'ビースト', 'Token Creature — Beast', 'トークン・クリーチャー — ビースト', ['G'], 3, 3),
    token('Zombie Mutant', 'ゾンビ・ミュータント', 'Token Creature — Zombie Mutant', 'トークン・クリーチャー — ゾンビ・ミュータント', ['B'], 2, 2),
    token('Eldrazi Spawn', 'エルドラージ・落とし子', 'Token Creature — Eldrazi Spawn', 'トークン・クリーチャー — エルドラージ・落とし子', [], 0, 1, 'このクリーチャーを生け贄に捧げる：{C}を加える。'),
    token('Robot', 'ロボット', 'Token Artifact Creature — Robot', 'トークン・アーティファクト・クリーチャー — ロボット', [], 2, 2),
    token('Treasure', '宝物', 'Token Artifact — Treasure', 'トークン・アーティファクト — 宝物', [], null, null, '{T}, このアーティファクトを生け贄に捧げる：好きな色１色のマナ１点を加える。'),
    token(
      'Map',
      '地図',
      'Token Artifact — Map',
      'トークン・アーティファクト — 地図',
      [],
      null,
      null,
      '{1}, {T}, このアーティファクトを生け贄に捧げる：あなたがコントロールしているクリーチャー１体を対象とする。それは探検を行う。起動はソーサリーとしてのみ行う。',
    ),
  ].map((t) => [t.name, t]),
);
