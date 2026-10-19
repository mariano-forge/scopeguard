// Kora toolbar for an agency's staging site (US-048). The agency puts on its site:
//
//   <script src="https://<kora>/kora-toolbar.js" data-site="<the deliverable's key>" defer></script>
//
// and sends its client the site's address with ?kora. The toolbar then shows on that device: a button
// opens Kora's panel (/review/<token>/site, in a frame on Kora's origin), where the client verifies their
// address by code and writes. As on Kora's canvas, the bar has two tools: « Naviguer » (V, the site works
// as usual) and « Commenter » (C, every click on an element opens a request, until « Naviguer » or Escape).
//
// This script runs in the agency's page, next to its other scripts: it never receives what the
// client writes, only where to draw the pins. Every message is checked (origin and window).
// Colours copy src/theme/tokens.css, and pins copy Kora's (globals.css .canvas-pin): this page cannot
// read Kora's styles. A change of Kora's pins is made here too.
(() => {
  const script = document.currentScript;
  if (!script || window.__koraToolbar) return;
  window.__koraToolbar = true;
  // data-site: the deliverable's fixed key, which opens its latest shared version (src/lib/siteKey.ts);
  // data-review: a version's link token, as the first script lines had.
  const siteKey = script.dataset.site;
  const token = script.dataset.review;
  const kora = new URL(script.src).origin;
  if (!siteKey && !token) return;

  // Shown only on a device the client opened with ?kora (the agency's link), remembered afterwards.
  const flag = "kora-toolbar";
  const remembered = () => {
    try {
      return localStorage.getItem(flag) === "on";
    } catch {
      return false;
    }
  };
  if (new URLSearchParams(location.search).has("kora"))
    try {
      localStorage.setItem(flag, "on");
    } catch {
      // Storage refused (private mode): the toolbar shows for this visit only.
    }
  else if (!remembered()) return;

  const colors = {
    action: "#30a8ff",
    ink: "#111111",
    paper: "#ffffff",
    border: "#ddd9d1",
    focus: "#0079d1",
    attention: "#ff795c",
    resolvedText: "#0a5933",
    scopeText: "#4e31a6",
  };
  const host = document.createElement("div");
  host.setAttribute("data-kora-toolbar", "");
  host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      button { font: 600 13px/1 system-ui, sans-serif; cursor: pointer; }
      /* The floating bar: comment an element, open the panel (as Vercel's toolbar). */
      /* Placed by layout(): where the visitor dropped it (bottom right by default), never under the panel. */
      .bar { position: fixed; right: 16px; bottom: 16px; touch-action: none; display: flex; align-items: center; padding: 4px; gap: 2px; border-radius: 999px;
        border: 1px solid ${colors.border}; background: ${colors.ink}; box-shadow: 0 4px 16px rgb(0 0 0 / .2); }
      /* Folded, the bar is the « Kora » pill alone; Kora open, it unfolds with the tools. */
      .tools { display: flex; align-items: center; gap: 2px; max-width: 0; overflow: hidden; opacity: 0; visibility: hidden;
        transition: max-width .2s ease-out, opacity .2s ease-out, visibility .2s; }
      .bar.expanded .tools { max-width: 120px; opacity: 1; visibility: visible; }
      .bar button { display: grid; place-items: center; height: 34px; min-width: 34px; padding: 0 12px; border: 0; border-radius: 999px;
        background: transparent; color: ${colors.paper}; }
      .bar button:hover, .bar button[aria-pressed="true"] { background: rgb(255 255 255 / .16); }
      .bar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .bar .sep { width: 1px; height: 20px; background: rgb(255 255 255 / .25); }
      .hint { position: fixed; right: 16px; bottom: 64px; display: none; padding: 8px 12px; border-radius: 8px; background: ${colors.ink};
        color: ${colors.paper}; font: 500 13px/1.3 system-ui, sans-serif; box-shadow: 0 4px 16px rgb(0 0 0 / .2); }
      .hint.on { display: block; }
      .panel { position: fixed; top: 0; right: 0; width: min(380px, 100vw); height: 100vh; display: none; background: ${colors.paper};
        border-left: 1px solid ${colors.border}; box-shadow: -8px 0 24px rgb(0 0 0 / .12); }
      .panel.open { display: block; }
      .panel iframe { width: 100%; height: 100%; border: 0; }
      /* Outside the panel, on its left edge: Kora's panel keeps its whole header. */
      .close { position: absolute; top: 12px; left: -40px; width: 32px; height: 32px; border-radius: 999px; border: 1px solid ${colors.border};
        background: ${colors.paper}; color: ${colors.ink}; box-shadow: 0 2px 8px rgb(0 0 0 / .15); }
      .highlight { position: fixed; pointer-events: none; outline: 2px solid ${colors.action}; background: rgb(48 168 255 / .12); display: none; }
      /* Kora's pins (globals.css .canvas-pin): a tag pointing at its spot, by status, in a solid color with a
         white ring and a fine dark outline, readable on any page. The agency in blue, the client in coral. */
      .pin { position: absolute; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 2px solid ${colors.paper};
        border-radius: 8px 8px 8px 0; box-shadow: 0 0 0 1px rgb(17 17 17 / .32), 0 3px 10px rgb(17 17 17 / .28); font: 700 11px/1 system-ui, sans-serif;
        transform: translateY(-100%); transform-origin: bottom left; transition: transform .12s ease-out; background: ${colors.attention}; color: ${colors.ink}; }
      .pin:hover { transform: translateY(-100%) scale(1.1); }
      .pin.is-comment.is-agency { background: ${colors.focus}; color: ${colors.paper}; }
      .pin.is-correction { background: ${colors.resolvedText}; color: ${colors.paper}; }
      .pin.is-outside { background: ${colors.scopeText}; color: ${colors.paper}; }
      .pin svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .pin.flash { outline: 2px solid ${colors.focus}; outline-offset: 1px; }
      button:focus-visible { outline: 3px solid ${colors.focus}; outline-offset: 2px; }
    </style>
    <div class="pins"></div>
    <div class="highlight"></div>
    <p class="hint" role="status">Cliquez sur un élément de la page · V ou Échap pour naviguer</p>
    <div class="bar" role="toolbar" aria-label="Outils Kora">
      <span class="tools">
        <button class="tool" data-tool="move" type="button" aria-label="Naviguer" title="Naviguer · V" aria-pressed="true"></button>
        <button class="tool" data-tool="remark" type="button" aria-label="Commenter" title="Commenter : cliquez sur un élément · C" aria-pressed="false"></button>
        <span class="sep" aria-hidden="true"></span>
      </span>
      <button class="launcher" type="button" aria-label="Ouvrir Kora" aria-expanded="false" title="Glisser pour déplacer">Kora</button>
    </div>
    <div class="panel" role="dialog" aria-label="Kora">
      <iframe title="Kora"></iframe>
      <button class="close" type="button" aria-label="Fermer Kora">×</button>
    </div>`;
  const panel = root.querySelector(".panel");
  const frame = root.querySelector("iframe");
  const highlight = root.querySelector(".highlight");
  const pinsLayer = root.querySelector(".pins");
  frame.src = siteKey
    ? `${kora}/review/site/${encodeURIComponent(siteKey)}?parent=${encodeURIComponent(location.origin)}`
    : `${kora}/review/${encodeURIComponent(token)}/site?parent=${encodeURIComponent(location.origin)}`;

  const tell = (message) => frame.contentWindow && frame.contentWindow.postMessage(message, kora);
  /** The page, as requests are filed under: path and query, without the toolbar's own ?kora. */
  const pageUrl = () => {
    const url = new URL(location.href);
    url.searchParams.delete("kora");
    return url.pathname + url.search;
  };
  const bar = root.querySelector(".bar");
  const launcher = root.querySelector(".launcher");
  /** Kora open: the panel, and the bar unfolded with its tools; closed: the « Kora » pill alone, browsing. */
  const open = (on) => {
    panel.classList.toggle("open", on);
    bar.classList.toggle("expanded", on);
    layout();
    launcher.setAttribute("aria-expanded", String(on));
    launcher.setAttribute("aria-label", on ? "Réduire Kora" : "Ouvrir Kora");
    if (!on) setTool("move");
  };
  launcher.addEventListener("click", () => open(!panel.classList.contains("open")));
  const hint = root.querySelector(".hint");
  // Kora's canvas tools (src/app/(agency)/editor/ReviewCanvas.tsx): Lucide's MousePointer2 and MessageCirclePlus.
  const toolIcons = {
    move: [["path", { d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" }]],
    remark: [["path", { d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" }], ["path", { d: "M8 12h8" }], ["path", { d: "M12 8v8" }]],
  };
  const toolButtons = [...root.querySelectorAll(".tool")];
  for (const button of toolButtons) {
    button.append(svgOf(toolIcons[button.dataset.tool]));
    button.addEventListener("click", () => setTool(button.dataset.tool));
  }
  root.querySelector(".close").addEventListener("click", () => open(false));

  // ——— Picking an element ———

  /** The tool in use, as on Kora's canvas: "move" (the site works as usual) or "remark" (each click comments). */
  let tool = "move";
  let savedCursor = "";
  const own = (target) => target === host || host.contains(target);
  function selectorOf(element) {
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const tag = node.tagName.toLowerCase();
      if (tag === "body" || !node.parentElement) {
        parts.unshift(tag);
        break;
      }
      const same = Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    }
    return parts.join(" > ");
  }
  const labelOf = (element) => {
    const text = (element.innerText || element.getAttribute("alt") || element.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
    return `${element.tagName.toLowerCase()}${text ? ` « ${text.slice(0, 60)}${text.length > 60 ? "…" : ""} »` : ""}`;
  };
  const clamp = (value) => Math.min(100, Math.max(0, Math.round(value * 100) / 100));

  function onMove(event) {
    if (own(event.target)) return (highlight.style.display = "none");
    const box = event.target.getBoundingClientRect();
    Object.assign(highlight.style, { display: "block", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  }
  function onPick(event) {
    if (own(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.target;
    const box = element.getBoundingClientRect();
    const anchor = {
      url: pageUrl(),
      selector: selectorOf(element),
      x: clamp(((event.clientX - box.left) / (box.width || 1)) * 100),
      y: clamp(((event.clientY - box.top) / (box.height || 1)) * 100),
      viewport: Math.round(window.innerWidth),
    };
    // The tool stays: the next click comments again, as on Kora's canvas. The frame of the hovered
    // element is not part of the capture.
    highlight.style.display = "none";
    // Where the click falls on the capture of the window, which follows once made.
    const pick = ++picks;
    anchor.view = { x: clamp((event.clientX / window.innerWidth) * 100), y: clamp((event.clientY / window.innerHeight) * 100) };
    tell({ type: "kora:pick", pick, anchor, label: labelOf(element) });
    // What the visitor pointed at, drawn on the capture: the element's frame and the click.
    captureWindow({ left: box.left, top: box.top, width: box.width, height: box.height, x: event.clientX, y: event.clientY }).then(
      (blob) => tell({ type: "kora:capture", pick, blob }),
      () => tell({ type: "kora:capture", pick, blob: null }),
    );
  }

  // ——— Capture of the window ———

  let picks = 0;
  let library = null;
  /**
   * modern-screenshot, loaded from Kora at the first capture only, as a classic script like this one
   * (a module from another origin would need a CORS preflight that static files do not answer). Its
   * build sets window.modernScreenshot; a page with its own module loader (AMD) keeps it: no capture.
   */
  function loadLibrary() {
    if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
    library =
      library ||
      new Promise((resolve, reject) => {
        const tag = document.createElement("script");
        tag.src = `${kora}/vendor/modern-screenshot-4.7.0.js`;
        tag.onload = () => (window.modernScreenshot ? resolve(window.modernScreenshot) : reject(new Error("modern-screenshot")));
        tag.onerror = () => {
          library = null;
          reject(new Error("modern-screenshot"));
        };
        document.head.append(tag);
      });
    return library;
  }

  /**
   * The window as the visitor sees it, without the toolbar: the page redrawn by modern-screenshot,
   * cut to the window, with what was pointed at drawn on it (`mark`: the element's box and the click,
   * in window coordinates). The image stands on its own wherever it is opened, and the proof keeps the
   * fingerprint of this annotated one. A copy, close to the screen but not a photograph of it: images
   * of other sites that refuse to be read come out blank.
   */
  async function captureWindow(mark) {
    const { domToCanvas } = await loadLibrary();
    const page = document.documentElement;
    const box = page.getBoundingClientRect();
    const drawn = await domToCanvas(page, { scale: 1, filter: (node) => node !== host, timeout: 8000 });
    const shot = document.createElement("canvas");
    shot.width = window.innerWidth;
    shot.height = window.innerHeight;
    const context = shot.getContext("2d");
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, shot.width, shot.height);
    context.drawImage(drawn, box.left, box.top);
    // The element's frame, a few pixels around it so that its edges stay visible, then the click:
    // thick enough to be seen once the capture is shrunk in a thread.
    const gap = 4;
    context.fillStyle = "rgb(48 168 255 / 0.12)";
    context.fillRect(mark.left - gap, mark.top - gap, mark.width + 2 * gap, mark.height + 2 * gap);
    context.lineWidth = 4;
    context.strokeStyle = colors.action;
    context.strokeRect(mark.left - gap, mark.top - gap, mark.width + 2 * gap, mark.height + 2 * gap);
    context.beginPath();
    context.arc(mark.x, mark.y, 12, 0, 2 * Math.PI);
    context.fillStyle = colors.action;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = colors.paper;
    context.stroke();
    return new Promise((resolve, reject) => shot.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture"))), "image/jpeg", 0.8));
  }
  function onKey(event) {
    if (event.key === "Escape") setTool("move");
  }
  /** Switches tools: « Commenter » opens the panel and turns every click into a request, until « Naviguer ». */
  function setTool(next) {
    if (next === tool || !toolIcons[next]) return;
    tool = next;
    const commenting = tool === "remark";
    for (const button of toolButtons) button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    hint.classList.toggle("on", commenting);
    highlight.style.display = "none";
    const listen = commenting ? document.addEventListener : document.removeEventListener;
    for (const [type, handler] of [["mousemove", onMove], ["click", onPick], ["keydown", onKey]]) listen.call(document, type, handler, true);
    if (commenting) {
      savedCursor = document.documentElement.style.cursor;
      document.documentElement.style.cursor = "crosshair";
      open(true);
    } else document.documentElement.style.cursor = savedCursor;
  }
  // C and V, as on Kora's canvas, unless the visitor is typing.
  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === "c") setTool("remark");
    else if (event.key.toLowerCase() === "v") setTool("move");
  });

  // ——— Pins ———

  // Lucide's ClipboardCheck (« Inclus ») and BadgeEuro (« Hors scope »), as Kora's pins show them.
  const icons = {
    correction: [["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1" }], ["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }], ["path", { d: "m9 14 2 2 4-4" }]],
    outside: [
      ["path", { d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" }],
      ["path", { d: "M7 12h5" }],
      ["path", { d: "M15 9.4a4 4 0 1 0 0 5.2" }],
    ],
  };
  function icon(kind) {
    return svgOf(icons[kind] || []);
  }
  function svgOf(shapes) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attributes] of shapes) {
      const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      svg.append(shape);
    }
    return svg;
  }

  let pins = [];
  /** What was last drawn and reported: pins are redrawn (and keyboard focus lost) only when they move. */
  let drawn = "";
  let reported = "";
  function drawPins() {
    const placed = [];
    const missing = [];
    for (const pin of pins) {
      let element = null;
      try {
        element = document.querySelector(pin.selector);
      } catch {
        element = null;
      }
      const box = element && element.getBoundingClientRect();
      if (!box || (!box.width && !box.height)) missing.push(pin.id);
      else placed.push({ ...pin, left: Math.round(box.left + window.scrollX + (box.width * pin.x) / 100), top: Math.round(box.top + window.scrollY + (box.height * pin.y) / 100) });
    }
    if (JSON.stringify(missing) !== reported) {
      reported = JSON.stringify(missing);
      tell({ type: "kora:missing", ids: missing });
    }
    if (JSON.stringify(placed) === drawn) return;
    drawn = JSON.stringify(placed);
    pinsLayer.textContent = "";
    for (const pin of placed) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `pin is-${pin.kind}${pin.agency ? " is-agency" : ""}`;
      button.dataset.id = String(pin.id);
      // As in Kora: the author's initials on a comment, the status's icon on a request.
      if (pin.kind === "comment") button.textContent = String(pin.initials || "").slice(0, 3);
      else button.append(icon(pin.kind));
      button.setAttribute("aria-label", `${pin.label} #${pin.id}`);
      button.style.left = `${pin.left}px`;
      button.style.top = `${pin.top}px`;
      button.addEventListener("click", () => (open(true), tell({ type: "kora:open", id: pin.id })));
      pinsLayer.append(button);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== kora || event.source !== frame.contentWindow || !event.data || typeof event.data !== "object") return;
    const data = event.data;
    if (data.type === "kora:ready") {
      // A panel (re)loaded: it knows nothing yet of the page nor of missing elements.
      reported = "";
      tell({ type: "kora:page", url: pageUrl() });
      drawPins();
    }
    else if (data.type === "kora:pins" && Array.isArray(data.pins)) {
      pins = data.pins;
      drawPins();
    } else if (data.type === "kora:focus") {
      const button = pinsLayer.querySelector(`[data-id="${Number(data.id)}"]`);
      if (button) {
        button.scrollIntoView({ block: "center", behavior: "smooth" });
        button.classList.add("flash");
        setTimeout(() => button.classList.remove("flash"), 1500);
      }
    }
  });

  // Pages of a single-page site change without reloading; images move elements as they load.
  let lastUrl = pageUrl();
  setInterval(() => {
    if (pageUrl() !== lastUrl) {
      lastUrl = pageUrl();
      tell({ type: "kora:page", url: lastUrl });
    }
    drawPins();
  }, 1000);
  window.addEventListener("resize", () => (drawPins(), layout()));

  // ——— Moving the bar ———

  // Where the visitor dropped the bar, from the window's bottom right corner (it unfolds to the left),
  // remembered on this device for this site.
  const placeKey = "kora-toolbar-place";
  const margin = 8;
  let place = { right: 16, bottom: 16 };
  try {
    const saved = JSON.parse(localStorage.getItem(placeKey) || "null");
    if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) place = { right: saved.right, bottom: saved.bottom };
  } catch {
    // No storage (private mode): the bar starts bottom right.
  }
  /** Puts the bar where it was dropped, inside the window, and left of the open panel; its hint above it. */
  function layout() {
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    let right = Math.min(Math.max(place.right, margin), Math.max(margin, window.innerWidth - width - margin));
    const bottom = Math.min(Math.max(place.bottom, margin), Math.max(margin, window.innerHeight - height - margin));
    const panelWidth = Math.min(380, window.innerWidth);
    if (panel.classList.contains("open") && right < panelWidth + 16) right = panelWidth + 16;
    Object.assign(bar.style, { right: `${right}px`, bottom: `${bottom}px` });
    Object.assign(hint.style, { right: `${right}px`, bottom: `${bottom + height + 8}px` });
  }
  // Unfolding changes its width: placed again once done.
  bar.addEventListener("transitionend", layout);

  // A press that moves more than a few pixels drags the bar; otherwise it is a click on its button. The
  // window follows the pointer while it is down (the bar is small: the pointer leaves it at once).
  let drag = null;
  let dragged = false;
  function follow(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    // Released where the window does not see it (over Kora's panel): the drag ends there.
    if (event.buttons === 0) return drop(event);
    const [dx, dy] = [event.clientX - drag.x, event.clientY - drag.y];
    if (!drag.moving && Math.hypot(dx, dy) < 5) return;
    drag.moving = true;
    bar.style.cursor = "grabbing";
    place = { right: drag.right - dx, bottom: drag.bottom - dy };
    layout();
  }
  function drop(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    window.removeEventListener("pointermove", follow, true);
    window.removeEventListener("pointerup", drop, true);
    window.removeEventListener("pointercancel", drop, true);
    if (drag.moving) {
      dragged = true;
      bar.style.cursor = "";
      try {
        localStorage.setItem(placeKey, JSON.stringify(place));
      } catch {
        // Not remembered: the bar goes back bottom right at the next visit.
      }
    }
    drag = null;
  }
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const box = bar.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, right: window.innerWidth - box.right, bottom: window.innerHeight - box.bottom, moving: false, pointer: event.pointerId };
    window.addEventListener("pointermove", follow, true);
    window.addEventListener("pointerup", drop, true);
    window.addEventListener("pointercancel", drop, true);
  });
  // The click that ends a drag is not a click on the button under the pointer.
  bar.addEventListener(
    "click",
    (event) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  document.body.append(host);
  layout();
})();
