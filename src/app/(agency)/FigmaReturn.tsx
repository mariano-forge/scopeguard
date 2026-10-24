"use client";

// Back from Figma's consent page (src/app/api/integrations/figma/callback): the outcome is said once, then
// taken out of the address, so that reloading the page does not say it again.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { figmaOutcomeParam, figmaOutcomes, readFigmaOutcome } from "@/lib/figmaReturn";

export function FigmaReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const outcome = readFigmaOutcome(params.get(figmaOutcomeParam));

  useEffect(() => {
    if (!outcome) return;
    if (outcome === "connected") toast(figmaOutcomes[outcome]);
    else toast.error(figmaOutcomes[outcome]);
    const rest = new URLSearchParams(params);
    rest.delete(figmaOutcomeParam);
    router.replace(rest.size ? `${pathname}?${rest}` : pathname);
  }, [outcome, params, pathname, router]);

  return null;
}
