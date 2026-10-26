"use client";
import dynamic from "next/dynamic";

// Never inside a frame: on a staging site, Kora's panels are frames as small as a bubble, which its bar would
// cover (public/kora-toolbar.js). Loaded in the browser only, where the window is known.
const Agentation = dynamic(
  () =>
    import("agentation").then(({ Agentation }) => {
      function TopWindowAgentation(props: { endpoint: string }) {
        return window.self === window.top ? <Agentation {...props} /> : null;
      }
      return TopWindowAgentation;
    }),
  { ssr: false },
);

export function AgentationProvider() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation endpoint="http://localhost:4747" />;
}
