// Pointer Events による軽量なドラッグ。動いている間は要素の transform だけを書き換え、React の再描画を起こさない。
import { useRef } from 'react';

const THRESHOLD = 8;
/** ドラッグ中は body に付ける。手札の欄の横スクロール（overflow）で、持ち上げたカードが切れないようにする */
const DRAGGING = 'dragging-card';

export interface DropInfo {
  /** 指を離した位置の下にある data-drop 要素の値 */
  target: string | null;
  /** 上方向に動いた距離（px） */
  rise: number;
}

export function useDrag(onDrop: (info: DropInfo) => void, onTap: () => void) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // 右クリックはドラッグにしない（contextmenu 側で詳細を開く）
    if (e.button !== 0) return;
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
    document.body.classList.add(DRAGGING);
    e.currentTarget.classList.add('dragging');
    e.currentTarget.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    const el = e.currentTarget;
    document.body.classList.remove(DRAGGING);
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

  /** 右クリック（長押し）はブラウザのメニューを出さず、カードの詳細を開く */
  const onContextMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    onTap();
  };

  return { onPointerDown, onPointerMove, onPointerUp, onContextMenu };
}
