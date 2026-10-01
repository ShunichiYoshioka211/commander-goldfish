// 重ねて出す画面：選択の問い合わせ・カード詳細・領域の一覧・結果・通知。
import { useEffect, useState } from 'react';
import { isScripted } from '../cards/registry';
import type { MoveTarget } from '../engine/actions';
import { aliveOpponents, canAttack, def } from '../engine/core';
import { canTapForMana, costText, manaOptions } from '../engine/mana';
import { abilitiesOf, canActivate, canPlayLand, castModes } from '../engine/play';
import { useStore } from '../store';
import { CardView } from './CardView';
import { play } from './interact';

export function PromptModal() {
  const prompt = useStore((s) => s.game.prompt);
  const dispatch = useStore((s) => s.dispatch);
  const [picked, setPicked] = useState<(string | number)[]>([]);
  if (!prompt) return null;
  const single = prompt.max === 1;
  const choose = (v: string | number) => {
    if (single) {
      setPicked([]);
      dispatch({ type: 'answer', values: [v] });
    } else {
      setPicked(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v].slice(-prompt.max));
    }
  };
  return (
    <div className="modal-back prompt">
      <div className="modal" role="dialog" aria-label={prompt.title}>
        <h2>{prompt.title}</h2>
        {!single && (
          <p className="muted">
            {picked.length} / {prompt.min} 枚選択
          </p>
        )}
        <div className="choices">
          {prompt.options.map((o, i) => (
            <button key={`${o.value}-${i}`} className={picked.includes(o.value) ? 'picked' : ''} onClick={() => choose(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {!single && (
          <button
            className="primary"
            disabled={picked.length < prompt.min}
            onClick={() => {
              setPicked([]);
              dispatch({ type: 'answer', values: picked });
            }}
          >
            決定
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 背景を押したら閉じる。click ではなく pointerdown で見るのは、タッチ操作のあとに遅れて届く
 * click が、開いたばかりの背景に当たって即座に閉じてしまうのを避けるため
 */
const closeOnBack = (close: () => void) => (e: React.PointerEvent) => {
  if (e.target === e.currentTarget) close();
};

const MOVES: [MoveTarget, string][] = [
  ['hand', '手札'],
  ['battlefield', '戦場'],
  ['graveyard', '墓地'],
  ['exile', '追放'],
  ['command', '統率領域'],
  ['library', 'ライブラリーの上'],
  ['libraryBottom', 'ライブラリーの下'],
  ['libraryShuffle', 'ライブラリーに入れてシャッフル'],
];
const COUNTERS = ['+1/+1', 'loyalty', 'fire', 'oil'];

export function CardDetail() {
  const id = useStore((s) => s.selected);
  const game = useStore((s) => s.game);
  const editMode = useStore((s) => s.editMode);
  const editTriggers = useStore((s) => s.editTriggers);
  const dispatch = useStore((s) => s.dispatch);
  const set = useStore((s) => s.set);
  const card = id === null ? undefined : game.cards[id];
  if (!card) return null;
  const d = def(card);
  const close = () => set({ selected: null });
  const act = (f: () => void) => () => {
    close();
    f();
  };
  const onField = card.zone === 'battlefield';
  return (
    <div className="modal-back" onPointerDown={closeOnBack(close)}>
      <div className="modal detail" role="dialog" aria-label={d.jaName}>
        <div className="detail-body">
          {d.image && <img src={d.image.normal} alt="" className="detail-image" />}
          <div>
            <h2>{d.jaName}</h2>
            <div className="muted">
              {d.name} {d.manaCost}
            </div>
            <div>{d.typeJa}</div>
            <p className="oracle">{d.textJa}</p>
            {d.tip && <p className="note">コツ：{d.tip}</p>}
            <span className="badge">{isScripted(card.name) ? '自動処理あり' : '効果は手動で処理'}</span>
          </div>
        </div>
        <div className="actions">
          {canPlayLand(game, card) && <button className="primary" onClick={act(() => play(card))}>プレイ</button>}
          {castModes(game, card).map((m) => (
            <button key={m.index} className="primary" onClick={act(() => dispatch({ type: 'cast', id: card.id, mode: m.index }))}>
              唱える：{m.label}（{costText(m.cost)}）
            </button>
          ))}
          {onField && canTapForMana(card) &&
            manaOptions(game, card).map((o, i) =>
              o.auto ? null : (
                <button key={o.label} onClick={act(() => dispatch({ type: 'tapMana', id: card.id, option: i }))}>
                  マナ：{o.label}
                </button>
              ),
            )}
          {abilitiesOf(card).map((a, i) =>
            canActivate(game, card, a) ? (
              <button key={a.label} onClick={act(() => dispatch({ type: 'activate', id: card.id, index: i }))}>
                {a.cost ? `${a.cost}：` : ''}
                {a.label}
              </button>
            ) : null,
          )}
          {onField && game.phase === 'combat' && canAttack(card) &&
            aliveOpponents(game).map((i) => (
              <button key={i} onClick={act(() => dispatch({ type: 'plan', id: card.id, opp: i }))}>
                相手{i + 1}に攻撃
              </button>
            ))}
          {game.plan[card.id] !== undefined && (
            <button onClick={act(() => dispatch({ type: 'plan', id: card.id, opp: null }))}>攻撃をやめる</button>
          )}
        </div>
        {editMode && (
          <div className="edit-actions" data-testid="edit-actions">
            <div className="edit-row">
              {MOVES.filter(([to]) => to !== card.zone).map(([to, label]) => (
                <button key={to} onClick={act(() => dispatch({ type: 'move', id: card.id, to, trigger: editTriggers }))}>
                  → {label}
                </button>
              ))}
            </div>
            {onField && (
              <div className="edit-row">
                <button onClick={() => dispatch({ type: 'tap', id: card.id })}>{card.tapped ? 'アンタップ' : 'タップ'}（効果なし）</button>
                {COUNTERS.map((k) => (
                  <span key={k} className="counter-edit">
                    {k} {card.counters[k] ?? 0}
                    <button aria-label={`${k}を増やす`} onClick={() => dispatch({ type: 'counter', id: card.id, kind: k, delta: 1 })}>
                      +
                    </button>
                    <button aria-label={`${k}を減らす`} onClick={() => dispatch({ type: 'counter', id: card.id, kind: k, delta: -1 })}>
                      −
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={close}>閉じる</button>
      </div>
    </div>
  );
}

const ZONE_TITLE = { library: 'ライブラリー（上から）', graveyard: '墓地', exile: '追放' };

export function ZoneViewer() {
  const zone = useStore((s) => s.viewing);
  const game = useStore((s) => s.game);
  const set = useStore((s) => s.set);
  if (!zone) return null;
  const close = () => set({ viewing: null });
  return (
    <div className="modal-back" onPointerDown={closeOnBack(close)}>
      <div className="modal zone-view" role="dialog" aria-label={ZONE_TITLE[zone]}>
        <h2>
          {ZONE_TITLE[zone]}（{game.zones[zone].length}）
        </h2>
        <div className="row wrap">
          {game.zones[zone].map((cid) => (
            <CardView key={cid} card={game.cards[cid]} />
          ))}
        </div>
        <button onClick={close}>閉じる</button>
      </div>
    </div>
  );
}

export function ResultModal() {
  const game = useStore((s) => s.game);
  const restart = useStore((s) => s.restart);
  const set = useStore((s) => s.set);
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(false), [game.seed, game.phase]);
  if (game.phase !== 'over' || hidden) return null;
  const seconds = Math.round((game.finishedAt! - game.startedAt) / 1000);
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-label="結果">
        <h2>{game.turn}ターン目に全員を倒した</h2>
        <p>
          所要時間 {Math.floor(seconds / 60)}分{seconds % 60}秒・マリガン {game.mulligans}回・シード {game.seed}
        </p>
        <div className="actions">
          <button className="primary" onClick={() => restart()}>
            新しいゲーム
          </button>
          <button onClick={() => restart(game.seed)}>同じシードでもう一度</button>
          <button
            onClick={() => {
              setHidden(true);
              set({ panel: 'stats' });
            }}
          >
            ダメージを見る
          </button>
          <button onClick={() => setHidden(true)}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => set({ toast: null }), 1800);
    return () => clearTimeout(t);
  }, [toast, set]);
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}
