// Browser side of the shared state: replaces the "scopeguard-review-state" entry of localStorage.
// The agency uses /api/state (signed in); the client page uses /api/review/:token, which only holds
// the shared version.
//
// Pages keep reading and writing the state as one JSON string, synchronously, from an in-memory copy.
// The agency's writes are sent to the server as record-level changes (src/lib/sharedState.ts); the
// client page sends each action to its own route instead (sendAction). The server is
// polled for the writes of other pages (the client review, another tab or device), which are passed
// to subscribers like the "storage" event used to be.

import { toast } from "sonner";
import { diffState, type SharedState } from "./sharedState";

const pushDelay = 300;
const pollInterval = 2000;
const retryDelay = 3000;

let cache: string | null = null;
/** What the server has, as last sent or received, and the same as a string. */
let synced: SharedState | null = null;
let syncedSerialized: string | null = null;
/** Server revision of `synced`; -1 forces the next poll to fetch the state. */
let revision = -1;
let online = false;
let loading: Promise<string | null> | null = null;
let endpoint = "/api/state";
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let failed = false;
/** Actions sent to their own route (the client page) and not answered yet. */
let acting = 0;
const listeners = new Set<(serialized: string) => void>();

/**
 * Loads the state from the server once per page; null when there is none yet, or when a review link
 * is invalid. `reviewToken`: the client page, which reads and writes through its link.
 */
export function loadSharedState(reviewToken?: string): Promise<string | null> {
  loading ??= (async () => {
    if (reviewToken) endpoint = `/api/review/${encodeURIComponent(reviewToken)}`;
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.status === 401) {
        if (!reviewToken) window.location.assign("/connexion");
        return null;
      }
      if (reviewToken && response.status === 404) return null;
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? response.statusText);
      const body = (await response.json()) as { revision: number; state: SharedState | null };
      online = true;
      revision = body.revision;
      if (body.state) {
        synced = body.state;
        cache = syncedSerialized = JSON.stringify(body.state);
      }
      startPolling();
    } catch (error) {
      console.error("[stateSync] load failed", error);
      toast.error("Base de données injoignable : vos modifications ne seront pas enregistrées.", { duration: Infinity });
      cache = null;
    }
    return cache;
  })();
  return loading;
}

/** Current state, as a JSON string. */
export function readSharedState() {
  return cache;
}

export function writeSharedState(serialized: string) {
  if (!online || serialized === cache) return;
  cache = serialized;
  schedulePush();
}

/** Called with the new state when another page changed it; returns the unsubscribe function. */
export function subscribeSharedState(listener: (serialized: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Session ended: the agency signs in again, the client page asks for a new code. */
function signedOut() {
  if (endpoint === "/api/state") window.location.assign("/connexion");
  else window.location.reload();
}

/** Agency page refused (403): removed from the agency. The home page sends them to /bienvenue. */
function leftAgency() {
  window.location.assign("/");
}

/** Sends waiting changes now (e.g. before a server action that needs them saved). */
export async function flushSharedState() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  while (pushing) await new Promise((resolve) => setTimeout(resolve, 50));
  await push();
}

/** Fetches the state now (e.g. after a server action changed it). */
export function refreshSharedState() {
  revision = -1;
  void poll();
}

/**
 * Sends one action to its own route (src/lib/reviewActions.ts). Polls wait for its answer, so they
 * cannot bring back the state from before it; the state is then fetched with its result.
 */
export async function sendAction<T>(run: () => Promise<T>): Promise<T> {
  acting++;
  try {
    return await run();
  } finally {
    acting--;
    refreshSharedState();
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void push();
  }, pushDelay);
}

function pendingChanges() {
  if (cache === null || cache === syncedSerialized) return null;
  const snapshot = cache;
  const next = JSON.parse(snapshot) as SharedState;
  return { snapshot, next, changes: diffState(synced, next) };
}

async function push() {
  if (pushing) return;
  const pending = pendingChanges();
  if (!pending) return;
  if (!pending.changes) {
    // Same records written differently (key order): nothing to send.
    synced = pending.next;
    syncedSerialized = pending.snapshot;
    return;
  }

  pushing = true;
  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: pending.changes }),
    });
    if (response.status === 401) {
      signedOut();
      return;
    }
    if (response.status === 403 && endpoint === "/api/state") {
      const refusal = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;
      if (refusal?.code !== "ADMIN_ONLY") {
        leftAgency();
        return;
      }
      // A member tried an action reserved to administrators: drop it, the next poll restores the state.
      synced = pending.next;
      syncedSerialized = pending.snapshot;
      revision = -1;
      toast.error(refusal.error ?? "Action réservée aux administrateurs de l’agence.");
      return;
    }
    if (response.status === 403) {
      // Read-only preview (agency on the client page): drop the change, the next poll restores the state.
      synced = pending.next;
      syncedSerialized = pending.snapshot;
      revision = -1;
      toast("Aperçu agence : les actions ne sont pas enregistrées.");
      return;
    }
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? response.statusText);
    const result = (await response.json()) as { revision: number; previousRevision: number; filesStored: number };
    synced = pending.next;
    syncedSerialized = pending.snapshot;
    // Someone else wrote in between, or files were swapped for their address: fetch the state back.
    revision = result.previousRevision === revision && !result.filesStored ? result.revision : -1;
    if (failed) toast.success("Connexion à la base rétablie : modifications enregistrées.");
    failed = false;
  } catch (error) {
    console.error("[stateSync] save failed", error);
    if (!failed) toast.error("Enregistrement impossible pour l'instant, nouvel essai en cours…");
    failed = true;
    setTimeout(() => void push(), retryDelay);
  } finally {
    pushing = false;
  }
  // Written while the request was running.
  if (!failed && cache !== syncedSerialized) schedulePush();
}

async function poll() {
  if (acting || pushing || pushTimer || document.visibilityState !== "visible") return;
  try {
    const response = await fetch(`${endpoint}?revision=${revision}`, { cache: "no-store" });
    if (response.status === 401) return signedOut();
    if (response.status === 403 && endpoint === "/api/state") return leftAgency();
    if (response.status !== 200) return;
    const body = (await response.json()) as { revision: number; state: SharedState | null };
    // A local write started meanwhile: it goes first, the next poll brings the merged state.
    if (!body.state || acting || pushing || pushTimer || cache !== syncedSerialized) return;
    revision = body.revision;
    synced = body.state;
    cache = syncedSerialized = JSON.stringify(body.state);
    for (const listener of listeners) listener(cache);
  } catch {
    // Offline for a moment: the next poll retries.
  }
}

let polling = false;
function startPolling() {
  if (polling) return;
  polling = true;
  setInterval(() => void poll(), pollInterval);
  document.addEventListener("visibilitychange", () => void poll());
  // Leaving the page with a write still waiting: send it if it is small enough for a keepalive request.
  window.addEventListener("pagehide", () => {
    const pending = pendingChanges();
    if (!pending?.changes) return;
    const body = JSON.stringify({ changes: pending.changes });
    if (body.length < 60_000)
      void fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  });
}
