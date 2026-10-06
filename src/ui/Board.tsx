// 盤面：対戦相手・戦場・手札・左右の情報欄。
import { equipmentOn, isCreature, isLand } from '../engine/core';
import { usable } from '../engine/play';
import { STYLES } from '../engine/rivals/kinds';
import type { GameState } from '../engine/types';
import { useStore } from '../store';
import { CardView } from './CardView';
import { RivalBoard } from './Rivals';

const PHASE_LABEL: Record<GameState['phase'], string> = {
  mulligan: 'マリガン',
  main1: 'メイン1',
  combat: '戦闘（攻撃宣言）',
  declared: '戦闘（ブロック前）',
  attacking: '戦闘（ダメージ前）',
  afterDamage: '戦闘（ダメージ後）',
  main2: 'メイン2',
  over: '終了',
};

export function Opponents() {
  const opponents = useStore((s) => s.game.opponents);
  const rivals = useStore((s) => s.game.rivals);
  const blocks = useStore((s) => s.game.blocks);
  const editMode = useStore((s) => s.editMode);
  const dispatch = useStore((s) => s.dispatch);
  const blocking = Object.values(blocks).flat();
  return (
    <>
      {rivals && <div className="seat" data-testid="seat">あなたは{rivals.seat}番手</div>}
      <section className="opponents">
      {opponents.map((o, i) => (
        <div key={i} className={`opponent${o.deadTurn !== null ? ' dead' : ''}`} data-drop={`opp${i}`} data-testid={`opp${i}`}>
          <div className="opp-name">
            対戦相手{i + 1}
            {rivals && `・${STYLES[rivals.styles[i]].name}`}
          </div>
          <div className="opp-life" key={o.life}>
            {o.life}
          </div>
          <div className="opp-sub">
            統率者ダメージ {o.commanderDamage}
            {o.deadTurn !== null && `・${o.deadTurn}T 脱落`}
          </div>
          <div className="opp-sub" data-testid={`opp${i}-library`}>
            ライブラリー {o.library}・墓地 {o.graveyard}
            {o.rad > 0 && <span className="badge rad">RAD {o.rad}</span>}
          </div>
          {editMode && (
            <div className="edit-row">
              <button onClick={() => dispatch({ type: 'oppLife', opp: i, delta: -1 })}>−1</button>
              <button onClick={() => dispatch({ type: 'oppLife', opp: i, delta: -5 })}>−5</button>
              <button onClick={() => dispatch({ type: 'oppLife', opp: i, delta: 1 })}>+1</button>
              <button onClick={() => dispatch({ type: 'cmdDamage', opp: i, delta: 1 })}>統+1</button>
              <button onClick={() => dispatch({ type: 'cmdDamage', opp: i, delta: -1 })}>統−1</button>
              <button onClick={() => dispatch({ type: 'rad', who: i, delta: 1 })}>RAD+1</button>
              <button onClick={() => dispatch({ type: 'rad', who: i, delta: -1 })}>RAD−1</button>
              <button onClick={() => dispatch({ type: 'oppMill', opp: i, delta: 1 })}>切削+1</button>
              <button onClick={() => dispatch({ type: 'oppMill', opp: i, delta: -1 })}>切削−1</button>
            </div>
          )}
          {rivals && (
            <RivalBoard opp={i} board={o.board} blocking={o.board.filter((p) => blocking.includes(p.id)).map((p) => p.id)} recap={rivals.recap[i]} />
          )}
        </div>
      ))}
      </section>
    </>
  );
}

const ready = (s: GameState, id: string) => usable(s, s.cards[id]);

function Row({ ids, label }: { ids: string[]; label: string }) {
  const game = useStore((s) => s.game);
  return (
    <div className="row" aria-label={label}>
      {ids.map((id) => (
        <CardView
          key={id}
          card={game.cards[id]}
          planned={game.plan[id]}
          blocked={id in game.blocks}
          ready={ready(game, id)}
          equipped={equipmentOn(game, game.cards[id]).length > 0}
        />
      ))}
    </div>
  );
}

