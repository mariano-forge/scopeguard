"use client";

// « Comparer les versions » on the client's page (US-053): shown once two versions of this deliverable
// are shared with them, images or PDFs. The versions come from the server, each as the client's page of
// it would show it (GET /api/review/:token/versions): never one not shared with them.

import { useEffect, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeliverableType } from "@/components/deliverableKinds";
import { VersionCompare, comparable, type CompareComment, type CompareVersion } from "@/app/(agency)/editor/VersionCompare";

type SharedVersion = { version: number; deliverable: { name?: string; type?: DeliverableType; fileData?: string }; comments: CompareComment[] };

export function ClientCompare({ token, currentVersion }: { token: string; currentVersion: number }) {
  const [versions, setVersions] = useState<CompareVersion[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/review/${encodeURIComponent(token)}/versions`, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { versions?: SharedVersion[] }) : null))
      .then((body) => {
        if (cancelled || !body?.versions) return;
        setVersions(
          body.versions
            .map((shared) => ({ version: shared.version, name: shared.deliverable.name ?? "", type: shared.deliverable.type ?? "PDF", fileData: shared.deliverable.fileData, comments: shared.comments }))
            .filter(comparable),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, currentVersion]);

  if (versions.length < 2) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <GitCompareArrows /> Comparer les versions
      </Button>
      {open && <VersionCompare versions={versions} initialAfter={currentVersion} onClose={() => setOpen(false)} />}
    </>
  );
}
