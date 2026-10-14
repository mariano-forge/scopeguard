"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Maximize, MessageCirclePlus, Minus, MousePointer2, Plus } from "lucide-react";
import { DeliverableContent } from "@/components/DeliverableContent";
import type { DeliverableType } from "@/components/deliverableKinds";
import { CommentPin, TargetHighlight, describeTarget, type Area, type TargetBox, type ThreadComment } from "./CanvasComments";
import { Hint } from "@/components/hint";

/** Canvas tools: move (pan, open threads) and comment (default). Requests are qualified from a comment. */
export type CanvasTool = "move" | "remark";
/** Where a new comment is being written. */
export type CanvasComposer = {
  page: number;
  x: number;
  y: number;
  target: string;
  area?: Area;
};
type CanvasComment = ThreadComment & { page?: number };
type ViewedDeliverable = { name: string; type: DeliverableType; fileData?: string; url?: string; coverData?: string };

const areaBox = (area: Area): TargetBox => ({ left: area.x, top: area.y, width: area.w, height: area.h, label: "" });

/**
 * The review canvas shared by the agency editor and the client page: pages one under the other,
 * pins, targeting (element, PDF text line, image, page), click + drag to draw an area, floating tools.
 * Threads and the composer are rendered by the caller (agency and client don't offer the same actions).
 */
