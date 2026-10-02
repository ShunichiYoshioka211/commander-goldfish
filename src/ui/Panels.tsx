// 横から出すパネル：ログ・ダメージ統計と履歴・デッキ一覧。
import { isScripted } from '../cards/registry';
import { deckById } from '../engine/deck';
import { OPPONENTS } from '../engine/turn';
import { useStore } from '../store';

export function Panel() {
  const panel = useStore((s) => s.panel);
  const set = useStore((s) => s.set);
  if (panel === 'none') return null;
  return (
    <div className="panel" role="dialog" aria-label="パネル">
      <div className="panel-tabs">
        <button className={panel === 'log' ? 'picked' : ''} onClick={() => set({ panel: 'log' })}>
          ログ
        </button>
        <button className={panel === 'stats' ? 'picked' : ''} onClick={() => set({ panel: 'stats' })}>
          ダメージ・記録
        </button>
        <button className={panel === 'deck' ? 'picked' : ''} onClick={() => set({ panel: 'deck' })}>
          デッキ
        </button>
        <button onClick={() => set({ panel: 'none' })}>閉じる</button>
      </div>
      {panel === 'log' && <Log />}
      {panel === 'stats' && <Stats />}
      {panel === 'deck' && <Deck />}
    </div>
  );
}

function Log() {
  const log = useStore((s) => s.game.log);
  return (
    <ol className="log" data-testid="log">
      {log.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ol>
  );
}

function Stats() {
  const game = useStore((s) => s.game);
  const deckId = useStore((s) => s.game.deckId);
  // 記録はデッキごとに見る
  const results = useStore((s) => s.results).filter((r) => r.deck === deckId);
  const turns = Array.from({ length: game.turn }, (_, i) => i + 1);
  const perTurn = turns.map((t) =>
    Array.from({ length: OPPONENTS }, (_, opp) =>
      game.damage.filter((d) => d.turn === t && d.target === opp).reduce((n, d) => n + d.amount, 0),
    ),
  );
  const max = Math.max(1, ...perTurn.map((xs) => xs.reduce((a, b) => a + b, 0)));
  const bySource = new Map<string, number>();
  for (const d of game.damage) bySource.set(d.source, (bySource.get(d.source) ?? 0) + d.amount);
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const average = results.length ? (results.reduce((n, r) => n + r.turn, 0) / results.length).toFixed(1) : '—';
  return (
    <div className="stats" data-testid="stats">
      <h3>ターンごとのダメージ</h3>
      <div className="bars">
        {perTurn.map((xs, i) => (
          <div key={i} className="bar-row">
            <span className="bar-label">{i + 1}T</span>
            <span className="bar">
              {xs.map((n, opp) => (
                <span key={opp} className={`seg seg-${opp}`} style={{ width: `${(n / max) * 100}%` }} title={`相手${opp + 1}: ${n}`} />
              ))}
            </span>
            <span className="bar-total">{xs.reduce((a, b) => a + b, 0)}</span>
          </div>
        ))}
      </div>
      <h3>発生源ごとの合計</h3>
      <table>
        <tbody>
          {sources.map(([name, n]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="num">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>これまでの記録（平均キルターン {average}）</h3>
      <table>
        <tbody>
          {results
            .slice(-20)
            .reverse()
            .map((r) => (
              <tr key={r.date}>
                <td>{r.date.slice(0, 16).replace('T', ' ')}</td>
                <td className="num">{r.turn}T</td>
                <td className="num">{r.seconds}秒</td>
                <td className="num">シード {r.seed}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Deck() {
  const deckId = useStore((s) => s.game.deckId);
  const DECK = deckById(deckId);
  const total = DECK.cards.reduce((n, c) => n + c.count, 0);
  const curve = Array.from({ length: 8 }, (_, cmc) =>
    DECK.cards.filter((c) => !c.typeLine.includes('Land') && Math.min(7, c.cmc) === cmc).reduce((n, c) => n + c.count, 0),
  );
  const top = Math.max(...curve);
  const cards = [...DECK.cards].sort((a, b) => a.cmc - b.cmc || a.jaName.localeCompare(b.jaName, 'ja'));
  return (
    <div className="deck" data-testid="deck">
      <p>
        {DECK.name}：<b>{total}</b> / 100 枚（統率者込み）
      </p>
      <div className="curve">
        {curve.map((n, cmc) => (
          <div key={cmc} className="curve-col">
            <span className="curve-bar" style={{ height: `${(n / top) * 60}px` }} />
            <span>{cmc === 7 ? '7+' : cmc}</span>
            <span className="muted">{n}</span>
          </div>
        ))}
      </div>
      <table>
        <tbody>
          {cards.map((c) => (
            <tr key={c.name}>
              <td className="num">{c.count}</td>
              <td>{c.jaName}</td>
              <td className="muted">{c.manaCost}</td>
              <td>{isScripted(c.name) ? <span className="badge">自動</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
