// The moment of a video a comment is pinned on (US-052), in seconds. Shared by the canvas, which pins
// and seeks, the panels and documents, which show it, and the action routes, which check it.

/** Longest video a timecode may point into: a day, far beyond any deliverable. */
const maxSeconds = 24 * 60 * 60;

/** A timecode as a comment may hold it: seconds, ≥ 0, to the tenth; undefined for anything else. */
export function readTimecode(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maxSeconds ? Math.round(value * 10) / 10 : undefined;
}

/** "0:07", "1:23", "1:02:03": as video players write it, to the second. */
export function formatTimecode(seconds: number) {
  const total = Math.floor(Math.max(0, seconds));
  const [hours, minutes, rest] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const two = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

/** Where a comment on a video is, as its location reads (thread, exports, proof, mails). */
export const videoLocation = (seconds: number, area?: boolean) => `Vidéo · ${formatTimecode(seconds)}${area ? " · Zone sélectionnée" : ""}`;

/** How close to its moment a pin shows on the picture, in seconds: long enough to be seen while playing. */
export const pinWindowSeconds = 1.5;
