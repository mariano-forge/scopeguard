// What may go wrong with a video once in Kora, told to the agency as it imports it (US-052), never in its
// way: the import goes on whatever the answer. Read in the browser, from the file still on the agency's
// disk, without reading it whole: its header, one picture, and the index of its key pictures.
//
// - « unplayable »: this browser decodes no picture of it (a ProRes, an HEVC elsewhere than Safari…):
//   the client may not be able to watch it.
// - « sparse »: its key pictures are too far apart (screen recorders write one, at the start). A jump to a
//   comment's moment then shows smeared blocks until the next one, in any browser.

export type VideoWarning = "unplayable" | "sparse";

/** Farther apart than this, key pictures make a jump smear (x264 puts them up to 10 s apart, fine). */
const sparseGapSeconds = 10;
/** An index larger than this is not read: the check gives up rather than load a film into memory. */
const maxIndexBytes = 64 * 1024 * 1024;

export const videoWarningText: Record<VideoWarning, string> = {
  unplayable: "Votre client risque de ne pas pouvoir regarder cette vidéo. Pour qu’elle se lise partout, exportez-la en MP4 depuis votre logiciel de montage.",
  sparse: "Le rendu de cette vidéo risque d’être dégradé par moments. Pour une meilleure qualité, exportez-la en MP4 (H.264) avec une image clé toutes les 2 secondes.",
};

/** What to tell the agency of this video, or null: nothing to say, or nothing could be learnt. */
export async function videoWarning(file: File): Promise<VideoWarning | null> {
  const playable = await decodesAPicture(file);
  if (playable === false) return "unplayable";
  const gap = await keyPictureGap(file).catch(() => null);
  return gap !== null && gap > sparseGapSeconds ? "sparse" : null;
}

/** The video's length in seconds, from its header only; null when this browser cannot tell. */
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (seconds: number | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** Whether this browser shows the first picture of the file; null when it could not tell in time. */
function decodesAPicture(file: File): Promise<boolean | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (answer: boolean | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(answer);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.muted = true;
    video.preload = "auto";
    video.onloadeddata = () => done(video.videoWidth > 0);
    video.onerror = () => done(false);
    video.src = url;
  });
}

const read = async (file: File, start: number, end: number) => new Uint8Array(await file.slice(start, Math.min(end, file.size)).arrayBuffer());

/** The longest stretch without a key picture, in seconds (to the end included); null when unknown. */
export async function keyPictureGap(file: File) {
  const head = await read(file, 0, 12);
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return matroskaGap(file);
  if (String.fromCharCode(...head.subarray(4, 8)) === "ftyp") return mp4Gap(file);
  return null;
}

const longestGap = (times: number[], duration: number) =>
  [...times, duration].sort((left, right) => left - right).reduce((longest, time, index, all) => Math.max(longest, index ? time - all[index - 1] : time), 0);

// ——— MP4 / MOV: the sync samples (stss) of the video track, timed by its sample durations (stts) ———

type Box = { type: string; start: number; end: number };

