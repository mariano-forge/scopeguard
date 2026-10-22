"use client";

// Two versions of a deliverable side by side, or one over the other behind a curtain (US-053), for the
// agency and the client alike. On top, the versions as a pipeline, the oldest to the newest: two nodes
// chosen, « avant » and « après ». The requests of the « avant » version stay on it, read-only: what was
// asked there is checked against the same place in the « après » one. Images and PDFs (page by page).
//
// The client gets only the versions shared with them (GET /api/review/:token/versions); a gap in their
// numbers is drawn as a node with its number alone, never selectable (decided with the product owner on
// 22 October 2026): their page already tells it from the numbers, and nothing more is sent.

import { useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchProps, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Columns2, SplitSquareHorizontal, X } from "lucide-react";
import { PdfDocument, PdfPage } from "@/components/Pdf";
import type { DeliverableType } from "@/components/deliverableKinds";
import { CommentPin, ThreadPopover, type ThreadComment } from "./CanvasComments";
import "./versionCompare.css";

export type CompareComment = ThreadComment & { page?: number };
export type CompareVersion = {
  version: number;
  name: string;
  type: DeliverableType;
  fileData?: string;
  /** The agency's word on it: « Approuvée », « Remplacée », « Non partagée »… */
  status?: string;
  comments: CompareComment[];
};

/** Images and PDFs only: a video or a site is compared otherwise. */
export const comparable = (version: { type: DeliverableType; fileData?: string }) => (version.type === "Image" || version.type === "PDF") && Boolean(version.fileData);

/**
 * The agency's versions to compare: its images and PDFs, each with its requests and its status, « non
 * partagée » when no client is invited on it.
 */
export function agencyCompareVersions(
  records: { id: number; version: number; name: string; type: DeliverableType; fileData?: string; status?: string }[],
  comments: (CompareComment & { deliverableId?: number })[],
  links: Record<string, { active?: boolean; invites?: unknown[] }>,
): CompareVersion[] {
  return records.filter(comparable).map((record) => {
    const link = links[`${record.id}:${record.version}`];
    const shared = Boolean(link?.active && link.invites?.length);
    return { ...record, status: shared ? record.status : "non partagée", comments: comments.filter((comment) => comment.deliverableId === record.id) };
  });
}

const label = (version: number) => `V${String(version).padStart(2, "0")}`;
const pageWidth = 640;

type Node = { version: number; record?: CompareVersion };

/**
 * The canvas's gestures (ReviewCanvas.tsx), so that comparing feels the same: the wheel and the trackpad
 * move the pages, a pinch or Ctrl + wheel zooms by small steps, nothing glides on after a drag.
 */
const gestures: Omit<ReactZoomPanPinchProps, "children" | "ref"> = {
  centerOnInit: true,
  minScale: 0.25,
  maxScale: 4,
  limitToBounds: false,
  smooth: false,
  doubleClick: { disabled: true },
  // A thread opened on a pin scrolls and is read as on the canvas: the gestures leave it alone.
  wheel: { step: 0.08, wheelDisabled: true, excluded: ["thread"] },
  trackPadPanning: { disabled: false, velocityDisabled: true, excluded: ["thread"] },
  panning: { velocityDisabled: true, excluded: ["thread", "canvas-pin"] },
};

