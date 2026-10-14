"use client";

import { useRef, useState, type RefObject } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Maximize, MessageCirclePlus, Minus, MousePointer2, Plus } from "lucide-react";
import { DeliverableContent } from "@/components/DeliverableContent";
import type { DeliverableType } from "@/components/deliverableKinds";
import { CommentPin, TargetHighlight, describeTarget, type Area, type TargetBox, type ThreadComment } from "./CanvasComments";

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
  const selected = comments.find((comment) => comment.id === selectedId);
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
    const page = (event.target as Element).closest<HTMLElement>("[data-page]");
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
    pointerStart.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    setDragging(false);
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
    move: { icon: <MousePointer2 />, label: "", title: "Déplacer (V)" },
    remark: { icon: <MessageCirclePlus />, label: "", title: "Commenter : cliquez sur un élément ou dessinez une zone (C)" },
  };

  return (
    <section className={`preview-panel canvas tool-${tool}`} ref={panelRef} aria-label="Canevas">
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
                      .filter((comment) => (comment.page ?? 1) === page && comment.position)
                      .map((comment) => (
                        <CommentPin
                          key={comment.id}
                          comment={comment}
                          active={threadOpen && comment.id === selectedId}
                          onOpen={() => {
                            if (!moved.current) onPinClick(comment);
                          }}
                        />
                      ))}
                    {threadOpen && selected && (selected.page ?? 1) === page && renderThread(selected)}
                    {composer?.page === page && renderComposer(composer)}
                  </div>
                )}
              />
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      <div className="canvas-toolbar" role="toolbar" aria-label="Outils du canevas">
        <div className="tool-group">
          {tools.map((option) => (
            <button
              key={option}
              className={`tool-button ${toolButtons[option].label ? "with-label" : ""} ${tool === option ? "selected" : ""}`}
              aria-pressed={tool === option}
              aria-label={option === "move" ? "Déplacer" : "Commentaire"}
              onClick={() => onToolChange(option)}
              disabled={option !== "move" && readOnly}
              title={toolButtons[option].title}
            >
              {toolButtons[option].icon} {toolButtons[option].label && <span>{toolButtons[option].label}</span>}
            </button>
          ))}
        </div>
        <span className="toolbar-divider" aria-hidden="true" />
        <div className="tool-group">
          <button className="tool-button" onClick={() => transformRef.current?.zoomOut(0.2)} disabled={zoom <= 25} title="Réduire le zoom" aria-label="Réduire le zoom">
            <Minus />
          </button>
          <button className="zoom" onClick={fitWidth} title="Ajuster à la largeur">
            {zoom}%
          </button>
          <button className="tool-button" onClick={() => transformRef.current?.zoomIn(0.2)} disabled={zoom >= 400} title="Augmenter le zoom" aria-label="Augmenter le zoom">
            <Plus />
          </button>
          <button className="tool-button" onClick={toggleFullscreen} title="Plein écran" aria-label="Plein écran">
            <Maximize />
          </button>
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
