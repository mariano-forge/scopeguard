// Browser side of the shared state. The agency reads /api/state (signed in); the client page reads
// /api/review/:token, which only holds the shared version.
//
// Pages read the state as one JSON string, from an in-memory copy. They never write it: each change
// is an action sent to its own route (sendAction, src/lib/actionRequest.ts), after which the state is
// fetched back. The server is polled for the writes of other pages (the client review, another tab or
// device), which are passed to subscribers.

import { toast } from "sonner";
import type { SharedState } from "./sharedState";

const pollInterval = 2000;

let cache: string | null = null;
/** Server revision of `cache`; -1 forces the next poll to fetch the state. */
let revision = -1;
let loading: Promise<string | null> | null = null;
let endpoint = "/api/state";
/** Actions sent to their own route and not answered yet. */
let acting = 0;
const listeners = new Set<(serialized: string) => void>();

/**
 * Loads the state from the server once per page; null when there is none yet, or when a review link
 * is invalid. `reviewToken`: the client page, which reads through its link.
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
      revision = body.revision;
      if (body.state) cache = JSON.stringify(body.state);
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

/** Called with the new state when it changed on the server; returns the unsubscribe function. */
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

/** Fetches the state now (e.g. after a server action changed it). */
export function refreshSharedState() {
  revision = -1;
  return poll();
}

/**
 * Sends one action to its own route (src/lib/actionRequest.ts). Polls wait for its answer, so they
 * cannot bring back the state from before it; the state with its result is fetched before returning.
 */
export async function sendAction<T>(run: () => Promise<T>): Promise<T> {
  acting++;
  let result: T;
  try {
    result = await run();
  } finally {
    acting--;
  }
  await refreshSharedState();
  return result;
}

async function poll() {
  if (acting || document.visibilityState !== "visible") return;
  try {
    const response = await fetch(`${endpoint}?revision=${revision}`, { cache: "no-store" });
    if (response.status === 401) return signedOut();
    if (response.status === 403 && endpoint === "/api/state") return leftAgency();
    if (response.status !== 200) return;
    const body = (await response.json()) as { revision: number; state: SharedState | null };
    // An action started meanwhile: the poll after it brings its result.
    if (!body.state || acting) return;
    revision = body.revision;
    cache = JSON.stringify(body.state);
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
}
