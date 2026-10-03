import { useEffect } from 'react';
import { DECKS } from './engine/deck';
import { useStore } from './store';
import { Battlefield, Hand, Opponents, Status } from './ui/Board';
import { Controls, EditToolbar } from './ui/Controls';
import { CardDetail, PromptModal, ResultModal, Toast, ZoneViewer } from './ui/Modals';
import { Panel } from './ui/Panels';
import { RivalViewer } from './ui/Rivals';
import { UpdateBanner } from './ui/UpdateBanner';

function TopBar() {
  const editMode = useStore((s) => s.editMode);
  const images = useStore((s) => s.images);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const seed = useStore((s) => s.game.seed);
  const deckId = useStore((s) => s.game.deckId);
  const rivals = useStore((s) => s.game.rivals !== null);
  const { undo, redo, restart, set, switchDeck, switchRivals } = useStore.getState();
  return (
    <header className="topbar">
      <select aria-label="デッキ" value={deckId} onChange={(e) => switchDeck(e.target.value)}>
        {DECKS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select aria-label="対戦相手" value={rivals ? '1' : '0'} onChange={(e) => switchRivals(e.target.value === '1')}>
        <option value="0">相手なし</option>
        <option value="1">相手あり</option>
      </select>
      <button className={editMode ? 'picked' : ''} aria-pressed={editMode} onClick={() => set({ editMode: !editMode })}>
        編集モード
      </button>
      <button disabled={!canUndo} onClick={undo}>
        元に戻す
      </button>
      <button disabled={!canRedo} onClick={redo}>
        やり直す
      </button>
      <button onClick={() => set({ panel: 'log' })}>ログ</button>
      <button onClick={() => set({ panel: 'stats' })}>記録</button>
      <button onClick={() => set({ panel: 'deck' })}>デッキ</button>
      <button aria-pressed={images} onClick={() => set({ images: !images })}>
        画像
      </button>
      <span className="spacer" />
      <span className="muted">シード {seed}</span>
      <button onClick={() => restart(seed)}>同じシード</button>
      <button onClick={() => restart()}>新しいゲーム</button>
    </header>
  );
}

export default function App() {
  const editMode = useStore((s) => s.editMode);
  // Esc で選択をやめる／手前の画面を閉じる。Ctrl+Z / Ctrl+Y で Undo / Redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { game, selected, viewing, viewingRival, set, cancel } = useStore.getState();
      if (e.key === 'Escape' && game.prompt) return cancel();
      if (e.key === 'Escape') {
        if (selected !== null) return set({ selected: null });
        if (viewing !== null) return set({ viewing: null });
        return set(viewingRival !== null ? { viewingRival: null } : { panel: 'none' });
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const { past, future, undo, redo } = useStore.getState();
      if (e.key === 'z' && past.length > 0) undo();
      if (e.key === 'y' && future.length > 0) redo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={`app${editMode ? ' editing' : ''}`}>
      <TopBar />
      <UpdateBanner />
      {editMode && <EditToolbar />}
      <Opponents />
      <main className="table">
        <Status />
        <Battlefield />
        <Controls />
      </main>
      <Hand />
      <PromptModal />
      <ZoneViewer />
      <RivalViewer />
      <CardDetail />
      <ResultModal />
      <Panel />
      <Toast />
    </div>
  );
}
