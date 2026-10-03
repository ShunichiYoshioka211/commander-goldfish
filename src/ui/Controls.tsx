// 右側の操作欄：フェイズ進行・攻撃・マナ・プール、編集モードの道具。
import { useState } from 'react';
import { TOKENS } from '../cards/tokens';
import { aliveOpponents, nameJa } from '../engine/core';
import { COLORS } from '../engine/mana';
import { findRival, rivalLabel } from '../engine/rivals/board';
import { KINDS, STYLES } from '../engine/rivals/kinds';
import type { GameState } from '../engine/types';
import { useStore } from '../store';

/** 操作欄に出すブロックの数。残りは「ほか N 件」 */
const SHOWN_BLOCKS = 4;

function BlockList({ game }: { game: GameState }) {
  const blocks = Object.entries(game.blocks);
  if (blocks.length === 0) return <div className="hint">ブロックされなかった</div>;
  return (
    <div className="block-list" data-testid="block-list">
      {blocks.slice(0, SHOWN_BLOCKS).map(([a, b]) => {
        const rival = findRival(game, b);
        return (
          <div key={a}>
            {nameJa(game.cards[a])} ← {rival ? `${rivalLabel(rival.p)}（相手${rival.opp + 1}）` : '（除去済み）'}
          </div>
        );
      })}
      {blocks.length > SHOWN_BLOCKS && <div className="muted">ほか {blocks.length - SHOWN_BLOCKS} 件</div>}
      <div className="hint">ブロックされたクリーチャーは、ダメージの前に生け贄にできる（攻撃中なのでガルナで引ける）</div>
    </div>
  );
}

