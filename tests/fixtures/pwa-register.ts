// e2e のときだけ virtual:pwa-register の代わりに読み込まれる（vite.config.ts の alias）。
// 開発サーバでは Service Worker が動かないので、テストから更新の通知を起こせるようにする。
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

declare global {
  interface Window {
    __pwa?: RegisterSWOptions;
    __pwaApplied?: number;
  }
}

export function registerSW(options: RegisterSWOptions) {
  window.__pwa = options;
  window.__pwaApplied = 0;
  return async () => {
    window.__pwaApplied!++;
  };
}
