"use client";

// The bar of a video on the review canvas (US-052), agency and client alike: play, pause, the time, and the
// timeline with a mark for each comment at its moment, in its pin's colour. A mark opens its comment, which
// brings the video to that moment (ReviewCanvas). Outside the zoomed pages: a click on it pins nothing.

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Hint } from "@/components/hint";
import { formatTimecode } from "@/lib/timecode";
import type { RequestKind } from "./CanvasComments";
import "./videoBar.css";

export type VideoMark = { id: number; timecode: number; kind: RequestKind; agency: boolean; label: string };

/** What the bar asks of the canvas's video, which the canvas owns. */
export type VideoControls = { toggle: () => void; seek: (seconds: number) => void; toggleSound: () => void };

export function VideoBar({
  controls,
  time,
  duration,
  paused,
  muted,
  marks,
  selectedId,
  onOpen,
}: {
  controls: VideoControls;
  time: number;
  duration: number;
  paused: boolean;
  muted: boolean;
  marks: VideoMark[];
  selectedId: number | null;
  onOpen: (id: number) => void;
}) {
  const known = Number.isFinite(duration) && duration > 0;
  const at = (seconds: number) => `${known ? Math.min(100, (seconds / duration) * 100) : 0}%`;

  const { toggle, seek, toggleSound } = controls;

  return (
    <div className="video-bar" role="group" aria-label="Lecture de la vidéo">
      <Hint label={paused ? "Lire" : "Mettre en pause"} side="top">
        <button type="button" className="video-bar-button" aria-label={paused ? "Lire" : "Mettre en pause"} onClick={toggle}>
          {paused ? <Play /> : <Pause />}
        </button>
      </Hint>
      <span className="video-bar-time" aria-hidden="true">
        {formatTimecode(time)} / {known ? formatTimecode(duration) : "–:––"}
      </span>
      <div className="video-bar-track">
        <span className="video-bar-progress" style={{ width: at(time) }} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={known ? duration : 0}
          step={0.1}
          value={Math.min(time, known ? duration : 0)}
          disabled={!known}
          aria-label="Position dans la vidéo"
          aria-valuetext={formatTimecode(time)}
          onChange={(event) => seek(Number(event.target.value))}
        />
        {known && (
          <ol className="video-bar-marks" aria-label="Commentaires dans la vidéo">
            {marks.map((mark) => (
              <li key={mark.id} style={{ left: at(mark.timecode) }}>
                <Hint label={`${mark.label} #${mark.id} · ${formatTimecode(mark.timecode)}`} side="top">
                  <button
                    type="button"
                    className={`video-mark is-${mark.kind} ${mark.agency ? "is-agency" : ""} ${mark.id === selectedId ? "is-active" : ""}`}
                    aria-label={`${mark.label} #${mark.id} à ${formatTimecode(mark.timecode)}`}
                    aria-current={mark.id === selectedId ? "true" : undefined}
                    onClick={() => onOpen(mark.id)}
                  />
                </Hint>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Hint label={muted ? "Rétablir le son" : "Couper le son"} side="top">
        <button type="button" className="video-bar-button" aria-label={muted ? "Rétablir le son" : "Couper le son"} onClick={toggleSound}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </Hint>
    </div>
  );
}
