import type { ManaOption } from '../engine/mana';
import type { CardInstance, GameState, ZoneId } from '../engine/types';

export interface CastInfo {
  x: number;
  sacrificed: CardInstance | null;
  mode: number;
  from: ZoneId;
}

export type ExtraCost = 'sacCreature' | 'sacArtifactOrCreature' | 'discardOrLife';

export interface CastSpec {
  /** 出来事・部屋のように唱え方が複数あるもの。instant=true の面は戦場に出ない */
  modes?: { label: string; cost: string; instant?: boolean; extra?: ExtraCost }[];
  /** 追加コスト */
  extra?: ExtraCost;
  x?: boolean;
  /** 不特定マナの軽減量 */
  reduce?: (s: GameState) => number;
  /** 墓地から唱えられる（フラッシュバック）コスト */
  flashback?: string;
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
  etbTapped?: (s: GameState, card: CardInstance) => boolean;
  mana?: (s: GameState, card: CardInstance) => ManaOption[];
  cast?: CastSpec;
  abilities?: Ability[];
  onEnter?: (s: GameState, card: CardInstance) => void;
  onCreatureEnters?: (s: GameState, card: CardInstance, entered: CardInstance) => void;
  onUpkeep?: (s: GameState, card: CardInstance) => void;
  onCombatStart?: (s: GameState, card: CardInstance) => void;
  /** 攻撃クリーチャー指定時（戦場にあるカード） */
  onAttack?: (s: GameState, card: CardInstance, attackers: CardInstance[]) => void;
  /** 攻撃クリーチャー指定時（墓地にあるカード） */
  onAttackFromGraveyard?: (s: GameState, card: CardInstance, attackers: CardInstance[]) => void;
  onCombatDamage?: (s: GameState, card: CardInstance, hits: { attacker: CardInstance; opp: number }[]) => void;
  onEndStep?: (s: GameState, card: CardInstance) => void;
  onDies?: (s: GameState, card: CardInstance) => void;
  onCreatureDies?: (s: GameState, card: CardInstance, died: CardInstance, wasAttacking: boolean) => void;
  onNoncombatDamage?: (s: GameState, card: CardInstance) => void;
  damageBonus?: (s: GameState, card: CardInstance, source: CardInstance, combat: boolean) => number;
}
