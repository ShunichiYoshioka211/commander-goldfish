// 右側の操作欄：フェイズ進行・攻撃・マナ・プール、編集モードの道具。
import { useState } from 'react';
import { TOKENS } from '../cards/tokens';
import { aliveOpponents } from '../engine/core';
import { COLORS } from '../engine/mana';
import { useStore } from '../store';

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
      {game.phase === 'attacking' && (
        <button className="primary" onClick={() => dispatch({ type: 'damage' })}>
          戦闘ダメージ
        </button>
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

export function EditToolbar() {
  const editTriggers = useStore((s) => s.editTriggers);
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
    </div>
  );
}