export function VersionCompare({ versions, initialAfter, onClose }: { versions: CompareVersion[]; initialAfter?: number; onClose: () => void }) {
  const ordered = [...versions].sort((left, right) => left.version - right.version);
  const numbers = ordered.map((record) => record.version);
  // Every number from the first to the last: a missing one is a version not shared, its number alone.
  const nodes: Node[] = numbers.length ? Array.from({ length: Math.max(...numbers) - Math.min(...numbers) + 1 }, (_, index) => {
    const version = Math.min(...numbers) + index;
    return { version, record: ordered.find((record) => record.version === version) };
  }) : [];
  const after0 = initialAfter && numbers.includes(initialAfter) ? initialAfter : numbers.at(-1) ?? 0;
  const [after, setAfter] = useState(after0);
  const [before, setBefore] = useState(() => numbers.filter((version) => version < after0).at(-1) ?? numbers[0] ?? 0);
  const [mode, setMode] = useState<"side" | "curtain">("side");
  const [selected, setSelected] = useState<number | null>(null);
  /** Which end the next node chosen sets: « avant » first, then « après », or as the visitor picks. */
  const [picking, setPicking] = useState<"before" | "after">("before");
  const older = ordered.find((record) => record.version === before);
  const newer = ordered.find((record) => record.version === after);
  const indexOf = (version: number) => nodes.findIndex((node) => node.version === version);

  /** A node chosen for the end being picked; the two swap rather than run backwards. Then the other end. */
  function choose(version: number) {
    const [from, to] = picking === "before" ? [version, after] : [before, version];
    if (from === to) return;
    setSelected(null);
    setBefore(Math.min(from, to));
    setAfter(Math.max(from, to));
    setPicking(picking === "before" ? "after" : "before");
  }

  return (
    <div className="version-compare" role="dialog" aria-modal="true" aria-label="Comparer les versions" onKeyDown={(event) => event.key === "Escape" && onClose()}>
      <header className="compare-header">
        <h2>Comparer les versions</h2>
        <div className="compare-picking" role="group" aria-label="Choisir la version">
          <span aria-hidden="true">Choisir :</span>
          <button type="button" className="is-before" aria-pressed={picking === "before"} onClick={() => setPicking("before")}>
            Avant
          </button>
          <button type="button" className="is-after" aria-pressed={picking === "after"} onClick={() => setPicking("after")}>
            Après
          </button>
        </div>
        <ol className="compare-pipeline" aria-label="Versions" style={{ "--from": indexOf(before), "--to": indexOf(after), "--n": nodes.length } as React.CSSProperties}>
          {/* The stretch compared, lit between « avant » and « après », sliding when they change. */}
          <li className="compare-span" aria-hidden="true" />
          {nodes.map((node, index) => {
            const role = node.version === before ? "avant" : node.version === after ? "après" : null;
            return (
              <li key={node.version} style={{ "--i": index } as React.CSSProperties} className={`compare-node ${role ? `is-${role === "avant" ? "before" : "after"}` : ""} ${node.record ? "" : "is-hidden"} ${node.record?.status === "non partagée" ? "is-unshared" : ""}`}>
                {node.record ? (
                  <button type="button" aria-pressed={Boolean(role)} aria-label={`${label(node.version)}${role ? `, ${role}` : ""}${node.record.status ? ` · ${node.record.status}` : ""}`} onClick={() => choose(node.version)}>
                    <span className="compare-dot" aria-hidden="true" />
                    <b>{label(node.version)}</b>
                    <small>{role ?? node.record.status ?? ""}</small>
                  </button>
                ) : (
                  <span aria-label={`${label(node.version)}, non partagée avec vous`} title="Non partagée avec vous">
                    <span className="compare-dot" aria-hidden="true" />
                    <b>{label(node.version)}</b>
                    <small>non partagée</small>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="compare-modes" role="group" aria-label="Affichage">
          <button type="button" aria-pressed={mode === "side"} onClick={() => setMode("side")}>
            <Columns2 aria-hidden="true" /> Côte à côte
          </button>
          <button type="button" aria-pressed={mode === "curtain"} onClick={() => setMode("curtain")}>
            <SplitSquareHorizontal aria-hidden="true" /> Rideau
          </button>
        </div>
        <button type="button" className="compare-close" aria-label="Fermer la comparaison" onClick={onClose}>
          <X />
        </button>
      </header>

      {older && newer ? (
        mode === "side" ? (
          <SideBySide key={`${before}-${after}`} older={older} newer={newer} selected={selected} onPin={setSelected} />
        ) : (
          <Curtain key={`${before}-${after}`} older={older} newer={newer} selected={selected} onPin={setSelected} />
        )
      ) : (
        <p className="compare-empty">Il faut deux versions pour comparer.</p>
      )}

      <footer className="compare-footer">
        <p>
          Les demandes de la {label(before)} restent sur elle : cliquez sur une épingle pour relire son fil, et vérifiez le même endroit dans la {label(after)}.
        </p>
      </footer>
    </div>
  );
}

/** One page of a version: its picture (an image, or a PDF page) and, for the « avant » version, its pins. */
function Page({ version, page, pins, selected, onPin, zoom }: { version: CompareVersion; page: number; pins: boolean; selected: number | null; onPin: (id: number | null) => void; zoom: number }) {
  return (
    <div className="canvas-page compare-page" style={{ "--inv-zoom": 1 / zoom } as React.CSSProperties}>
      {version.type === "Image" ? (
        <img src={version.fileData} alt={`${version.name}, ${label(version.version)}`} draggable={false} />
      ) : (
        <PdfPage pageNumber={page} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
      )}
      {pins &&
        version.comments
          .filter((comment) => comment.position && (comment.page ?? 1) === page)
          .map((comment) => <CommentPin key={comment.id} comment={comment} active={comment.id === selected} onOpen={() => onPin(comment.id === selected ? null : comment.id)} />)}
      {/* The thread of the pin opened, beside it, as on the canvas: read only, nothing is written here. */}
      {pins &&
        version.comments
          .filter((comment) => comment.id === selected && comment.position && (comment.page ?? 1) === page)
          .map((comment) => <ThreadPopover key={comment.id} comment={comment} readOnly locked onReply={() => undefined} onClose={() => onPin(null)} />)}
    </div>
  );
}

/** A version's pages, one under the other (a PDF's once loaded, an image's only one). */
function Pages({ version, pins, selected, onPin, zoom, count, onCount }: { version: CompareVersion; pins: boolean; selected: number | null; onPin: (id: number | null) => void; zoom: number; count: number; onCount: (pages: number) => void }) {
  const pages = Array.from({ length: version.type === "PDF" ? count : 1 }, (_, index) => index + 1);
  const content = (
    <div className="compare-pages">
      {pages.map((page) => (
        <Page key={page} version={version} page={page} pins={pins} selected={selected} onPin={onPin} zoom={zoom} />
      ))}
    </div>
  );
  return version.type === "PDF" ? (
    <PdfDocument file={version.fileData} onLoadSuccess={({ numPages }) => onCount(numPages)} loading="Chargement du PDF…">
      {content}
    </PdfDocument>
  ) : (
    content
  );
}

/** Pages of PDFs that differ in number: said, not hidden. */
function PageCountNote({ older, newer, counts }: { older: CompareVersion; newer: CompareVersion; counts: Record<number, number> }) {
  const [before, after] = [counts[older.version], counts[newer.version]];
  if (older.type !== "PDF" || newer.type !== "PDF" || !before || !after || before === after) return null;
  return (
    <p className="compare-note" role="note">
      La {label(newer.version)} a {after} pages, la {label(older.version)} en avait {before} : les pages sont comparées par leur numéro.
    </p>
  );
}

function SideBySide({ older, newer, selected, onPin }: { older: CompareVersion; newer: CompareVersion; selected: number | null; onPin: (id: number | null) => void }) {
  const left = useRef<ReactZoomPanPinchRef>(null);
  const right = useRef<ReactZoomPanPinchRef>(null);
  const syncing = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [counts, setCounts] = useState<Record<number, number>>({});
  // One zoom for both: what moves on one side moves on the other.
  const follow = (other: React.RefObject<ReactZoomPanPinchRef | null>) => (_: ReactZoomPanPinchRef, state: { scale: number; positionX: number; positionY: number }) => {
    setZoom(state.scale);
    if (syncing.current) return;
    syncing.current = true;
    other.current?.setTransform(state.positionX, state.positionY, state.scale, 0);
    syncing.current = false;
  };
  const pane = (version: CompareVersion, side: "before" | "after", ref: React.RefObject<ReactZoomPanPinchRef | null>, other: React.RefObject<ReactZoomPanPinchRef | null>) => (
    <section className={`compare-pane is-${side}`} aria-label={`${side === "before" ? "Avant" : "Après"} : ${label(version.version)}`}>
      <span className="compare-tag">
        {side === "before" ? "Avant" : "Après"} · {label(version.version)}
      </span>
      <TransformWrapper ref={ref} {...gestures} onTransform={follow(other)}>
        <TransformComponent wrapperClass="compare-viewport" contentClass="compare-content">
          <Pages version={version} pins={side === "before"} selected={selected} onPin={onPin} zoom={zoom} count={counts[version.version] ?? 1} onCount={(pages) => setCounts((current) => ({ ...current, [version.version]: pages }))} />
        </TransformComponent>
      </TransformWrapper>
    </section>
  );
  return (
    <div className="compare-body">
      <PageCountNote older={older} newer={newer} counts={counts} />
      <div className="compare-side">
        {pane(older, "before", left, right)}
        {pane(newer, "after", right, left)}
      </div>
    </div>
  );
}

function Curtain({ older, newer, selected, onPin }: { older: CompareVersion; newer: CompareVersion; selected: number | null; onPin: (id: number | null) => void }) {
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // The handle follows the pointer, in % of the stage, whatever the zoom.
  const move = (event: React.PointerEvent) => {
    const box = stage.current?.getBoundingClientRect();
    if (!dragging.current || !box) return;
    setSplit(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
  };
  const count = (version: CompareVersion) => (pages: number) => setCounts((current) => ({ ...current, [version.version]: pages }));
  return (
    <div className="compare-body">
      <PageCountNote older={older} newer={newer} counts={counts} />
      <div className="compare-curtain-tools">
        <span>Avant · {label(older.version)}</span>
        <input type="range" min={0} max={100} step={1} value={split} aria-label="Position du rideau" aria-valuetext={`${Math.round(split)} % de la ${label(newer.version)}`} onChange={(event) => setSplit(Number(event.target.value))} />
        <span>Après · {label(newer.version)}</span>
      </div>
      <section className="compare-pane is-curtain" aria-label={`Rideau entre la ${label(older.version)} et la ${label(newer.version)}`}>
        <TransformWrapper {...gestures} panning={{ ...gestures.panning, excluded: ["compare-handle", "canvas-pin", "thread"] }} onTransform={(_, state) => setZoom(state.scale)}>
          <TransformComponent wrapperClass="compare-viewport" contentClass="compare-content">
            <div className="compare-stage" ref={stage} onPointerMove={move} onPointerUp={() => (dragging.current = false)} onPointerLeave={() => (dragging.current = false)}>
              <Pages version={older} pins selected={selected} onPin={onPin} zoom={zoom} count={counts[older.version] ?? 1} onCount={count(older)} />
              {/* The newer version over it, shown from the handle to the right. */}
              <div className="compare-over" style={{ clipPath: `inset(0 0 0 ${split}%)` }} aria-hidden="true">
                <Pages version={newer} pins={false} selected={null} onPin={onPin} zoom={zoom} count={counts[newer.version] ?? 1} onCount={count(newer)} />
              </div>
              <span
                className="compare-handle"
                style={{ left: `${split}%`, "--inv-zoom": 1 / zoom } as React.CSSProperties}
                aria-hidden="true"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  dragging.current = true;
                  (event.currentTarget.parentElement as HTMLElement).setPointerCapture(event.pointerId);
                }}
              />
            </div>
          </TransformComponent>
        </TransformWrapper>
      </section>
    </div>
  );
}
