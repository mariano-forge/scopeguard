// How fine a zoomed-in PDF page of the canvas is drawn (src/components/SharpPdfPage.tsx): by steps, within a
// budget of pixels per page, so that zooming in never fills the browser's memory.

const steps = [1.5, 2, 3, 4];
/** At most this many pixels for a page's finer copy: 4 bytes each, about 40 MB. */
export const pixelBudget = 10_000_000;

/**
 * The resolution of the finer copy for a page of `width` × `height` CSS pixels at `zoom` (1 = 100 %) on a screen
 * of `density`, or null when the page as drawn is fine enough: the step at least as large as the zoom, times the
 * density, within the budget.
 */
export function sharpRatio(zoom: number, width: number, height: number, density: number) {
  if (zoom <= 1.15) return null;
  const step = steps.find((candidate) => candidate >= zoom) ?? steps[steps.length - 1];
  const ratio = Math.min(density * step, Math.sqrt(pixelBudget / Math.max(1, width * height)));
  return ratio > density * 1.1 ? ratio : null;
}
