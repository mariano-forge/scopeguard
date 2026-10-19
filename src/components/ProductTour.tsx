"use client";

// A guided tour: one feature at a time, pointed at on the page and said in a few words, with « Passer »
// (the whole tour) or « Continuer ». Seen once per browser (`storageKey`); a step whose element is not
// on the page is left out. A shadcn popover anchored to the element, which is ringed while it is shown.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

export function ProductTour({ steps, storageKey, label }: { steps: TourStep[]; storageKey: string; label: string }) {
  // Seen while rendered on the server: the tour appears once the browser has said it was not.
  const done = useSyncExternalStore(subscribe, () => seen(storageKey), () => true);
  const [index, setIndex] = useState(0);
  // The element of the current step, found once the page has laid it out.
  const [target, setTarget] = useState<Element | null>(null);
  const anchor = useRef<Element | null>(null);
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
    });
    return () => {
      cancelAnimationFrame(frame);
      anchor.current?.removeAttribute("data-tour-target");
    };
  }, [done, step]);

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
  );
}
