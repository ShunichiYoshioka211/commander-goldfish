export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export type ZoneId = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';
/** declared は相手ありモードの「攻撃宣言のあと・ブロックの前」 */
export type Phase = 'mulligan' | 'main1' | 'combat' | 'declared' | 'attacking' | 'afterDamage' | 'main2' | 'over';

/** カードの静的な定義。デッキのカードは scripts/import-deck.ts が Scryfall から作る */
export interface CardDef {
  name: string;
  jaName: string;
  /** 日本語のタイプ行と効果（表示用。ルールの判定には英語の typeLine を使う） */
  typeJa: string;
  textJa: string;
  /** 使い方のコツ（decks/<id>/ja.json）。デッキごとに違うので、表示は tipOf(deckId, name) で引く */
  tip: string;
  count: number;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracle: string;
  power: number | null;
  toughness: number | null;
  colors: string[];
  producedMana: string[];
  keywords: string[];
  image: { small: string; normal: string } | null;
}

export interface DeckData {
  /** decks/<id>/ のフォルダ名 */
  id: string;
  name: string;
  commanders: string[];
  cards: CardDef[];
}

export interface CardInstance {
  id: string;
  name: string;
  token: boolean;
  zone: ZoneId;
  tapped: boolean;
  counters: Record<string, number>;
  /** このターンに戦場に出た（召喚酔い） */
  sick: boolean;
  /** ターン終了まで速攻 */
  haste: boolean;
  /** 攻撃している対戦相手の番号 */
  attacking: number | null;
  /** ターン終了までのパワー修整 */
  tempPower: number;
  /** 次の終了ステップで生け贄にする／追放する（warp は追放してあとで唱え直せる） */
  atEnd: 'sacrifice' | 'exile' | 'warp' | null;
  /** ミシュラランド等がターン終了までクリーチャー化している（keywords は英語のキーワード名） */
  animated: { power: number; toughness: number; keywords: string[] } | null;
  /** 追放領域から唱えられる（出来事・Face-Breaker） */
  castable: boolean;
  /** 部屋の開いている扉 */
  doors: string[];
}

export interface Opponent {
  life: number;
  commanderDamage: number;
  deadTurn: number | null;
  /** 相手ありモードの、その相手のクリーチャー。相手なしでは常に空 */
  board: RivalPermanent[];
}

/** 相手の性格。盤面の育ち方とブロックの仕方が変わる */
export type RivalStyle = 'aggro' | 'midrange' | 'control' | 'tokens';

/** 相手のクリーチャー。CardInstance にしない（自分のカードを見る既存のスクリプトが反応しないように） */
export interface RivalPermanent {
  /** 'r0', 'r1' … */
  id: string;
  /** engine/rivals/kinds.ts の KINDS のキー */
  kind: string;
  tapped: boolean;
  sick: boolean;
  /** このターンに受けたダメージ（接死なら致死量として記録する） */
  damage: number;
}

export interface RivalState {
  /** 相手専用の乱数。配りの rng とは別の流れ */
  rng: number;
  /** 相手のパーマネントの連番 */
  next: number;
  /** あなたの席（1〜4番手） */
  seat: number;
  styles: RivalStyle[];
  /** 各相手が終えたターン数 */
  turns: number[];
  /** 各相手の統率者を出せる最初のターン */
  cmdReady: number[];
  /** 各相手の統率者が戦場を離れた回数（出し直すたびに遅れる） */
  cmdCasts: number[];
  /** 作り直しの回数（作り直し用の乱数の種） */
  rebuilds: number;
  /** 各相手の直前のターンの要約 */
  recap: string[];
}

export interface PromptOption {
  label: string;
  value: string | number;
  /** カードを選ぶ選択肢なら、そのカード（選択画面にカードの絵を出す） */
  card?: string;
  /** 相手のクリーチャーを選ぶ選択肢なら、その相手とクリーチャー（選択画面にチップを出す） */
  rival?: { opp: number; id: string };
}

export interface Prompt {
  title: string;
  /** 選択肢とは別に見せるカード（占術・探検でめくったカードなど） */
  cards?: string[];
  options: PromptOption[];
  min: number;
  max: number;
  resolve: (s: GameState, values: (string | number)[]) => void;
}

export interface Trigger {
  label: string;
  run: (s: GameState) => void;
}

export interface DamageEvent {
  turn: number;
  target: number;
  source: string;
  amount: number;
  combat: boolean;
}

export interface TurnFlags {
  attacked: boolean;
  creaturesDied: number;
  nonlandLeft: boolean;
  /** このターンに呪文をワープした（虚空の条件） */
  warped: boolean;
  noncombatToOpps: number;
  morbidUsed: boolean;
  loyaltyUsed: string[];
}

export interface GameState {
  /** 遊んでいるデッキ */
  deckId: string;
  /** そのデッキの統率者（英語名） */
  commanders: string[];
  seed: number;
  rng: number;
  cards: Record<string, CardInstance>;
  zones: Record<ZoneId, string[]>;
  nextToken: number;
  turn: number;
  phase: Phase;
  life: number;
  opponents: Opponent[];
  pool: Record<ManaColor, number>;
  landPlayed: boolean;
  commanderCasts: Record<string, number>;
  monarch: boolean;
  speed: number;
  speedUpTurn: number;
  mulligans: number;
  /** 攻撃宣言前に選んでいる攻撃クリーチャー → 対戦相手 */
  plan: Record<string, number>;
  queue: Trigger[];
  fresh: Trigger[];
  prompt: Prompt | null;
  flags: TurnFlags;
  log: string[];
  damage: DamageEvent[];
  /** 相手ありモードの状態。null は相手なし（一人回し） */
  rivals: RivalState | null;
  /** 自分の攻撃クリーチャー → ブロックしている相手のクリーチャー */
  blocks: Record<string, string>;
  /** 手番の相手。null はあなたの手番 */
  active: number | null;
  startedAt: number;
  finishedAt: number | null;
}
