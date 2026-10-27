"use client";

// « Partagés avec moi » (/partages): the agencies the person is a member of (the account menu's list, each opened
// with a click), and the reviews other agencies invited their own address to, as a client (src/db/sharedWithMe.ts).
// Decided with the product owner on 25 October 2026: both. Kora has no invitation to a single space.

import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { clientRoleLabels } from "@/lib/clientRoles";
import type { SharedReview } from "@/db/sharedWithMe";
import { switchAgency, useCurrentUser } from "./CurrentUser";

const versionName = (version: number) => `V${String(version).padStart(2, "0")}`;

export function SharedWithMe() {
  const user = useCurrentUser();
  // null: still loading; then the reviews (none when the server could not say).
  const [reviews, setReviews] = useState<SharedReview[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/reviews")
      .then((response) => (response.ok ? response.json() : { reviews: [] }))
      .then((body: { reviews?: SharedReview[] }) => !cancelled && setReviews(body.reviews ?? []))
      .catch(() => !cancelled && setReviews([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="browser">
      <header className="page-header">
        <h1 className="page-title">Partagés avec moi</h1>
      </header>

      <section className="browser-section" aria-labelledby="shared-agencies">
        <h2 id="shared-agencies">Mes organisations</h2>
        <ul className="m-0 grid list-none gap-2 p-0">
          {user.organizations.map((organization) => {
            const current = organization.id === user.organizationId;
            return (
              <li key={organization.id}>
                <Card className="flex-row items-center gap-3 px-4 py-3 shadow-none">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden="true">
                    <Building2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{organization.name}</span>
                  {current ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check aria-hidden="true" className="size-3.5" /> Organisation actuelle
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void switchAgency(organization.id)}>
                      Ouvrir
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="browser-section" aria-labelledby="shared-reviews">
        <h2 id="shared-reviews">Revues partagées avec moi</h2>
        {reviews === null ? (
          <p className="m-0 text-sm text-muted-foreground" role="status">
            Chargement…
          </p>
        ) : reviews.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Aucune revue partagée avec vous</EmptyTitle>
              <EmptyDescription>Quand une autre organisation vous invite à relire un livrable, en tant que client, sa revue apparaît ici.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0" aria-label="Revues partagées avec moi">
            {reviews.map((review) => (
              <li key={review.key}>
                <Card className="flex-row items-center gap-3 px-4 py-3 shadow-none">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden="true">
                    <FileText className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">
                      {review.deliverable} <span className="font-normal text-muted-foreground">{versionName(review.version)}</span>
                    </span>
                    <small className="truncate text-xs text-muted-foreground">
                      {review.agency} · {clientRoleLabels[review.role]}
                    </small>
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={review.href} aria-label={`Ouvrir la revue de ${review.deliverable} (${review.agency})`}>
                      Ouvrir <ArrowUpRight aria-hidden="true" />
                    </a>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