export function ReviewCanvas({
  deliverable,
  comments,
  selectedId,
  threadOpen,
  readOnly,
  tool,
  tools,
  onToolChange,
  composer,
  onCompose,
  onPinClick,
  onBackgroundClick,
  renderThread,
  renderComposer,
  transformRef,
  overlay,
  toolbarExtra,
  canMove,
  onMovePin,
}: {
  deliverable: ViewedDeliverable;
  comments: CanvasComment[];
  selectedId: number | null;
  threadOpen: boolean;
  readOnly: boolean;
  tool: CanvasTool;
  /** Tools offered in the toolbar. */
  tools: CanvasTool[];
  onToolChange: (tool: CanvasTool) => void;
  composer: CanvasComposer | null;
  onCompose: (composer: CanvasComposer) => void;
  onPinClick: (comment: CanvasComment) => void;
  /** Click on the canvas with the move tool (closes what is open). */
  onBackgroundClick: () => void;
  renderThread: (comment: CanvasComment) => React.ReactNode;
  renderComposer: (composer: CanvasComposer) => React.ReactNode;
  transformRef: RefObject<ReactZoomPanPinchRef | null>;
  /** Banners shown over the canvas (frozen version, errors). */
  overlay?: React.ReactNode;
  /** Extra tools at the end of the toolbar (agency: copy / export). */
  toolbarExtra?: React.ReactNode;
  /** Pins that can be moved (double-click, then click to drop). */
  canMove?: (comment: CanvasComment) => boolean;
  onMovePin?: (commentId: number, page: number, x: number, y: number) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(100);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<{ page: number; box: TargetBox; element: Element } | null>(null);
  const [drawing, setDrawing] = useState<{ page: number; box: TargetBox } | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const drawStart = useRef<{ page: number; bounds: DOMRect; x: number; y: number } | null>(null);
  const commenting = tool !== "move" && !readOnly;
  /** Pin being moved: it follows the pointer until a click drops it (Escape cancels). */
  const [moving, setMoving] = useState<{ id: number; page: number; x: number; y: number } | null>(null);
  /** Press on a movable pin: past a few pixels it becomes a drag, dropped on release. */
  const pinPress = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  useEffect(() => {
    if (!moving) return;
    function cancel(event: KeyboardEvent) {
      if (event.key === "Escape") setMoving(null);
    }
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [moving]);
  const selected = comments.find((comment) => comment.id === selectedId);
  // An open bubble (or the new-comment form) stays fully visible: when it opens or grows (qualify form),
  // the canvas pans so it sits between the top of the canvas and the toolbar.
  const bubbleKey = `${threadOpen ? `${selectedId}-${selected?.decision}` : ""}|${composer ? `${composer.page}-${composer.x}-${composer.y}` : ""}`;
  useEffect(() => {
    const panel = panelRef.current;
    const bubble = panel?.querySelector<HTMLElement>(".thread");
    if (!panel || !bubble) return;
    const reveal = () => {
      const zoomApi = transformRef.current;
      const frame = panel.querySelector(".artboard-transform-wrapper")?.getBoundingClientRect();
      if (!zoomApi || !frame) return;
      const box = bubble.getBoundingClientRect();
      const toolbarTop = panel.querySelector(".canvas-toolbar")?.getBoundingClientRect().top ?? frame.bottom;
      const margin = 12;
      let dy = 0;
      if (box.bottom > toolbarTop - margin) dy = toolbarTop - margin - box.bottom;
      if (box.top + dy < frame.top + margin) dy = frame.top + margin - box.top;
      let dx = 0;
      if (box.right > frame.right - margin) dx = frame.right - margin - box.right;
      if (box.left + dx < frame.left + margin) dx = frame.left + margin - box.left;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const { positionX, positionY, scale } = zoomApi.state;
      zoomApi.setTransform(positionX + dx, positionY + dy, scale, 200);
    };
    const resize = new ResizeObserver(() => requestAnimationFrame(reveal));
    resize.observe(bubble);
    return () => resize.disconnect();
  }, [bubbleKey, transformRef]);
  const pageKind =
    deliverable.type === "PDF" && deliverable.fileData
      ? "pdf"
      : deliverable.type === "Image" && deliverable.fileData
        ? "image"
        : deliverable.type === "Video" && deliverable.fileData
          ? "video"
          : (deliverable.type === "Link" && deliverable.url) || (deliverable.type === "Doc" && deliverable.fileData)
            ? "placeholder"
            : "mock";

  /** Page under an event and the point in % of that page. */
  function pagePoint(event: React.MouseEvent) {
    // By position, not by target: while a pin is dragged the artboard captures the pointer.
    const page =
      (event.target as Element).closest<HTMLElement>("[data-page]") ??
      document.elementsFromPoint(event.clientX, event.clientY).find((element) => element.matches("[data-page]")) as HTMLElement | undefined;
    if (!page) return null;
    const bounds = page.getBoundingClientRect();
    const percent = (value: number) => Math.min(100, Math.max(0, Math.round(value * 1000) / 10));
    return {
      page: Number(page.dataset.page) || 1,
      bounds,
      x: percent((event.clientX - bounds.left) / bounds.width),
      y: percent((event.clientY - bounds.top) / bounds.height),
    };
  }

  /** Meaningful element under the pointer (a button, a text line, an image), or null: then the page itself is the target. */
  function targetElement(target: EventTarget | null) {
    const element = target instanceof Element ? target : null;
    const content = element?.closest(".canvas-page-content");
    if (!element || !content || element === content) return null;
    const zone = element.closest("button, a, h1, h2, h3, h4, h5, h6, p, li, nav, small, img, svg, [class^='mock-'], [class*=' mock-']");
    const picked = zone && content.contains(zone) ? zone : element;
    if (picked === content || picked.matches("canvas, video, iframe, .react-pdf__Page, .react-pdf__Document, .textLayer, .canvas-page-content > *:only-child:not(img)"))
      return null;
    return picked;
  }

  function boxIn(element: Element, bounds: DOMRect, label: string): TargetBox {
    const rect = element.getBoundingClientRect();
    return {
      left: ((rect.left - bounds.left) / bounds.width) * 100,
      top: ((rect.top - bounds.top) / bounds.height) * 100,
      width: (rect.width / bounds.width) * 100,
      height: (rect.height / bounds.height) * 100,
      label,
    };
  }

  function trackHover(event: React.PointerEvent<HTMLDivElement>) {
    if (!commenting || composer || drawing || (event.target as Element).closest(".thread, .canvas-pin")) {
      if (hover) setHover(null);
      return;
    }
    const point = pagePoint(event);
    if (!point) {
      if (hover) setHover(null);
      return;
    }
    const element = targetElement(event.target) ?? (event.target as Element).closest("[data-page]");
    if (!element || element === hover?.element) return;
    setHover({
      page: point.page,
      element,
      box: element.matches("[data-page]")
        ? { left: 0, top: 0, width: 100, height: 100, label: `Page ${point.page}` }
        : boxIn(element, point.bounds, describeTarget(element)),
    });
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (moving) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    setDragging(false);
    const pin = (event.target as Element).closest<HTMLElement>(".canvas-pin");
    const pinned = pin && comments.find((comment) => comment.id === Number(pin.dataset.pin));
    if (pinned && event.button === 0 && !readOnly && canMove?.(pinned)) {
      pinPress.current = { id: pinned.id, x: event.clientX, y: event.clientY, dragging: false };
      return;
    }
    if (!commenting || event.button !== 0 || (event.target as Element).closest(".thread, .canvas-pin")) return;
    const page = (event.target as Element).closest<HTMLElement>("[data-page]");
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    drawStart.current = {
      page: Number(page.dataset.page) || 1,
      bounds,
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const press = pinPress.current;
    if (press && !press.dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
      press.dragging = true;
      moved.current = true;
      // Captured only once it is a drag, so a plain click / double-click still reaches the pin.
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pagePoint(event);
      if (point) setMoving({ id: press.id, page: point.page, x: point.x, y: point.y });
      return;
    }
    if (moving) {
      const point = pagePoint(event);
      if (point) setMoving({ ...moving, page: point.page, x: point.x, y: point.y });
      return;
    }
    const start = pointerStart.current;
    if (start) {
      moved.current = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5;
      if (moved.current && tool === "move") setDragging(true);
    }
    const origin = drawStart.current;
    if (origin && moved.current) {
      const clamp = (value: number) => Math.min(100, Math.max(0, value));
      const x = clamp(((event.clientX - origin.bounds.left) / origin.bounds.width) * 100);
      const y = clamp(((event.clientY - origin.bounds.top) / origin.bounds.height) * 100);
      setHover(null);
      setDrawing({
        page: origin.page,
        box: { left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y), label: "Zone" },
      });
      return;
    }
    trackHover(event);
  }

  function pointerUp() {
    const press = pinPress.current;
    pinPress.current = null;
    if (press?.dragging && moving) {
      pointerStart.current = null;
      onMovePin?.(moving.id, moving.page, moving.x, moving.y);
      setMoving(null);
      return;
    }
    pointerStart.current = null;
    setDragging(false);
    const box = drawing?.box;
    if (drawing && box && box.width > 1 && box.height > 1) {
      const round = (value: number) => Math.round(value * 10) / 10;
      const area = { x: round(box.left), y: round(box.top), w: round(box.width), h: round(box.height) };
      onCompose({
        page: drawing.page,
        x: area.x,
        y: area.y,
        target: `Page ${drawing.page} · Zone sélectionnée`,
        area,
      });
    }
    drawStart.current = null;
    setDrawing(null);
  }

  /** Capture phase, so the deliverable's own buttons don't swallow the click. */
  function click(event: React.MouseEvent<HTMLDivElement>) {
    if (moving) {
      event.preventDefault();
      event.stopPropagation();
      onMovePin?.(moving.id, moving.page, moving.x, moving.y);
      setMoving(null);
      return;
    }
    if ((event.target as Element).closest(".thread, .canvas-pin")) return;
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (tool === "move") {
      onBackgroundClick();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) return;
    const point = pagePoint(event);
    if (!point) return;
    const element = targetElement(event.target);
    setHover(null);
    onCompose({
      page: point.page,
      x: point.x,
      y: point.y,
      target: [`Page ${point.page}`, element ? describeTarget(element) : null].filter(Boolean).join(" · "),
    });
  }

  /** Fits the pages to the canvas width, from the top (100 % if they already fit). */
  function fitWidth() {
    const zoomApi = transformRef.current;
    const wrapper = zoomApi?.instance.wrapperComponent;
    const content = zoomApi?.instance.contentComponent?.querySelector<HTMLElement>(".artboard");
    if (!zoomApi || !wrapper || !content) return;
    const scale = Math.min(1, (wrapper.clientWidth - 64) / content.offsetWidth);
    zoomApi.setTransform((wrapper.clientWidth - content.offsetWidth * scale) / 2 - content.offsetLeft * scale, 0, scale, 200);
  }

  function toggleFullscreen() {
    if (!panelRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current.requestFullscreen();
  }

  const toolButtons: Record<CanvasTool, { icon: React.ReactNode; label: string; title: string }> = {
    move: { icon: <MousePointer2 />, label: "", title: "Déplacer · V" },
    remark: { icon: <MessageCirclePlus />, label: "", title: "Commenter : cliquez sur un élément ou dessinez une zone · C" },
  };

  return (
    <section className={`preview-panel canvas tool-${tool} ${moving ? "is-moving-pin" : ""}`} ref={panelRef} aria-label="Canevas">
      {overlay}
      <div className="artboard-wrap">
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.25}
          maxScale={4}
          limitToBounds={false}
          smooth={false}
          doubleClick={{ disabled: true }}
          wheel={{ step: 0.08, wheelDisabled: true, excluded: ["thread"] }}
          trackPadPanning={{ disabled: false, velocityDisabled: true, excluded: ["thread"] }}
          panning={{ disabled: tool !== "move", excluded: ["thread", "canvas-pin"], velocityDisabled: true }}
          onInit={() => requestAnimationFrame(fitWidth)}
          onTransform={(_, state) => setZoom(Math.round(state.scale * 100))}
        >
          <TransformComponent wrapperClass={`artboard-transform-wrapper ${dragging ? "dragging" : ""}`} contentClass="artboard-transform-content">
            <div
              className="artboard"
              style={{ "--inv-zoom": 100 / Math.max(zoom, 1) } as React.CSSProperties}
              onClickCapture={click}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerLeave={() => setHover(null)}
              onPointerUp={pointerUp}
              onPointerCancel={() => {
                if (pinPress.current?.dragging) setMoving(null);
                pinPress.current = null;
                pointerStart.current = null;
                drawStart.current = null;
                setDrawing(null);
              }}
            >
              <DeliverableContent
                deliverable={deliverable}
                renderPage={(page, content) => (
                  <div className="canvas-page" data-page={page}>
                    {deliverable.type === "PDF" && <span className="canvas-page-label">Page {page}</span>}
                    <div className={`canvas-page-content kind-${pageKind}`}>{content}</div>
                    {hover?.page === page && <TargetHighlight box={hover.box} />}
                    {drawing?.page === page && <TargetHighlight box={drawing.box} drawing />}
                    {composer?.page === page && composer.area && <TargetHighlight box={areaBox(composer.area)} drawing />}
                    {threadOpen && selected?.area && (selected.page ?? 1) === page && <TargetHighlight box={areaBox(selected.area)} drawing />}
                    {comments
                      .map((comment) =>
                        moving?.id === comment.id ? { ...comment, page: moving.page, position: { x: moving.x, y: moving.y } } : comment,
                      )
                      .filter((comment) => (comment.page ?? 1) === page && comment.position)
                      .map((comment) => (
                        <CommentPin
                          key={comment.id}
                          comment={comment}
                          active={threadOpen && comment.id === selectedId}
                          moving={moving?.id === comment.id}
                          onOpen={() => {
                            if (!moved.current && !moving) onPinClick(comment);
                          }}
                          onMove={
                            canMove?.(comment) && !readOnly
                              ? () => setMoving({ id: comment.id, page: comment.page ?? 1, x: comment.position?.x ?? 50, y: comment.position?.y ?? 50 })
                              : undefined
                          }
                        />
                      ))}
                    {threadOpen && !moving && selected && (selected.page ?? 1) === page && renderThread(selected)}
                    {composer?.page === page && renderComposer(composer)}
                  </div>
                )}
              />
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {moving && (
        <p className="canvas-hint" role="status">
          Cliquez pour déposer le commentaire · <kbd>Échap</kbd> pour annuler
        </p>
      )}
      <div className="canvas-toolbar" role="toolbar" aria-label="Outils du canevas">
        <div className="tool-group">
          {tools.map((option) => (
            <Hint key={option} label={toolButtons[option].title} side="top">
              <button
                className={`tool-button ${toolButtons[option].label ? "with-label" : ""} ${tool === option ? "selected" : ""}`}
                aria-pressed={tool === option}
                aria-label={option === "move" ? "Déplacer" : "Commentaire"}
                onClick={() => onToolChange(option)}
                disabled={option !== "move" && readOnly}
              >
                {toolButtons[option].icon} {toolButtons[option].label && <span>{toolButtons[option].label}</span>}
              </button>
            </Hint>
          ))}
        </div>
        <span className="toolbar-divider" aria-hidden="true" />
        <div className="tool-group">
          <Hint label="Réduire le zoom" side="top">
            <button className="tool-button" onClick={() => transformRef.current?.zoomOut(0.2)} disabled={zoom <= 25} aria-label="Réduire le zoom">
              <Minus />
            </button>
          </Hint>
          <Hint label="Ajuster à la largeur" side="top">
            <button className="zoom" onClick={fitWidth}>
              {zoom}%
            </button>
          </Hint>
          <Hint label="Augmenter le zoom" side="top">
            <button className="tool-button" onClick={() => transformRef.current?.zoomIn(0.2)} disabled={zoom >= 400} aria-label="Augmenter le zoom">
              <Plus />
            </button>
          </Hint>
          <Hint label="Plein écran" side="top">
            <button className="tool-button" onClick={toggleFullscreen} aria-label="Plein écran">
              <Maximize />
            </button>
          </Hint>
        </div>
        {toolbarExtra && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />
            <div className="tool-group">{toolbarExtra}</div>
          </>
        )}
      </div>
    </section>
  );
}
