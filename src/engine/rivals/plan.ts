// 相手の1ターンの計画。GameState に触れない純粋関数。
// 確率の結果は表引き・比較・filter・Math.floor で表し、結果ごとの if を書かない（CONTRIBUTING 4.7）。
import { nextRandom } from '../rng';
import type { RivalStyle } from '../types';
import { KINDS, MAX_CREATURES, ROLL, ROLLS_PER_STEP, STYLE_ORDER, STYLES } from './kinds';

/** 乱数を n 個引く */
export function rolls(state: number, n: number): [number[], number] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const [r, next] = nextRandom(s);
    out.push(r);
    s = next;
  }
  return [out, s];
}

/** 重み付きの抽選。r は [0, 1) */
export function pick<T extends string>(weights: [T, number][], r: number): T {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let acc = 0;
  const cumulative = weights.map(([, w]) => (acc += w));
  return weights[cumulative.findIndex((c) => c > r * total)][0];
}

export const pickStyle = (r: number): RivalStyle => pick(STYLE_ORDER.map((st) => [st, STYLES[st].weight]), r);

const isCommanderKind = (kind: string) => KINDS[kind].commander === true;

export interface PlanInput {
  style: RivalStyle;
  /** これから行うのが何ターン目か（1〜） */
  t: number;
  /** ターンの始め（アンタップ後）の盤面 */
  board: { kind: string }[];
  cmdReady: number;
}

export interface RivalPlan {
  /** 消耗で死亡する、盤面の添字 */
  dies: number[];
  /** 出す種類（統率者が先頭） */
  deploy: string[];
  /** よそを攻撃してタップする、盤面の添字（生き残ったものだけ） */
  tap: number[];
}

export function planRivalTurn(input: PlanInput, r: number[]): RivalPlan {
  const style = STYLES[input.style];
  const indices = input.board.map((_, i) => i);
  const dies = indices.filter((i) => r[ROLL.attrition + i] < KINDS[input.board[i].kind].attrition);
  const survivors = indices.filter((i) => !dies.includes(i));
  // 統率者：登場ターンに達していて、ターンの始めに戦場にいなければ出す（このターンに倒れたものはすぐには戻らない）
  const hadCommander = input.board.some((p) => isCommanderKind(p.kind));
  const commander = !hadCommander && input.t >= input.cmdReady ? [style.commander] : [];
  const expected = style.deploy[Math.min(input.t, style.deploy.length) - 1];
  const count = Math.floor(expected + r[ROLL.count]);
  // 使えるマナに近いものほど出やすい。重いものは出ない
  const mana = Math.min(input.t, 9);
  const weights = Object.entries(style.kinds).map(([k, w]): [string, number] => {
    const mv = KINDS[k].mv;
    return [k, w * Number(mv <= mana) * Math.max(1, 3 - (mana - mv))];
  });
  const creatures = Array.from({ length: count }, (_, j) => pick(weights, r[ROLL.kinds + j]));
  const room = MAX_CREATURES - survivors.length;
  const deploy = [...commander, ...creatures].slice(0, room);
  // 召喚酔いでなく防衛を持たないものが、よそを攻撃してタップする（ターンの始めにいたものは召喚酔いが解けている）
  const tap = survivors.filter(
    (i) => !KINDS[input.board[i].kind].keywords.includes('Defender') && r[ROLL.tap + i] < style.tapRate,
  );
  return { dies, deploy, tap };
}

export interface SimPermanent {
  kind: string;
  tapped: boolean;
  sick: boolean;
}

export interface SimResult extends CommanderClock {
  board: SimPermanent[];
}

export interface CommanderClock {
  cmdReady: number;
  cmdCasts: number;
}

/**
 * 統率者が n 回（0 か 1）戦場を離れた：統率領域に戻り、出し直すたびに1ターンずつ遅れる（統率者税の近似）。
 * 結果ごとの if を書かないよう、離れていなければ（n=0）何も変わらない式にしてある
 */
export const commanderLeft = (cmd: CommanderClock, turns: number, n: number): CommanderClock => ({
  cmdCasts: cmd.cmdCasts + n,
  cmdReady: Math.max(cmd.cmdReady, n * (turns + 2 + cmd.cmdCasts)),
});

/** 空の盤面から turns ターンぶん育てる（作り直し）。乱数は呼ぶ側が別の種から作る */
export function simulateBoard(style: RivalStyle, turns: number, seed: number): SimResult {
  let state = seed;
  let board: SimPermanent[] = [];
  let cmd: CommanderClock = { cmdReady: STYLES[style].cmdTurn, cmdCasts: 0 };
  for (let t = 1; t <= turns; t++) {
    let r: number[];
    [r, state] = rolls(state, ROLLS_PER_STEP);
    board = board.map((p) => ({ ...p, tapped: false, sick: false }));
    const plan = planRivalTurn({ style, t, board, cmdReady: cmd.cmdReady }, r);
    cmd = commanderLeft(cmd, t, plan.dies.filter((i) => isCommanderKind(board[i].kind)).length);
    const tapped = board.map((p, i) => ({ ...p, tapped: plan.tap.includes(i) }));
    board = [
      ...tapped.filter((_, i) => !plan.dies.includes(i)),
      ...plan.deploy.map((kind) => ({ kind, tapped: false, sick: true })),
    ];
  }
  return { board, ...cmd };
}
