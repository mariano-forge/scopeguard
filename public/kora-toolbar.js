// Kora toolbar for an agency's staging site (US-048). The agency puts on its site:
//
//   <script src="https://<kora>/kora-toolbar.js" data-review="<review link token>" defer></script>
//
// and sends its client the site's address with ?kora. The toolbar then shows on that device: a button
// opens Kora's panel (/review/<token>/site, in a frame on Kora's origin), where the client verifies their
// address by code and writes; « Poser une demande » or the C key picks an element of the page.
//
// This script runs in the agency's page, next to its other scripts: it never receives what the
// client writes, only where to draw the pins. Every message is checked (origin and window).
// Colours copy src/theme/tokens.css: this page cannot read Kora's tokens.
(() => {
  const script = document.currentScript;
  if (!script || window.__koraToolbar) return;
  window.__koraToolbar = true;
  const token = script.dataset.review;
  const kora = new URL(script.src).origin;
  if (!token) return;

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

  const colors = { action: "#30a8ff", ink: "#111111", paper: "#ffffff", border: "#ddd9d1", focus: "#0079d1", graphite: "#4c4c48" };
  const host = document.createElement("div");
  host.setAttribute("data-kora-toolbar", "");
  host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      button { font: 600 13px/1 system-ui, sans-serif; cursor: pointer; }
      .launcher { position: fixed; right: 16px; bottom: 16px; padding: 10px 14px; border-radius: 999px; border: 1px solid ${colors.border};
        background: ${colors.ink}; color: ${colors.paper}; box-shadow: 0 4px 16px rgb(0 0 0 / .2); }
      .panel { position: fixed; top: 0; right: 0; width: min(380px, 100vw); height: 100vh; display: none; background: ${colors.paper};
        border-left: 1px solid ${colors.border}; box-shadow: -8px 0 24px rgb(0 0 0 / .12); }
      .panel.open { display: block; }
      .panel iframe { width: 100%; height: 100%; border: 0; }
      .close { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 999px; border: 1px solid ${colors.border};
        background: ${colors.paper}; color: ${colors.ink}; }
      .highlight { position: fixed; pointer-events: none; outline: 2px solid ${colors.action}; background: rgb(48 168 255 / .12); display: none; }
      .pin { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 999px; border: 2px solid ${colors.paper};
        background: ${colors.action}; color: ${colors.ink}; box-shadow: 0 2px 8px rgb(0 0 0 / .25); }
      .pin.internal { background: ${colors.paper}; color: ${colors.graphite}; border: 2px dashed ${colors.graphite}; }
      .pin.flash { outline: 3px solid ${colors.focus}; }
      button:focus-visible { outline: 3px solid ${colors.focus}; outline-offset: 2px; }
    </style>
    <div class="pins"></div>
    <div class="highlight"></div>
    <button class="launcher" type="button" aria-label="Ouvrir Kora">Kora</button>
    <div class="panel" role="dialog" aria-label="Kora">
      <iframe title="Kora"></iframe>
      <button class="close" type="button" aria-label="Fermer Kora">×</button>
    </div>`;
  const panel = root.querySelector(".panel");
  const frame = root.querySelector("iframe");
  const highlight = root.querySelector(".highlight");
  const pinsLayer = root.querySelector(".pins");
  frame.src = `${kora}/review/${encodeURIComponent(token)}/site?parent=${encodeURIComponent(location.origin)}`;

  const tell = (message) => frame.contentWindow && frame.contentWindow.postMessage(message, kora);
  /** The page, as requests are filed under: path and query, without the toolbar's own ?kora. */
  const pageUrl = () => {
    const url = new URL(location.href);
    url.searchParams.delete("kora");
    return url.pathname + url.search;
  };
  const open = (on) => panel.classList.toggle("open", on);
  root.querySelector(".launcher").addEventListener("click", () => open(!panel.classList.contains("open")));
  root.querySelector(".close").addEventListener("click", () => open(false));

  // ——— Picking an element ———

  let picking = false;
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
    stopPicking();
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
    if (event.key === "Escape") stopPicking();
  }
  function startPicking() {
    if (picking) return;
    picking = true;
    open(true);
    savedCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "crosshair";
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onPick, true);
    document.addEventListener("keydown", onKey, true);
  }
  function stopPicking() {
    picking = false;
    highlight.style.display = "none";
    document.documentElement.style.cursor = savedCursor;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onPick, true);
    document.removeEventListener("keydown", onKey, true);
  }
  // C, as on Vercel's toolbar, unless the visitor is typing.
  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if (event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) startPicking();
  });

  // ——— Pins ———

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
      // An agency pin the client does not see (only drawn for the agency).
      button.className = pin.internal ? "pin internal" : "pin";
      button.dataset.id = String(pin.id);
      button.textContent = String(pin.number);
      button.setAttribute("aria-label", pin.internal ? `Remarque interne ${pin.number}` : `Demande ${pin.number}`);
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
    } else if (data.type === "kora:pick-mode") data.on ? startPicking() : stopPicking();
    else if (data.type === "kora:focus") {
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
  window.addEventListener("resize", drawPins);

  document.body.append(host);
})();
