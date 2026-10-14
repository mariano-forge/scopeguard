"use client";

/**
 * Drag handle on the edge of a side panel (like Figma). `edge` is the side of the panel it sits on:
 * "right" for the left panel (drag right = wider), "left" for the inspector (drag left = wider).
 * Arrow keys resize by 16px; double-click restores the default width.
 */
export function ResizeHandle({
  edge,
  width,
  min,
  max,
  defaultWidth,
  label,
  onResize,
}: {
  edge: "left" | "right";
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  label: string;
  onResize: (width: number) => void;
}) {
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  return (
    <div
      className={`resize-handle is-${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Glisser pour redimensionner · double-clic pour revenir à la largeur par défaut"
      onDoubleClick={() => onResize(defaultWidth)}
      onKeyDown={(event) => {
        const step = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
        if (!step) return;
        event.preventDefault();
        onResize(clamp(width + (edge === "right" ? step : -step)));
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        document.body.classList.add("is-resizing");
        function move(moveEvent: PointerEvent) {
          const delta = moveEvent.clientX - startX;
          onResize(clamp(startWidth + (edge === "right" ? delta : -delta)));
        }
        function stop() {
          document.body.classList.remove("is-resizing");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
        }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
      }}
    />
  );
}
