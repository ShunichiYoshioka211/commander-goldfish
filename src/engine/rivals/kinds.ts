// 相手のクリーチャーの種類と、性格ごとの表。調整する数値はすべてここに置く（葉のモジュール）。
// 表の数値を変えると、同じシードでも相手の盤面は変わる（配りは変わらない）。
import type { RivalStyle } from '../types';

export interface RivalKind {
  /** 画面に出す名前 */
  name: string;
  /** マナ総量（展開のしやすさと、ブロックの判断に使う価値） */
  mv: number;
  power: number;
  toughness: number;
  /** 英語のキーワード名（自分側と同じ判定に使う）。画面には KEYWORD_JA を通して出す */
  keywords: string[];
  /** 消耗（卓のほかの戦いで倒れる）の率 */
  attrition: number;
  /** ブロックの判断に使う価値（マナ総量。統率者は10） */
  value: number;
  commander?: boolean;
}

const kind = (name: string, mv: number, power: number, toughness: number, keywords: string[] = [], attrition = 0.08): RivalKind => ({
  name, mv, power, toughness, keywords, attrition, value: mv,
});
const commander = (mv: number, power: number, toughness: number, keywords: string[] = []): RivalKind => ({
  ...kind('統率者', mv, power, toughness, keywords), value: 10, commander: true,
});

export const KINDS: Record<string, RivalKind> = {
  scout: kind('斥候', 1, 2, 1),
  bear: kind('熊', 2, 2, 2),
  wall: kind('壁', 2, 0, 4, ['Defender']),
  bird: kind('鳥', 2, 1, 1, ['Flying']),
  viper: kind('毒蛇', 2, 1, 1, ['Deathtouch']),
  knight: kind('騎士', 3, 3, 2),
  spider: kind('蜘蛛', 3, 2, 4, ['Reach']),
  drake: kind('ドレイク', 3, 2, 2, ['Flying']),
  beast: kind('獣', 4, 4, 4),
  guardian: kind('守護者', 4, 2, 5),
  angel: kind('天使', 5, 4, 4, ['Flying', 'Lifelink']),
  wurm: kind('ワーム', 6, 6, 6, ['Trample']),
  dragon: kind('ドラゴン', 6, 5, 5, ['Flying']),
  soldier: kind('兵士', 0, 1, 1, [], 0.12),
  // 内にいる獣で相手が得るトークン（展開の表には入らない）
  beastToken: kind('ビースト', 0, 3, 3),
  cmdAggro: commander(3, 3, 3, ['Trample']),
  cmdMidrange: commander(4, 4, 4, ['Flying']),
  cmdControl: commander(5, 2, 5, ['Flying']),
  cmdTokens: commander(4, 3, 3),
};

export interface StyleDef {
  name: string;
  /** 新しい対局で性格を引くときの重み */
  weight: number;
  /** 相手の1〜6ターン目（以降は6ターン目の値）に展開する数の期待値 */
  deploy: number[];
  /** 展開する種類の重み */
  kinds: Record<string, number>;
  /** 召喚酔いでないクリーチャーが、よそを攻撃してタップする率 */
  tapRate: number;
  commander: string;
  /** 統率者を出す最初のターン */
  cmdTurn: number;
}

export const STYLES: Record<RivalStyle, StyleDef> = {
  aggro: {
    name: 'アグロ', weight: 20, deploy: [0.6, 1.0, 1.2, 1.0, 1.0, 1.0],
    kinds: { scout: 3, bear: 3, knight: 3, bird: 2, beast: 2 }, tapRate: 0.7, commander: 'cmdAggro', cmdTurn: 3,
  },
  midrange: {
    name: 'ミッドレンジ', weight: 40, deploy: [0, 0.6, 0.8, 0.9, 0.9, 0.9],
    kinds: { bear: 2, viper: 2, spider: 3, drake: 2, beast: 3, guardian: 2, angel: 2, wurm: 1 }, tapRate: 0.45, commander: 'cmdMidrange', cmdTurn: 4,
  },
  control: {
    name: 'コントロール', weight: 20, deploy: [0, 0.2, 0.3, 0.4, 0.4, 0.5],
    kinds: { wall: 3, viper: 2, guardian: 3, drake: 2, angel: 2, dragon: 2 }, tapRate: 0.25, commander: 'cmdControl', cmdTurn: 5,
  },
  tokens: {
    name: 'トークン', weight: 20, deploy: [0, 1, 1, 2, 2, 2],
    kinds: { soldier: 1 }, tapRate: 0.55, commander: 'cmdTokens', cmdTurn: 4,
  },
};

export const STYLE_ORDER: RivalStyle[] = ['aggro', 'midrange', 'control', 'tokens'];

/** 1人8体まで */
export const MAX_CREATURES = 8;

/**
 * 相手の1ターンに引く乱数の数。結果によらず必ずこれだけ引き、使い道は添字で予約する
 * （0〜7 消耗、8〜15 よそを攻撃、16 展開する数、17〜19 展開する種類、20 あなたを攻撃（第3段階）、
 * 21 統治者の追加の展開（第3段階）、22〜25 相手からの干渉（第4段階）、26〜31 予備）
 */
export const ROLLS_PER_STEP = 32;
export const ROLL = { attrition: 0, tap: 8, count: 16, kinds: 17 } as const;

/** 能力の表示：チップ・一覧・スマホの頭文字 */
export const KEYWORD_JA: Record<string, { name: string; short: string; text: string }> = {
  Flying: { name: '飛行', short: '飛', text: '飛行か到達を持つクリーチャーでしかブロックされない' },
  Reach: { name: '到達', short: '到', text: '飛行を持つクリーチャーもブロックできる' },
  Deathtouch: { name: '接死', short: '接', text: 'これからダメージを受けたクリーチャーは死ぬ' },
  Trample: { name: 'トランプル', short: 'ト', text: 'ブロックされても、超えた分のダメージはプレイヤーに入る' },
  Defender: { name: '防衛', short: '防', text: '攻撃しない（ブロックはする）' },
  Lifelink: { name: '絆魂', short: '絆', text: '与えたダメージの分、その相手がライフを得る' },
};
