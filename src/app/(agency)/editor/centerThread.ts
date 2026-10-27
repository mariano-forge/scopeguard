// A request opened from the panel's list (feedback of 26 October 2026): its pin and its bubble together come
// to the middle of the canvas, by a pan only (the zoom stays the reader's). A bubble taller than the view
// shows from its top. Shared by the agency's editor and the client's page.

import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

/** Room kept clear at the canvas's foot, where its toolbar floats. */
const toolbarRoom = 88;
const margin = 16;

export function centerThread(zoom: ReactZoomPanPinchRef | null, commentId: number) {
  const view = zoom?.instance.wrapperComponent;
  const pin = document.querySelector<HTMLElement>(`[data-pin="${commentId}"]`);
  if (!zoom || !view || !pin) return;
  // Once the bubble is drawn and placed beside its pin (its side is chosen after it is laid out).
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const bubble = view.querySelector<HTMLElement>(".canvas-page .thread");
      const boxes = [pin.getBoundingClientRect(), ...(bubble ? [bubble.getBoundingClientRect()] : [])];
      const target = {
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        top: Math.min(...boxes.map((box) => box.top)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
      };
      const frame = view.getBoundingClientRect();
      const room = { top: frame.top + margin, bottom: frame.bottom - toolbarRoom, left: frame.left + margin, right: frame.right - margin };
      const dx = (room.left + room.right) / 2 - (target.left + target.right) / 2;
      // Centred when it fits; else its top under the canvas's top edge.
      const dy = target.bottom - target.top <= room.bottom - room.top ? (room.top + room.bottom) / 2 - (target.top + target.bottom) / 2 : room.top - target.top;
      const { positionX, positionY, scale } = zoom.state;
      zoom.setTransform(positionX + dx, positionY + dy, scale, 300);
    }),
  );
}
