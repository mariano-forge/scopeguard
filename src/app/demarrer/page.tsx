import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { readState } from "@/db/state";
import { getCurrentUser } from "@/lib/session";
import { Onboarding, type OnboardingStep } from "./Onboarding";
import "@/components/auth.css";

export const metadata: Metadata = { title: "Bien démarrer · Kora" };

/**
 * Right after creating the agency (/bienvenue): its first space, project and colleagues. It starts at
 * the first step not done yet, with what is already there, so a reload never creates a second space.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (!user.organizationId) redirect("/bienvenue");

  const { state } = await readState(getDb(), user.organizationId);
  const space = state?.clients?.[0];
  const project = state?.projects?.[0];
  const canInvite = user.role === "owner" || user.role === "admin";
  const firstStep: OnboardingStep = !space ? "space" : !project ? "project" : "team";
  // Nothing left to set up here: straight into Kora.
  if (firstStep === "team" && !canInvite) redirect("/");

  return (
    <Onboarding
      firstStep={firstStep}
      agency={{ id: user.organizationId, name: user.organizationName ?? "" }}
      firstSpace={space ? { id: space.id, name: String(space.name ?? "") } : undefined}
      firstProject={project ? { id: project.id, name: String(project.name ?? "") } : undefined}
      canInvite={canInvite}
    />
  );
}
