// 新しいバージョンの確認と適用。
// Android でホーム画面に追加したアプリは開いたまま裏に置かれることが多いので、
// 前面に戻ったときと1時間ごとにも更新を確かめる。適用（読み込み直し）のタイミングは UpdateBanner が決める。
import { registerSW } from 'virtual:pwa-register';
import { useStore } from './store';

const HOUR = 60 * 60 * 1000;

export function setupUpdates() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => useStore.getState().setUpdate(() => void updateSW(true)),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      setInterval(() => void registration.update(), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });
}
