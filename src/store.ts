// 画面全体の状態。ゲーム状態の履歴（Undo/Redo）と、表示の設定を持つ。
import { create } from 'zustand';
import { apply, type Action } from './engine/actions';
import { newGame } from './engine/turn';
import type { GameState } from './engine/types';

const HISTORY_LIMIT = 300;
const RESULTS_KEY = 'goldfish.results';
const IMAGES_KEY = 'goldfish.images';

export interface GameResult {
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
  panel: Panel;
  results: GameResult[];
  toast: string | null;
  dispatch: (action: Action) => void;
  undo: () => void;
  redo: () => void;
  restart: (seed?: number) => void;
  set: (patch: Partial<Pick<Store, 'editMode' | 'editTriggers' | 'images' | 'selected' | 'viewing' | 'panel' | 'toast'>>) => void;
}

export const useStore = create<Store>((set, get) => ({
  game: newGame(Number(params.get('seed') ?? randomSeed())),
  past: [],
  future: [],
  editMode: false,
  editTriggers: false,
  images: params.get('images') !== null ? params.get('images') === '1' : readJson(IMAGES_KEY, true),
  selected: null,
  viewing: null,
  panel: 'none',
  results: readJson<GameResult[]>(RESULTS_KEY, []),
  toast: null,
  dispatch: (action) => {
    const { game, past, results } = get();
    const next = apply(game, action);
    const patch: Partial<Store> = { game: next, past: [...past.slice(-HISTORY_LIMIT), game], future: [] };
    if (game.phase !== 'over' && next.phase === 'over') {
      const result: GameResult = {
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
  restart: (seed = randomSeed()) => set({ game: newGame(seed), past: [], future: [], selected: null, viewing: null }),
  set: (patch) => {
    if (patch.images !== undefined) writeJson(IMAGES_KEY, patch.images);
    set(patch);
  },
}));

// e2e テストから状態を覗けるようにする
(window as unknown as { __goldfish: typeof useStore }).__goldfish = useStore;