/** The boxes in data[start, end): their type and body. */
function boxes(data: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const found: Box[] = [];
  for (let offset = start; offset + 8 <= end; ) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) break;
    found.push({ type: String.fromCharCode(...data.subarray(offset + 4, offset + 8)), start: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

const child = (data: Uint8Array, box: Box | undefined, type: string) => (box ? boxes(data, box.start, box.end).find((inner) => inner.type === type) : undefined);

async function mp4Gap(file: File) {
  // The index (moov) is a top-level box, at the start or at the end: found box by box, by their headers.
  let moov: Uint8Array | null = null;
  for (let offset = 0; offset + 8 <= file.size; ) {
    const header = await read(file, offset, offset + 16);
    const view = new DataView(header.buffer);
    let size = view.getUint32(0);
    const type = String.fromCharCode(...header.subarray(4, 8));
    const headerSize = size === 1 ? 16 : 8;
    if (size === 1) size = Number(view.getBigUint64(8));
    else if (size === 0) size = file.size - offset;
    if (size < headerSize) return null;
    if (type === "moov") {
      if (size > maxIndexBytes) return null;
      moov = await read(file, offset, offset + size);
      break;
    }
    offset += size;
  }
  if (!moov) return null;
  const view = new DataView(moov.buffer);
  const root: Box = { type: "moov", start: 8, end: moov.length };
  for (const track of boxes(moov, root.start, root.end).filter((box) => box.type === "trak")) {
    const media = child(moov, track, "mdia");
    const handler = child(moov, media, "hdlr");
    if (!handler || String.fromCharCode(...moov.subarray(handler.start + 8, handler.start + 12)) !== "vide") continue;
    const header = child(moov, media, "mdhd");
    const table = child(moov, child(moov, media, "minf"), "stbl");
    if (!header || !table) return null;
    const version = moov[header.start];
    const timescale = view.getUint32(header.start + (version === 1 ? 20 : 12));
    const duration = version === 1 ? Number(view.getBigUint64(header.start + 24)) : view.getUint32(header.start + 16);
    const sync = child(moov, table, "stss");
    // No sync table: every picture is a key picture.
    if (!sync) return 0;
    const timing = child(moov, table, "stts");
    if (!timing || !timescale) return null;
    const keys = Array.from({ length: view.getUint32(sync.start + 4) }, (_, index) => view.getUint32(sync.start + 8 + index * 4));
    // Sample n starts at the sum of the durations before it.
    const times: number[] = [];
    let sample = 1;
    let time = 0;
    let next = 0;
    for (let entry = 0; entry < view.getUint32(timing.start + 4) && next < keys.length; entry++) {
      const count = view.getUint32(timing.start + 8 + entry * 8);
      const delta = view.getUint32(timing.start + 12 + entry * 8);
      while (next < keys.length && keys[next] < sample + count) {
        times.push((time + (keys[next] - sample) * delta) / timescale);
        next++;
      }
      sample += count;
      time += count * delta;
    }
    return longestGap(times, duration / timescale);
  }
  return null;
}

// ——— WebM / Matroska: the cue points (CueTime) the index lists, one per key picture it knows ———

const ids = { segment: 0x18538067, seekHead: 0x114d9b74, seek: 0x4dbb, seekId: 0x53ab, seekPosition: 0x53ac, info: 0x1549a966, scale: 0x2ad7b1, duration: 0x4489, cues: 0x1c53bb6b, cuePoint: 0xbb, cueTime: 0xb3 };

/** An EBML number at data[offset]: its value (the length marker kept for ids) and its length; null past the data. */
function ebml(data: Uint8Array, offset: number, keepMarker: boolean) {
  const first = data[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  for (let mask = 0x80; !(first & mask); mask >>= 1) length++;
  if (offset + length > data.length) return null;
  let value = keepMarker ? first : first & ((0x80 >> (length - 1)) - 1);
  for (let index = 1; index < length; index++) value = value * 256 + data[offset + index];
  const unknown = !keepMarker && value === 2 ** (7 * length) - 1;
  return { value, length, unknown };
}

type Element = { id: number; start: number; end: number };

/** The elements in data[start, end): their id and body (an unknown size runs to the end). */
function elements(data: Uint8Array, start: number, end: number): Element[] {
  const found: Element[] = [];
  for (let offset = start; offset < end; ) {
    const id = ebml(data, offset, true);
    const size = id && ebml(data, offset + id.length, false);
    if (!id || !size) break;
    const body = offset + id.length + size.length;
    const close = size.unknown ? end : Math.min(end, body + size.value);
    found.push({ id: id.value, start: body, end: close });
    offset = close;
  }
  return found;
}

const unsigned = (data: Uint8Array, element: Element) => data.subarray(element.start, element.end).reduce((value, byte) => value * 256 + byte, 0);

async function matroskaGap(file: File) {
  const head = await read(file, 0, 256 * 1024);
  const top = elements(head, 0, head.length);
  const segment = top.find((element) => element.id === ids.segment);
  if (!segment) return null;
  const inSegment = elements(head, segment.start, head.length);
  // Where the index is, as the segment's own table of contents says (positions from the segment's body).
  let cuesAt: number | null = null;
  for (const seek of elements(head, inSegment.find((element) => element.id === ids.seekHead)?.start ?? 0, inSegment.find((element) => element.id === ids.seekHead)?.end ?? 0)) {
    if (seek.id !== ids.seek) continue;
    const parts = elements(head, seek.start, seek.end);
    const id = parts.find((part) => part.id === ids.seekId);
    const position = parts.find((part) => part.id === ids.seekPosition);
    if (id && position && unsigned(head, id) === ids.cues) cuesAt = segment.start + unsigned(head, position);
  }
  const info = inSegment.find((element) => element.id === ids.info);
  if (!info) return null;
  const infoParts = elements(head, info.start, info.end);
  const scaleElement = infoParts.find((part) => part.id === ids.scale);
  const scale = scaleElement ? unsigned(head, scaleElement) : 1_000_000;
  const durationElement = infoParts.find((part) => part.id === ids.duration);
  if (!durationElement) return null;
  const durationView = new DataView(head.buffer, durationElement.start, durationElement.end - durationElement.start);
  const duration = ((durationElement.end - durationElement.start === 4 ? durationView.getFloat32(0) : durationView.getFloat64(0)) * scale) / 1e9;
  // No index at all: a browser can only guess where a moment is.
  if (cuesAt === null) return Number.POSITIVE_INFINITY;
  const cuesHead = await read(file, cuesAt, cuesAt + 16);
  const id = ebml(cuesHead, 0, true);
  const size = id && ebml(cuesHead, id.length, false);
  if (!id || !size || id.value !== ids.cues || size.unknown || size.value > maxIndexBytes) return null;
  const cues = await read(file, cuesAt + id.length + size.length, cuesAt + id.length + size.length + size.value);
  const times = elements(cues, 0, cues.length)
    .filter((point) => point.id === ids.cuePoint)
    .flatMap((point) => elements(cues, point.start, point.end).filter((part) => part.id === ids.cueTime))
    .map((time) => (unsigned(cues, time) * scale) / 1e9);
  return times.length ? longestGap(times, duration) : Number.POSITIVE_INFINITY;
}
