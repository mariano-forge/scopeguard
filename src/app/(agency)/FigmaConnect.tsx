"use client";

// « Connecter mon compte Figma », wherever Kora needs the member's Figma account: Figma's consent page opens in
// this tab, then Figma sends the member back to the page they left (src/lib/figmaReturn.ts).

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { figmaBackParam } from "@/lib/figmaReturn";

/** The error code of a Figma read refused because the member's account is not connected. */
export const figmaNotConnected = "FIGMA_NOT_CONNECTED";

export function FigmaConnectButton({ size }: { size?: "sm" }) {
  const pathname = usePathname();
  return (
    // A navigation, not a request: it leaves Kora for Figma's page.
    <Button type="button" size={size} onClick={() => window.location.assign(new URL(`/api/integrations/figma/connect?${new URLSearchParams({ [figmaBackParam]: pathname })}`, window.location.origin))}>
      Connecter mon compte Figma
    </Button>
  );
}

/** In a dialog that reads a Figma file: what to do, and the button to do it (feedback of 25 October 2026). */
export function FigmaConnectNote() {
  return (
    <div role="note" className="flex flex-col items-start gap-2 rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
      <p>Connectez votre compte Figma pour lire ce fichier. Vous reviendrez ensuite sur cette page.</p>
      <FigmaConnectButton size="sm" />
    </div>
  );
}
