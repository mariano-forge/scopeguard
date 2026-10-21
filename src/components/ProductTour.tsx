"use client";

// A guided tour: one feature at a time, pointed at on the page and said in a few words, with « Passer »
// (the whole tour) or « Continuer ». Seen once per browser (`storageKey`); a step whose element is not
// on the page is left out. A shadcn popover anchored to the element; the rest of the page is darkened
// around it (a spotlight), so the eye goes straight to what the step is about.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

export type TourStep = {
  /** CSS selector of the element pointed at. */
  target: string;
  title: string;
  text: string;
  side?: "top" | "right" | "bottom" | "left";
};

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
function seen(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // No storage (private window): the tour is not imposed on every page.
    return true;
  }
}

/** The page's whole surface, minus the element's box (6 px around it). */
const veilAround = (box: DOMRect) => {
  const [left, top, right, bottom] = [box.left - 6, box.top - 6, box.right + 6, box.bottom + 6];
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;
};

export function ProductTour({ steps, storageKey, label }: { steps: TourStep[]; storageKey: string; label: string }) {
  // Seen while rendered on the server: the tour appears once the browser has said it was not.
  const done = useSyncExternalStore(subscribe, () => seen(storageKey), () => true);
  const [index, setIndex] = useState(0);
  // The element of the current step, found once the page has laid it out.
  const [target, setTarget] = useState<Element | null>(null);
  const anchor = useRef<Element | null>(null);
  // Where the element is on the screen: the spotlight's hole.
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = steps[index];

  useEffect(() => {
    if (done || !step) return;
    const frame = requestAnimationFrame(() => {
      const element = document.querySelector(step.target);
      // Not on this page (a read-only version, a narrow screen): the next step.
      if (!element) return setIndex((current) => current + 1);
      anchor.current = element;
      element.setAttribute("data-tour-target", "");
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      setTarget(element);
      setBox(element.getBoundingClientRect());
    });
    return () => {
      cancelAnimationFrame(frame);
      anchor.current?.removeAttribute("data-tour-target");
    };
  }, [done, step]);

  // The spotlight follows the element when the page scrolls or the window changes size.
  useEffect(() => {
    if (!target) return;
    const follow = () => setBox(target.getBoundingClientRect());
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [target]);

  function end() {
    anchor.current?.removeAttribute("data-tour-target");
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Not remembered: it ends for this visit.
    }
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
  }
  const last = index === steps.length - 1;

  if (done || !step || !target) return null;
  return (
    <>
    {/* On the page itself: inside the editor, a container would hold it (and dim it) in its own layer. */}
    {box &&
      createPortal(
        <>
          {/* The veil over the whole page, a hole cut where the element is (even-odd fill). */}
          <div className="product-tour-veil" aria-hidden="true" style={{ clipPath: veilAround(box) }} />
          <div
            className="product-tour-spotlight"
            aria-hidden="true"
            style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
          />
        </>,
        document.body,
      )}
    <Popover open>
      <PopoverAnchor virtualRef={anchor as React.RefObject<Element>} />
      <PopoverContent
        key={index}
        side={step.side ?? "bottom"}
        sideOffset={12}
        collisionPadding={16}
        className="product-tour"
        role="dialog"
        aria-label={`${label} : ${step.title}`}
        // The page stays usable around it; Escape ends the tour.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={end}
      >
        <p className="product-tour-count">
          {index + 1} sur {steps.length}
        </p>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <div className="product-tour-actions">
          <Button variant="ghost" size="sm" onClick={end}>
            Passer
          </Button>
          <Button size="sm" autoFocus onClick={() => (last ? end() : (setTarget(null), setIndex(index + 1)))}>
            {last ? "Terminer" : "Continuer"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
