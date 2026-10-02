// 新しいバージョンが届いたときの適用。読み込み直すと進行中の対局は消えるので、
// 対局を始める前（何も操作していない）か終わったあとなら自動で、対局中なら次の対局を始めるときに適用する。
import { useEffect } from 'react';
import { useStore } from '../store';

export function UpdateBanner() {
  const update = useStore((s) => s.update);
  const safe = useStore((s) => (s.game.phase === 'mulligan' && s.past.length === 0) || s.game.phase === 'over');
  useEffect(() => {
    if (update && safe) update();
  }, [update, safe]);
  if (!update || safe) return null;
  return (
    <div className="update-banner" data-testid="update-banner">
      <span>新しいバージョンがあります。次のゲームを始めるときに自動で更新します</span>
      <button onClick={update}>今すぐ更新（このゲームは終わります）</button>
    </div>
  );
}
