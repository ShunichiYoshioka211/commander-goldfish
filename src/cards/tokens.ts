import type { CardDef } from '../engine/types';

function token(
  name: string,
  jaName: string,
  typeLine: string,
  colors: string[],
  power: number | null,
  toughness: number | null,
  oracle = '',
  keywords: string[] = [],
): CardDef {
  return { name, jaName, note: '', count: 0, manaCost: '', cmc: 0, typeLine, oracle, power, toughness, colors, producedMana: [], keywords, image: null };
}

/** トークンの定義。キーはエンジン内の名前（実カードの名前と衝突しないもの） */
export const TOKENS: Record<string, CardDef> = Object.fromEntries(
  [
    token('Goblin', 'ゴブリン', 'Token Creature — Goblin', ['R'], 1, 1),
    token('Pirate', '海賊', 'Token Creature — Pirate', ['R'], 1, 1, 'Menace, haste', ['Menace', 'Haste']),
    token('Knight', '騎士', 'Token Creature — Knight', ['R'], 3, 1),
    token('Elemental', 'エレメンタル', 'Token Creature — Elemental', ['R'], 1, 1),
    token('Elemental 2/1', 'エレメンタル（2/1）', 'Token Creature — Elemental', ['R'], 2, 1, 'Trample, haste', ['Trample', 'Haste']),
    token('Thopter', '飛行機械', 'Token Artifact Creature — Thopter', [], 1, 1, 'Flying', ['Flying']),
    token('Cadet', '士官候補生', 'Token Creature — Wizard Soldier', [], 2, 2),
    token('Rat', 'ネズミ', 'Token Creature — Rat', ['B'], 1, 1, 'This token can’t block.'),
    token('Mutant', 'ミュータント', 'Token Creature — Mutant', ['R'], 2, 2),
    token('Devil', 'デビル', 'Token Creature — Devil', ['R'], 1, 1, 'When this token dies, it deals 1 damage to any target.'),
    token('Human', '人間', 'Token Creature — Human', ['R'], 1, 1),
    token('Phyrexian Horror', 'ファイレクシアン・ホラー', 'Token Creature — Phyrexian Horror', ['R'], 0, 1, 'Trample, haste', ['Trample', 'Haste']),
    token('Snake', '蛇', 'Token Creature — Snake', ['B'], 1, 1, 'Deathtouch', ['Deathtouch']),
    token('Lightning Rager', '稲妻の激情者', 'Token Creature — Elemental', ['R'], 5, 1, 'Trample, haste. At the beginning of the end step, sacrifice this token.', ['Trample', 'Haste']),
    token('Robot', 'ロボット', 'Token Artifact Creature — Robot', [], 2, 2),
    token('Treasure', '宝物', 'Token Artifact — Treasure', [], null, null, '{T}, Sacrifice this token: Add one mana of any color.'),
    token('Map', '地図', 'Token Artifact — Map', [], null, null, '{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.'),
  ].map((t) => [t.name, t]),
);