export function Battlefield() {
  const game = useStore((s) => s.game);
  const cards = game.zones.battlefield.map((id) => game.cards[id]);
  const creatures = cards.filter((c) => isCreature(c)).map((c) => c.id);
  const others = cards.filter((c) => !isCreature(c) && !isLand(c)).map((c) => c.id);
  const lands = cards.filter((c) => isLand(c) && !isCreature(c)).map((c) => c.id);
  return (
    <section className="battlefield" data-drop="battlefield" data-testid="battlefield">
      <Row ids={creatures} label="クリーチャー" />
      <Row ids={others} label="その他のパーマネント" />
      <Row ids={lands} label="土地" />
    </section>
  );
}

export function Hand() {
  const game = useStore((s) => s.game);
  // 枚数を CSS に渡し、枚数が多いほどカードを深く重ねて欄の幅に収める（右のカードが外に出ないように）
  const style = { '--n': game.zones.hand.length } as React.CSSProperties;
  return (
    <section className="hand" data-drop="hand" data-testid="hand" style={style}>
      {game.zones.hand.map((id) => (
        <CardView key={id} card={game.cards[id]} ready={ready(game, id)} />
      ))}
    </section>
  );
}

function Pile({ zone, label }: { zone: 'library' | 'graveyard' | 'exile'; label: string }) {
  const count = useStore((s) => s.game.zones[zone].length);
  // 中に唱えられる・起動できるカード（フラッシュバック・蘇生・追放から唱えられるものなど）があれば光らせる
  const usableInside = useStore((s) => s.game.zones[zone].some((id) => usable(s.game, s.game.cards[id])));
  const editMode = useStore((s) => s.editMode);
  const set = useStore((s) => s.set);
  const locked = zone === 'library' && !editMode;
  return (
    <button
      className={`pile${usableInside ? ' ready' : ''}`}
      data-drop={zone}
      data-testid={`pile-${zone}`}
      disabled={locked}
      onClick={() => set({ viewing: zone })}
    >
      {label}
      <b>{count}</b>
    </button>
  );
}

export function Status() {
  const game = useStore((s) => s.game);
  const editMode = useStore((s) => s.editMode);
  const dispatch = useStore((s) => s.dispatch);
  return (
    <aside className="status">
      <div className="me">
        <span>ライフ</span>
        <b data-testid="my-life">{game.life}</b>
        {editMode && (
          <span className="edit-row">
            <button onClick={() => dispatch({ type: 'life', delta: -1 })}>−1</button>
            <button onClick={() => dispatch({ type: 'life', delta: 1 })}>+1</button>
          </span>
        )}
      </div>
      <div className="turn" data-testid="turn">
        {game.turn}ターン目・{PHASE_LABEL[game.phase]}
      </div>
      <div className="badges">
        {game.monarch && <span className="badge">統治者</span>}
        {game.speed > 0 && <span className="badge">スピード {game.speed}</span>}
        {game.rad > 0 && <span className="badge rad" data-testid="my-rad">RAD {game.rad}</span>}
        {editMode && (
          <span className="edit-row">
            <button onClick={() => dispatch({ type: 'speed', delta: 1 })}>速+</button>
            <button onClick={() => dispatch({ type: 'speed', delta: -1 })}>速−</button>
            <button onClick={() => dispatch({ type: 'monarch' })}>統治者</button>
            <button onClick={() => dispatch({ type: 'rad', who: null, delta: 1 })}>RAD+</button>
            <button onClick={() => dispatch({ type: 'rad', who: null, delta: -1 })}>RAD−</button>
          </span>
        )}
      </div>
      <div className="command" data-drop="command" data-testid="command">
        {game.zones.command.map((id) => (
          <CardView key={id} card={game.cards[id]} ready={ready(game, id)} />
        ))}
        <span className="tax">統率者税 {2 * (game.commanderCasts[game.commanders[0]] ?? 0)}</span>
      </div>
      <div className="piles">
        <Pile zone="library" label="ライブラリー" />
        <Pile zone="graveyard" label="墓地" />
        <Pile zone="exile" label="追放" />
      </div>
    </aside>
  );
}
