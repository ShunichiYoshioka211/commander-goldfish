// Pointer Events による軽量なドラッグ。動いている間は要素の transform だけを書き換え、React の再描画を起こさない。
import { useRef } from 'react';

const THRESHOLD = 8;

export interface DropInfo {
  /** 指を離した位置の下にある data-drop 要素の値 */
  target: string | null;
  /** 上方向に動いた距離（px） */
  rise: number;
}

export function useDrag(onDrop: (info: DropInfo) => void, onTap: () => void) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < THRESHOLD) return;
    s.moved = true;
    e.currentTarget.classList.add('dragging');
    e.currentTarget.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const s = start.current!;
    start.current = null;
    const el = e.currentTarget;
    el.classList.remove('dragging');
    el.style.transform = '';
    if (!s.moved) {
      onTap();
      return;
    }
    // 自分自身の下を見ないよう、一瞬だけポインタ判定から外す
    el.style.pointerEvents = 'none';
    const below = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
    el.style.pointerEvents = '';
    onDrop({ target: below?.getAttribute('data-drop') ?? null, rise: s.y - e.clientY });
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
