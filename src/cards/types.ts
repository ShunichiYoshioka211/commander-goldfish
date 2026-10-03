import type { ManaOption } from '../engine/mana';
import type { CounterTarget } from '../engine/counters';
import type { DamageTo } from '../engine/damage';
import type { MillEvent } from '../engine/mill';
import type { CardInstance, GameState, ZoneId } from '../engine/types';

export interface CastInfo {
  x: number;
  sacrificed: CardInstance | null;
  mode: number;
  from: ZoneId;
  /** 唱えるときに選んだ対象（相手のクリーチャーかカードの ID）。相手なしモードでは選ばないので null */
  target: string | null;
}

export type ExtraCost = 'sacCreature' | 'sacArtifactOrCreature' | 'discardOrLife';

export interface CastSpec {
  /** 出来事・部屋・ワープのように唱え方が複数あるもの。instant=true の面は戦場に出ない。hand=true は手札からのみ */
  modes?: { label: string; cost: string; instant?: boolean; extra?: ExtraCost; hand?: boolean }[];
  /** 追加コスト */
  extra?: ExtraCost;
  x?: boolean;
  /** 不特定マナの軽減量 */
  reduce?: (s: GameState) => number;
  /** 墓地から唱えられる（フラッシュバック）コスト */
  flashback?: string;
  /**
   * 相手ありモードで、唱えるときに選ぶ対象。相手のクリーチャーはいつも候補で、mine はあなたのパーマネントの条件。
   * 適正な対象が無ければ唱えられない。相手なしモードでは対象を選ばない（今までどおり手動）
   */
  target?: { mine: (s: GameState, card: CardInstance) => boolean };
  resolve?: (s: GameState, card: CardInstance, info: CastInfo) => void;
}

export interface Ability {
  label: string;
  zone?: 'battlefield' | 'graveyard';
  cost?: string;
  tap?: boolean;
  sorcery?: boolean;
  can?: (s: GameState, card: CardInstance) => boolean;
  run: (s: GameState, card: CardInstance) => void;
}

/** カードごとの自動処理。書いていないカードは効果テキストを見て手動で処理する */
export interface CardScript {
  /** 相手ありモードのときだけ自動で処理する（除去）。カード詳細の表示が変わる */
  rivalsOnly?: boolean;
  etbTapped?: (s: GameState, card: CardInstance) => boolean;
  mana?: (s: GameState, card: CardInstance) => ManaOption[];
  cast?: CastSpec;
  abilities?: Ability[];
  onEnter?: (s: GameState, card: CardInstance) => void;
  onCreatureEnters?: (s: GameState, card: CardInstance, entered: CardInstance) => void;
  /** 自分以外のパーマネント（クリーチャー以外も含む）が戦場に出たとき */
  onPermanentEnters?: (s: GameState, card: CardInstance, entered: CardInstance) => void;
  onUpkeep?: (s: GameState, card: CardInstance) => void;
  onCombatStart?: (s: GameState, card: CardInstance) => void;
  /** 攻撃クリーチャー指定時（戦場にあるカード） */
  onAttack?: (s: GameState, card: CardInstance, attackers: CardInstance[]) => void;
  /** 攻撃クリーチャー指定時（墓地にあるカード） */
  onAttackFromGraveyard?: (s: GameState, card: CardInstance, attackers: CardInstance[]) => void;
  /** hits は戦闘ダメージを与えた攻撃クリーチャーと対戦相手、与えた点数 */
  onCombatDamage?: (s: GameState, card: CardInstance, hits: { attacker: CardInstance; opp: number; amount: number }[]) => void;
  onEndStep?: (s: GameState, card: CardInstance) => void;
  onDies?: (s: GameState, card: CardInstance) => void;
  onCreatureDies?: (s: GameState, card: CardInstance, died: CardInstance, wasAttacking: boolean) => void;
  /** 相手ありモードで、相手のクリーチャーが死亡したとき */
  onRivalCreatureDies?: (s: GameState, card: CardInstance) => void;
  onNoncombatDamage?: (s: GameState, card: CardInstance) => void;
  /** 自分の発生源が対戦相手に戦闘ダメージでないダメージを与えたとき（1回のダメージ・相手1人ごと） */
  onNoncombatDamageBy?: (s: GameState, card: CardInstance, source: CardInstance) => void;
  // ---- 切削・RADカウンター・カウンター（賢きモスマンのデッキ） ----
  /** 1回の切削（あなたか対戦相手たち）のあと（戦場にあるカード） */
  onMilled?: (s: GameState, card: CardInstance, ev: MillEvent) => void;
  /** 1回の切削のあと（あなたの墓地にあるカード） */
  onMilledInGraveyard?: (s: GameState, card: CardInstance, ev: MillEvent) => void;
  /** 対戦相手がライフを失ったとき（ダメージを含む） */
  onOpponentLosesLife?: (s: GameState, card: CardInstance, opp: number, amount: number) => void;
  /** あなたがライフを失ったとき（支払いを含む） */
  onYouLoseLife?: (s: GameState, card: CardInstance, amount: number) => void;
  /** 各終了ステップ（あなたのターンも対戦相手のターンも） */
  onEachEndStep?: (s: GameState, card: CardInstance) => void;
  /** あなたのパーマネントにカウンターが置かれたあと（置換を適用した個数） */
  onCountersPut?: (s: GameState, card: CardInstance, target: CardInstance, kind: string, n: number) => void;
  /** カウンターを置く（得る）なら、その個数に足す数（置換） */
  moreCounters?: (s: GameState, card: CardInstance, target: CounterTarget, kind: string) => number;
  /** カウンターを置くなら、その個数を2倍にするか（置換） */
  doubleCounters?: (s: GameState, card: CardInstance, target: CardInstance, kind: string) => boolean;
  /** 対戦相手が切削するなら、1人ごとに多く切削させる枚数（水のクリスタル） */
  oppMillBonus?: number;
  /** あなたが唱える呪文の不特定マナを減らす量（水のクリスタル） */
  spellCostReduction?: (s: GameState, card: CardInstance, spell: CardInstance) => number;
  /** あなたが呪文を唱えたとき。spent は支払ったマナの量 */
  onCast?: (s: GameState, card: CardInstance, spell: CardInstance, spent: number) => void;
  /** 増幅。to は受け手（対戦相手か、対戦相手のパーマネントか） */
  damageBonus?: (s: GameState, card: CardInstance, source: CardInstance, combat: boolean, to: DamageTo) => number;
}
