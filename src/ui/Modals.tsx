// 重ねて出す画面：選択の問い合わせ・カード詳細・領域の一覧・結果・通知。
import { useEffect, useState } from 'react';
import type { MoveTarget } from '../engine/actions';
import type { Prompt } from '../engine/types';
import { aliveOpponents, canAttack, def } from '../engine/core';
import { canTapForMana, costText, manaOptions } from '../engine/mana';
import { abilitiesOf, canActivate, canPlayLand, castModes } from '../engine/play';
import { useStore } from '../store';
import { CardInfo, CardThumb } from './CardInfo';
import { CardView } from './CardView';
import { play } from './interact';

export function PromptModal() {
  const prompt = useStore((s) => s.game.prompt);
  const cards = useStore((s) => s.game.cards);
  const deckId = useStore((s) => s.game.deckId);
  const dispatch = useStore((s) => s.dispatch);
  // ひとつ前の状態も選択待ちなら「1つ戻す」で前の選択に戻れる
  const chained = useStore((s) => s.past.at(-1)?.prompt != null);
  const { undo, cancel } = useStore.getState();
  const [picked, setPicked] = useState<(string | number)[]>([]);
  // カーソルを重ねた（長押しした）選択肢のカード。選択画面が変わったら見せない
  const [peek, setPeek] = useState<{ prompt: Prompt; id: string } | null>(null);
  if (!prompt) return null;
  const peeking = peek?.prompt === prompt ? peek.id : null;
  const cardChoices = prompt.options.some((o) => o.card);
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
        {prompt.cards?.map((id) => (
          <div key={id} className="reveal" data-testid="prompt-reveal">
            <CardInfo card={cards[id]} deckId={deckId} />
          </div>
        ))}
        {cardChoices && <p className="muted">カードにカーソルを重ねる（スマホは長押し）と効果が見られる</p>}
        <div className="choices">
          {prompt.options.map((o, i) => {
            const picks = picked.includes(o.value) ? 'picked' : '';
            const id = o.card;
            if (!id) {
              return (
                <button key={`${o.value}-${i}`} className={picks} onClick={() => choose(o.value)}>
                  {o.label}
                </button>
              );
            }
            return (
              <button
                key={`${o.value}-${i}`}
                className={`card-choice ${picks}`}
                onClick={() => choose(o.value)}
                onPointerEnter={() => setPeek({ prompt, id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setPeek({ prompt, id });
                }}
              >
                <CardThumb card={cards[id]} />
                <span className="choice-label">{o.label}</span>
              </button>
            );
          })}
        </div>
        {/* 選択肢の下に出す（上に差し込むと選択肢がずれて押し間違える） */}
        {peeking && (
          <div className="peek" data-testid="prompt-peek">
            <button className="peek-close" aria-label="カードの表示を閉じる" onClick={() => setPeek(null)}>
              ×
            </button>
            <CardInfo card={cards[peeking]} deckId={deckId} />
          </div>
        )}
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
        <div className="prompt-back">
          {chained && (
            <button
              onClick={() => {
                setPicked([]);
                undo();
              }}
            >
              1つ戻す
            </button>
          )}
          <button
            onClick={() => {
              setPicked([]);
              cancel();
            }}
          >
            やめる（この操作の前に戻す）
          </button>
        </div>
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
        <CardInfo card={card} deckId={game.deckId} />
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
