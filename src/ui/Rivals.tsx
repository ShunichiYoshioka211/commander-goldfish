// 相手ありモードの、相手のクリーチャー（チップ）と一覧。画像は使わず、相手ごとに memo で描き直しを閉じる。
import { memo } from 'react';
import { kindOf, rivalParts } from '../engine/rivals/board';
import { STYLES } from '../engine/rivals/kinds';
import type { RivalPermanent } from '../engine/types';
import { useStore } from '../store';
import { closeOnBack } from './Modals';

/** スマホ幅で出すチップの数（2行ぶん）。残りは「+N」 */
const MOBILE_CHIPS = 6;

/** 「熊 2/2 到達」。スマホ幅では名前を隠し、能力は頭文字（飛・到・接・ト・防・絆）にする */
export function RivalChip({ p, count = 1, blocking = false }: { p: RivalPermanent; count?: number; blocking?: boolean }) {
  const { name, pt, keywords } = rivalParts(p);
  const classes = ['rival-chip', p.tapped && 'tapped', p.sick && 'sick', blocking && 'blocking'].filter(Boolean).join(' ');
  return (
    <span className={classes} data-rival={p.id} title={keywords.map((k) => `${k.name}：${k.text}`).join('\n')}>
      <span className="chip-name">{name}</span> {pt}
      {keywords.map((k) => (
        <span key={k.name} className="chip-kw">
          <span className="kw-long">{k.name}</span>
          <span className="kw-short">{k.short}</span>
        </span>
      ))}
      {count > 1 && <span className="chip-count">×{count}</span>}
    </span>
  );
}

interface Group {
  p: RivalPermanent;
  count: number;
  blocking: boolean;
}

/** 同じ種類で同じ状態のものはまとめる（「兵士 1/1 ×3」） */
function grouped(board: RivalPermanent[], blocking: string[]): Group[] {
  const groups = new Map<string, Group>();
  for (const p of board) {
    const b = blocking.includes(p.id);
    const key = JSON.stringify([p.kind, p.tapped, p.sick, p.damage, b]);
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { p, count: 1, blocking: b });
  }
  return [...groups.values()];
}

interface BoardProps {
  opp: number;
  board: RivalPermanent[];
  /** この相手のクリーチャーのうち、ブロックしているもの */
  blocking: string[];
  recap: string;
}

function RivalBoardInner({ opp, board, blocking, recap }: BoardProps) {
  const set = useStore((s) => s.set);
  const groups = grouped(board, blocking);
  const more = groups.length - MOBILE_CHIPS;
  return (
    <div className="rival-board">
      <button className="rival-chips" aria-label={`対戦相手${opp + 1}のクリーチャー（${board.length}体）`} onClick={() => set({ viewingRival: opp })}>
        {groups.length === 0 ? (
          <span className="muted">クリーチャーなし</span>
        ) : (
          groups.map((g) => <RivalChip key={g.p.id} p={g.p} count={g.count} blocking={g.blocking} />)
        )}
        {more > 0 && <span className="chip-more">+{more}</span>}
      </button>
      {recap && <div className="recap" title={recap}>{recap}</div>}
    </div>
  );
}

export const RivalBoard = memo(RivalBoardInner, (a, b) => JSON.stringify(a) === JSON.stringify(b));

export function RivalViewer() {
  const opp = useStore((s) => s.viewingRival);
  const game = useStore((s) => s.game);
  const editMode = useStore((s) => s.editMode);
  const editTriggers = useStore((s) => s.editTriggers);
  const dispatch = useStore((s) => s.dispatch);
  const set = useStore((s) => s.set);
  if (opp === null) return null;
  const o = game.opponents[opp];
  const rivals = game.rivals!;
  const blocking = Object.values(game.blocks);
  const close = () => set({ viewingRival: null });
  return (
    <div className="modal-back" onPointerDown={closeOnBack(close)}>
      <div className="modal rival-view" role="dialog" aria-label={`対戦相手${opp + 1}のクリーチャー`}>
        <h2>
          対戦相手{opp + 1}・{STYLES[rivals.styles[opp]].name}（{o.board.length}体）
        </h2>
        {rivals.recap[opp] && <p className="muted">直前のターン：{rivals.recap[opp]}</p>}
        <table className="rival-list">
          <tbody>
            {o.board.map((p) => (
              <tr key={p.id}>
                <td>
                  <RivalChip p={p} blocking={blocking.includes(p.id)} />
                </td>
                <td>
                  {kindOf(p).keywords.length === 0 && <span className="muted">能力なし</span>}
                  {rivalParts(p).keywords.map((k) => (
                    <div key={k.name}>
                      {k.name}：{k.text}
                    </div>
                  ))}
                  <div className="muted">
                    {[p.tapped && 'タップ', p.sick && '召喚酔い', blocking.includes(p.id) && 'ブロック中', p.damage > 0 && `${p.damage}点のダメージ`]
                      .filter(Boolean)
                      .join('・')}
                  </div>
                </td>
                {editMode && (
                  <td className="edit-row">
                    <button onClick={() => dispatch({ type: 'rivalTap', opp, id: p.id })}>{p.tapped ? 'アンタップ' : 'タップ'}</button>
                    <button onClick={() => dispatch({ type: 'rivalRemove', opp, id: p.id, trigger: editTriggers })}>取り除く</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editMode && <button onClick={() => dispatch({ type: 'rivalRebuild', opp })}>この相手の盤面を作り直す</button>}
        <button onClick={close}>閉じる</button>
      </div>
    </div>
  );
}