export function Controls() {
  const game = useStore((s) => s.game);
  const dispatch = useStore((s) => s.dispatch);
  const planned = Object.keys(game.plan).length;
  return (
    <aside className="controls">
      {game.phase === 'mulligan' && (
        <>
          <div className="hint">初手 {game.mulligans > 0 && `（マリガン${game.mulligans}回）`}</div>
          <button className="primary" onClick={() => dispatch({ type: 'keep' })}>
            キープ
          </button>
          <button onClick={() => dispatch({ type: 'mulligan' })}>マリガン</button>
        </>
      )}
      {game.phase === 'main1' && (
        <button className="primary" onClick={() => dispatch({ type: 'toCombat' })}>
          戦闘へ
        </button>
      )}
      {game.phase === 'combat' && (
        <>
          <div className="hint">クリーチャーを対戦相手へドラッグして攻撃を指定</div>
          <div className="attack-all">
            全員で
            {aliveOpponents(game).map((i) => (
              <button key={i} onClick={() => dispatch({ type: 'planAll', opp: i })}>
                相手{i + 1}
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => dispatch({ type: 'attack' })}>
            {planned > 0 ? `${planned}体で攻撃` : '攻撃しない'}
          </button>
        </>
      )}
      {game.phase === 'declared' && (
        <>
          <div className="hint">ブロックの前。インスタントで相手のクリーチャーを除去できる</div>
          <button className="primary" onClick={() => dispatch({ type: 'toBlocks' })}>
            ブロックへ
          </button>
        </>
      )}
      {game.phase === 'attacking' && (
        <>
          {game.rivals && <BlockList game={game} />}
          <button className="primary" onClick={() => dispatch({ type: 'damage' })}>
            戦闘ダメージ
          </button>
        </>
      )}
      {game.phase === 'afterDamage' && (
        <>
          <div className="hint">まだ攻撃中の扱い。インスタントで生け贄にできる</div>
          <button className="primary" onClick={() => dispatch({ type: 'endCombat' })}>
            戦闘終了
          </button>
        </>
      )}
      {(game.phase === 'main1' || game.phase === 'main2' || game.phase === 'afterDamage') && (
        <button className={game.phase === 'main2' ? 'primary end-turn' : 'end-turn'} onClick={() => dispatch({ type: 'endTurn' })}>
          ターン終了
        </button>
      )}
      <Pool />
    </aside>
  );
}

function Pool() {
  const pool = useStore((s) => s.game.pool);
  const editMode = useStore((s) => s.editMode);
  const dispatch = useStore((s) => s.dispatch);
  const shown = COLORS.filter((c) => pool[c] > 0 || (editMode && (c === 'B' || c === 'R' || c === 'C')));
  return (
    <div className="pool" data-testid="pool">
      <span>マナ</span>
      {shown.length === 0 && <span className="muted">なし</span>}
      {shown.map((c) => (
        <span key={c} className={`mana mana-${c}`}>
          {c}×{pool[c]}
          {editMode && (
            <>
              <button aria-label={`${c}を足す`} onClick={() => dispatch({ type: 'pool', color: c, delta: 1 })}>
                +
              </button>
              <button aria-label={`${c}を減らす`} onClick={() => dispatch({ type: 'pool', color: c, delta: -1 })}>
                −
              </button>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/** 相手の統率者の種類 → 性格の名前（一覧で見分けるため） */
const COMMANDER_STYLE: Record<string, string> = Object.fromEntries(Object.values(STYLES).map((st) => [st.commander, st.name]));
const kindLabel = (kind: string) => {
  const label = rivalLabel({ id: '', kind, tapped: false, sick: false, damage: 0 });
  return kind in COMMANDER_STYLE ? `${label}（${COMMANDER_STYLE[kind]}）` : label;
};

function RivalTools() {
  const game = useStore((s) => s.game);
  const dispatch = useStore((s) => s.dispatch);
  const [kind, setKind] = useState('bear');
  const [picked, setOpp] = useState(0);
  // 選んでいた相手が脱落したら、生きている最初の相手にする
  const alive = aliveOpponents(game);
  const opp = alive.includes(picked) ? picked : alive[0];
  return (
    <span className="rival-maker">
      <select aria-label="相手のクリーチャーの種類" value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.keys(KINDS).map((k) => (
          <option key={k} value={k}>
            {kindLabel(k)}
          </option>
        ))}
      </select>
      <select aria-label="出す相手" value={opp} onChange={(e) => setOpp(Number(e.target.value))}>
        {alive.map((i) => (
          <option key={i} value={i}>
            相手{i + 1}
          </option>
        ))}
      </select>
      <button onClick={() => dispatch({ type: 'rivalAdd', opp, kind })}>相手に出す</button>
      <button onClick={() => dispatch({ type: 'rivalRebuild', opp: null })}>相手の盤面を作り直す</button>
    </span>
  );
}

export function EditToolbar() {
  const editTriggers = useStore((s) => s.editTriggers);
  const rivals = useStore((s) => s.game.rivals !== null);
  const set = useStore((s) => s.set);
  const dispatch = useStore((s) => s.dispatch);
  const [token, setToken] = useState('Goblin');
  const [count, setCount] = useState(1);
  return (
    <div className="edit-toolbar" data-testid="edit-toolbar">
      <label>
        <input type="checkbox" checked={editTriggers} onChange={(e) => set({ editTriggers: e.target.checked })} />
        移動で誘発させる
      </label>
      <span className="token-maker">
        <select aria-label="トークンの種類" value={token} onChange={(e) => setToken(e.target.value)}>
          {Object.values(TOKENS).map((t) => (
            <option key={t.name} value={t.name}>
              {t.jaName}
            </option>
          ))}
        </select>
        <input aria-label="トークンの数" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        <button onClick={() => dispatch({ type: 'token', name: token, count })}>トークン作成</button>
      </span>
      <button onClick={() => dispatch({ type: 'wipe' })}>全クリーチャー破壊</button>
      <button onClick={() => dispatch({ type: 'shuffle' })}>シャッフル</button>
      {rivals && <RivalTools />}
    </div>
  );
}
