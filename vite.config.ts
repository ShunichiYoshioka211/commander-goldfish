/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import istanbul from 'vite-plugin-istanbul';
import { VitePWA } from 'vite-plugin-pwa';

// e2e（VITE_COVERAGE）とユニットテスト（VITEST）のときだけ、テスト用デッキを一覧に足す
const testing = Boolean(process.env.VITE_COVERAGE || process.env.VITEST);
const extraDecks = fileURLToPath(new URL(testing ? './tests/fixtures/decks' : './src/data/extra-decks', import.meta.url));

// GitHub Pages ではリポジトリ名の下に置かれる
export default defineConfig(({ command }) => ({
  resolve: {
    alias: {
      '@extra-decks': extraDecks,
      // e2e では Service Worker の代わりに、テストから更新の通知を起こせる差し替えを使う
      ...(process.env.VITE_COVERAGE ? { 'virtual:pwa-register': fileURLToPath(new URL('./tests/fixtures/pwa-register.ts', import.meta.url)) } : {}),
    },
  },
  base: command === 'build' && !process.env.E2E_COVERAGE ? '/commander-goldfish/' : '/',
  plugins: [
    react(),
    // e2e のカバレッジ計測時だけ src/ を計装する
    istanbul({ include: 'src/**', extension: ['.ts', '.tsx'], requireEnv: true, forceBuildInstrument: true }),
    VitePWA({
      // 更新の適用は src/pwa.ts と UpdateBanner が決める（対局中に勝手に読み込み直さない）
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'コマンダー一人回し練習',
        short_name: '一人回し',
        description: 'Ingris Stingerquill デッキのゴールドフィッシュ練習',
        lang: 'ja',
        display: 'standalone',
        orientation: 'any',
        background_color: '#16141c',
        theme_color: '#16141c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\//,
            handler: 'CacheFirst',
            options: { cacheName: 'card-images', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
