/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import istanbul from 'vite-plugin-istanbul';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages ではリポジトリ名の下に置かれる
export default defineConfig(({ command }) => ({
  base: command === 'build' && !process.env.E2E_COVERAGE ? '/commander-goldfish/' : '/',
  plugins: [
    react(),
    // e2e のカバレッジ計測時だけ src/ を計装する
    istanbul({ include: 'src/**', extension: ['.ts', '.tsx'], requireEnv: true, forceBuildInstrument: true }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
