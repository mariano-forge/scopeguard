"use client";

// The canvas's announcement for a version no decider is invited on yet (src/lib/linkDeciders.ts): nobody
// can validate it nor decide a quote. One line across the top of the canvas, the canvas under it; the
// agency invites from there, or closes it: closed, it stays closed for that version on this browser.

import { useState } from "react";
import { UserPlus, X } from "lucide-react";

const closedKey = (version: string) => `kora-no-decider-closed:${version}`;

export function NoDeciderBanner({ version, onInvite }: { version: string; onInvite: () => void }) {
  const [closed, setClosed] = useState(() => {
    try {
      return window.localStorage.getItem(closedKey(version)) === "1";
    } catch {
      return false;
    }
  });
  if (closed) return null;
  return (
    <div className="announcement-bar" role="status">
      <UserPlus aria-hidden="true" />
      <p>
        <b>Aucun décideur sur cette version</b>
      </p>
      <button type="button" className="announcement-action" onClick={onInvite}>
        Inviter un décideur
      </button>
      <button
        type="button"
        className="announcement-close"
        aria-label="Fermer l’alerte"
        onClick={() => {
          setClosed(true);
          try {
            window.localStorage.setItem(closedKey(version), "1");
          } catch {
            // Storage refused (private mode): closed for this visit only.
          }
        }}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
