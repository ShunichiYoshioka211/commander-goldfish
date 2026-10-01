export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export type ZoneId = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';
export type Phase = 'mulligan' | 'main1' | 'combat' | 'attacking' | 'main2' | 'over';

/** カードの静的な定義。デッキのカードは scripts/import-deck.ts が Scryfall から作る */
export interface CardDef {
  name: string;
  jaName: string;
  /** 日本語のタイプ行と効果（表示用。ルールの判定には英語の typeLine を使う） */
  typeJa: string;
  textJa: string;
  /** 使い方のコツ（deck/ja.json） */
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
  /** ミシュラランド等がターン終了までクリーチャー化している */
  animated: { power: number; toughness: number } | null;
  /** 追放領域から唱えられる（出来事・Face-Breaker） */
  castable: boolean;
  /** 部屋の開いている扉 */
  doors: string[];
}

export interface Opponent {
  life: number;
  commanderDamage: number;
  deadTurn: number | null;
}

export interface PromptOption {
  label: string;
  value: string | number;
}

export interface Prompt {
  title: string;
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
  noncombatToOpps: number;
  morbidUsed: boolean;
  loyaltyUsed: string[];
}

export interface GameState {
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
  startedAt: number;
  finishedAt: number | null;
}
