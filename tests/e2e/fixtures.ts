import { test as base, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Action } from '../../src/engine/actions';
import type { GameState, ZoneId } from '../../src/engine/types';

/** 各テストの終わりに window.__coverage__ を .nyc_output に書き出す */
export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    await use(new App(page));
    const coverage = await page.evaluate(() => (window as unknown as { __coverage__?: unknown }).__coverage__);
    if (coverage) {
      mkdirSync('.nyc_output', { recursive: true });
      writeFileSync(`.nyc_output/${randomUUID()}.json`, JSON.stringify(coverage));
    }
  },
});

export { expect };

type Snapshot = Pick<GameState, 'turn' | 'phase' | 'life' | 'zones' | 'opponents' | 'pool' | 'speed' | 'monarch' | 'landPlayed' | 'mulligans' | 'deckId'> & {
  cards: Record<string, { name: string; zone: ZoneId; tapped: boolean; counters: Record<string, number>; token: boolean; attacking: number | null }>;
  prompt: { title: string; options: { label: string; value: string | number }[] } | null;
};

export class App {
  constructor(readonly page: Page) {}

  async open(query = 'seed=1&images=0') {
    await this.page.goto(`/?${query}`);
  }

  /** キープして1ターン目を始める */
  async start(query?: string) {
    await this.open(query);
    await this.page.getByRole('button', { name: 'キープ' }).click();
  }

  state(): Promise<Snapshot> {
    return this.page.evaluate(() => {
      const g = (window as unknown as { __goldfish: { getState: () => { game: GameState } } }).__goldfish.getState().game;
      return JSON.parse(JSON.stringify({ ...g, queue: undefined, fresh: undefined, prompt: g.prompt && { title: g.prompt.title, options: g.prompt.options } }));
    });
  }

  /** 状態の準備はエンジンの操作で直接行う（UI の操作は各テストで行う） */
  async dispatch(...actions: Action[]) {
    for (const a of actions) {
      await this.page.evaluate((x) => (window as unknown as { __goldfish: { getState: () => { dispatch: (a: unknown) => void } } }).__goldfish.getState().dispatch(x), a as never);
    }
  }

  async id(name: string, notIn?: ZoneId) {
    const s = await this.state();
    const all = Object.entries(s.cards).filter(([, c]) => c.name === name);
    return (all.find(([, c]) => c.zone !== notIn) ?? all[0])[0];
  }

  /** 名前のカードを誘発なしで指定の領域に置く */
  async put(name: string, zone: ZoneId, trigger = false) {
    const id = await this.id(name, zone);
    await this.dispatch({ type: 'move', id, to: zone, trigger });
    return id;
  }

  async lands(...names: string[]) {
    for (const n of names) await this.put(n, 'battlefield');
  }

  /** ターンを終える。手札が8枚以上なら先頭から捨てる */
  async endTurn() {
    await this.dispatch({ type: 'endTurn' });
    const s = await this.state();
    if (s.prompt?.title.startsWith('手札が多い')) {
      await this.dispatch({ type: 'answer', values: s.zones.hand.slice(0, s.zones.hand.length - 7) });
    }
  }

  card(id: string) {
    return this.page.locator(`[data-card="${id}"]`);
  }

  async oppLife() {
    return (await this.state()).opponents.map((o) => o.life);
  }

  /** 選択ダイアログの選択肢を押す */
  async choose(label: string | RegExp) {
    await this.page.getByRole('dialog').getByRole('button', { name: label }).first().click();
  }

  /** カード詳細を開いてボタンを押す */
  async act(id: string, button: string | RegExp) {
    await this.card(id).click();
    await this.page.getByRole('dialog').getByRole('button', { name: button }).first().click();
  }

  /** 要素から要素へドラッグする */
  async drag(from: string, toSelector: string) {
    // 前のドラッグから戻るアニメーションが終わるまで待つ
    await this.card(from).hover({ trial: true });
    const src = (await this.card(from).boundingBox())!;
    const dst = (await this.page.locator(toSelector).first().boundingBox())!;
    await this.page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(src.x + src.width / 2 + 5, src.y + src.height / 2 - 20, { steps: 2 });
    await this.page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 4 });
    await this.page.mouse.up();
  }
}
