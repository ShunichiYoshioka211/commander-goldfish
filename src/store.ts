// 画面全体の状態。ゲーム状態の履歴（Undo/Redo）と、表示の設定を持つ。
import { create } from 'zustand';
import { apply, type Action } from './engine/actions';
import { DECKS } from './engine/deck';
import { newGame, type RivalsOption } from './engine/turn';
import type { GameState } from './engine/types';

const HISTORY_LIMIT = 300;
const RESULTS_KEY = 'goldfish.results';
const IMAGES_KEY = 'goldfish.images';
const DECK_KEY = 'goldfish.deck';
const RIVALS_KEY = 'goldfish.rivals';
/** デッキを複数持つ前の記録はすべてこのデッキのもの */
const LEGACY_DECK = 'ingris';

export interface GameResult {
  deck: string;
  /** 相手ありモードの対局か（古い記録は相手なし） */
  rivals: boolean;
  date: string;
  seed: number;
  turn: number;
  seconds: number;
  mulligans: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // プライベートウィンドウ等で保存できなくても遊べればよい
  }
}

const params = new URLSearchParams(location.search);
const randomSeed = () => Math.floor(Math.random() * 1_000_000);
const seatParam = params.get('seat');
/** 相手ありモードの設定。URL の ?seat=1..4 で席を固定できる（テストでも使う） */
const rivalsOption = (on: boolean): RivalsOption | null => (on ? { seat: seatParam === null ? null : Number(seatParam) } : null);
// URL の ?rivals=0|1 が優先、なければ前回選んだモード。既定は相手なし
const initialRivals = params.get('rivals') !== null ? params.get('rivals') === '1' : readJson(RIVALS_KEY, false);

export type Panel = 'none' | 'log' | 'stats' | 'deck';

interface Store {
  game: GameState;
  past: GameState[];
  future: GameState[];
  editMode: boolean;
  /** 編集モードでの移動で誘発を起こすか */
  editTriggers: boolean;
  images: boolean;
  /** カード詳細を開いているカード */
  selected: string | null;
  /** 一覧表示している領域 */
  viewing: 'library' | 'graveyard' | 'exile' | null;
  /** 一覧表示している相手のクリーチャー（相手の番号） */
  viewingRival: number | null;
  panel: Panel;
  results: GameResult[];
  toast: string | null;
  /** 新しいバージョンを適用する（読み込み直す）関数。届いていなければ null */
  update: (() => void) | null;
  setUpdate: (apply: () => void) => void;
  dispatch: (action: Action) => void;
  undo: () => void;
  redo: () => void;
  /** 選択の途中で、その選択を出した操作の前まで戻す（唱える・起動するのを取りやめる） */
  cancel: () => void;
  restart: (seed?: number) => void;
  /** デッキを切り替える（新しいゲームになる。履歴は消える） */
  switchDeck: (deckId: string) => void;
  /** 相手あり／なしを切り替える（同じシードで新しいゲームになる。履歴は消える） */
  switchRivals: (on: boolean) => void;
  set: (patch: Partial<Pick<Store, 'editMode' | 'editTriggers' | 'images' | 'selected' | 'viewing' | 'viewingRival' | 'panel' | 'toast'>>) => void;
}

export const useStore = create<Store>((set, get) => ({
  // URL の ?deck= が優先、なければ前回選んだデッキ。知らない ID なら既定のデッキになる
  game: newGame(Number(params.get('seed') ?? randomSeed()), params.get('deck') ?? readJson(DECK_KEY, DECKS[0].id), rivalsOption(initialRivals)),
  past: [],
  future: [],
  editMode: false,
  editTriggers: false,
  images: params.get('images') !== null ? params.get('images') === '1' : readJson(IMAGES_KEY, true),
  selected: null,
  viewing: null,
  viewingRival: null,
  panel: 'none',
  // 古い記録には deck と rivals が無い。保存済みのものがあれば後ろの ...r で上書きされる
  results: readJson<Omit<GameResult, 'deck' | 'rivals'>[]>(RESULTS_KEY, []).map((r) => ({ deck: LEGACY_DECK, rivals: false, ...r })),
  toast: null,
  update: null,
  setUpdate: (apply) => set({ update: apply }),
  dispatch: (action) => {
    const { game, past, results } = get();
    const next = apply(game, action);
    const patch: Partial<Store> = { game: next, past: [...past.slice(-HISTORY_LIMIT), game], future: [] };
    if (game.phase !== 'over' && next.phase === 'over') {
      const result: GameResult = {
        deck: next.deckId,
        rivals: next.rivals !== null,
        date: new Date().toISOString(),
        seed: next.seed,
        turn: next.turn,
        seconds: Math.round((next.finishedAt! - next.startedAt) / 1000),
        mulligans: next.mulligans,
      };
      patch.results = [...results, result];
      writeJson(RESULTS_KEY, patch.results);
    }
    set(patch);
  },
  undo: () => {
    const { past, game, future } = get();
    set({ game: past[past.length - 1], past: past.slice(0, -1), future: [game, ...future] });
  },
  redo: () => {
    const { past, game, future } = get();
    set({ game: future[0], past: [...past, game], future: future.slice(1) });
  },
  cancel: () => {
    const { past, game, future } = get();
    // 選択待ちでない最後の状態まで戻る。間の状態はやり直しで辿れるように future に積む
    let i = past.length - 1;
    while (past[i].prompt) i--;
    set({ game: past[i], past: past.slice(0, i), future: [...past.slice(i + 1), game, ...future] });
  },
  // 新しいゲーム・デッキの切り替えは、いまのモード（相手あり／なし）を引き継ぐ
  restart: (seed = randomSeed()) => {
    const { game } = get();
    set({ game: newGame(seed, game.deckId, rivalsOption(game.rivals !== null)), past: [], future: [], selected: null, viewing: null, viewingRival: null });
  },
  switchDeck: (deckId) => {
    writeJson(DECK_KEY, deckId);
    const rivals = rivalsOption(get().game.rivals !== null);
    set({ game: newGame(randomSeed(), deckId, rivals), past: [], future: [], selected: null, viewing: null, viewingRival: null, panel: 'none' });
  },
  switchRivals: (on) => {
    writeJson(RIVALS_KEY, on);
    const { game } = get();
    set({ game: newGame(game.seed, game.deckId, rivalsOption(on)), past: [], future: [], selected: null, viewing: null, viewingRival: null });
  },
  set: (patch) => {
    if (patch.images !== undefined) writeJson(IMAGES_KEY, patch.images);
    set(patch);
  },
}));

// e2e テストから状態を覗けるようにする
(window as unknown as { __goldfish: typeof useStore }).__goldfish = useStore;
