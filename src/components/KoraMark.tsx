import type { SVGProps } from "react";

/** Kora symbol (ring + dot), vector redraw of the brand logo. Inherits the text color. */
export function KoraMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="-300 -300 600 600" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M-228.4 -194.4A300 300 0 0 1 228.4 -194.4L167.8 -145.3A222 222 0 0 0 -167.8 -145.3Z" />
      <path d="M-98.2 272.9A290 290 0 0 1 -283.7 -60.3L-209.1 -35A212 212 0 0 0 -79.4 196.6Z" />
      <path d="M283.7 -60.3A290 290 0 0 1 98.2 272.9L79.4 196.6A212 212 0 0 0 209.1 -35Z" />
      <circle r="100" />
    </svg>
  );
}
