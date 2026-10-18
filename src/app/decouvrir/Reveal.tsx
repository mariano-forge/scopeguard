"use client";

import { useEffect, useRef } from "react";

/**
 * The landing page's root: every `.reveal` inside it shows as it scrolls into view (CSS does the
 * motion, see landing.css). What is already on screen shows at once, so nothing flashes; without
 * JavaScript the page is simply visible. Classes are set on the DOM, nothing re-renders.
 */
export function RevealRoot({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const items = [...node.querySelectorAll<HTMLElement>(".reveal")];
    const limit = window.innerHeight * 0.92;
    for (const item of items) if (item.getBoundingClientRect().top < limit) item.classList.add("is-in");
    node.classList.add("has-js");
    const pending = items.filter((item) => !item.classList.contains("is-in"));
    if (!("IntersectionObserver" in window)) {
      for (const item of pending) item.classList.add("is-in");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const item of pending) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} className="landing">
      {children}
    </div>
  );
}
