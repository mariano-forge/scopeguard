"use client";

// A new agency's first steps, one question per screen (in the manner of Airbnb's host onboarding): a
// header to leave, the question in the middle, and a bar at the bottom with the progress, « Retour »
// and « Suivant ». Each step is saved as soon as it is passed; going back corrects it (a rename, never a
// second space or project). The client is invited later, when a deliverable is shared. What is skipped
// stays on the home page's « Bien démarrer » list (src/app/(agency)/GettingStarted.tsx).

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KoraMark } from "@/components/KoraMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { agencyAction } from "@/lib/agencyActions";
import { authClient } from "@/lib/auth-client";
import { href } from "@/app/(agency)/routes";

export type OnboardingStep = "agency" | "space" | "project" | "team";

const steps: OnboardingStep[] = ["agency", "space", "project", "team"];
const stepLabels = { agency: "Organisation", space: "Espace", project: "Projet", team: "Équipe" } as const;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Address fields shown at first on the team step; more are added one by one. */
const firstRows = 2;
const maxRows = 10;
const formId = "onboarding-form";

type Saved = { id: number; name: string };

export function Onboarding({
  firstStep,
  agency,
  firstSpace,
  firstProject,
  canInvite,
}: {
  firstStep: OnboardingStep;
  agency: { id: string; name: string };
  /** The agency's space and project already there (steps done before a reload). */
  firstSpace?: Saved;
  firstProject?: Saved;
  /** Owner or administrator: only they rename the agency and invite colleagues. */
  canInvite: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(firstStep);
  // Which way the last move went: the next screen slides in from that side.
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [agencyName, setAgencyName] = useState(agency.name);
  // The name as saved, to rename only when it changed.
  const [savedAgencyName, setSavedAgencyName] = useState(agency.name);
  const [space, setSpace] = useState(firstSpace);
  const [spaceName, setSpaceName] = useState(firstSpace?.name ?? "");
  const [project, setProject] = useState(firstProject);
  const [projectName, setProjectName] = useState(firstProject?.name ?? "");
  const [colleagues, setColleagues] = useState<string[]>(Array(firstRows).fill(""));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const index = steps.indexOf(step);
  const typedColleagues = [...new Set(colleagues.map((email) => email.trim().toLowerCase()).filter(Boolean))];

  function go(to: OnboardingStep, way: "next" | "back") {
    setError("");
    setDirection(way);
    setStep(to);
  }
  /** Into Kora: the project created here, or the home page and its « Bien démarrer » list. */
  function finish() {
    router.replace(project ? href.project(project.id) : href.home());
    router.refresh();
  }
  /** After `from`: no project without a space, and the team only for those who may invite. */
  function forward(from: OnboardingStep, hasSpace = Boolean(space)) {
    if (from === "agency") return go("space", "next");
    if (from === "space" && hasSpace) return go("project", "next");
    if (canInvite) return go("team", "next");
    finish();
  }
  /** Before the current step; the agency is only renamed by those who may. */
  const previous: OnboardingStep | null =
    step === "team" ? (space ? "project" : "space") : step === "project" ? "space" : step === "space" && canInvite ? "agency" : null;

  /** Runs one save; a refusal is already shown (toast) by agencyAction, or returned here. */
  async function saving<T>(run: () => Promise<T>) {
    setPending(true);
    try {
      return await run();
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step === "agency") {
      const name = agencyName.trim();
      if (!name) return setError("Donnez un nom à votre organisation.");
      if (name !== savedAgencyName) {
        const { error: failed } = await saving(() => authClient.organization.update({ organizationId: agency.id, data: { name } }));
        if (failed) return setError("Le nom de l’organisation n’a pas pu être changé. Réessayez.");
        setSavedAgencyName(name);
      }
      return forward("agency");
    }
    if (step === "space") {
      const name = spaceName.trim();
      if (!name) return setError("Donnez un nom à votre espace.");
      if (space && name === space.name) return forward("space");
      // Back here after creating it: the same space, renamed.
      const saved = await saving(() => (space ? agencyAction(`spaces/${space.id}`, "PATCH", { name }) : agencyAction("spaces", "POST", { name })));
      if (!saved?.id) return;
      setSpace({ id: saved.id, name });
      return forward("space", true);
    }
    if (step === "project") {
      const name = projectName.trim();
      if (!space) return;
      if (!name) return setError("Donnez un nom au projet.");
      if (project && name === project.name) return forward("project");
      const saved = await saving(() => (project ? agencyAction(`projects/${project.id}`, "PATCH", { name }) : agencyAction("projects", "POST", { clientId: space.id, name })));
      if (!saved?.id) return;
      setProject({ id: saved.id, name });
      return forward("project");
    }
    // The team: every address is checked first, then one invitation each; those refused stay, with why.
    if (!typedColleagues.length) return finish();
    const wrong = typedColleagues.find((email) => !emailPattern.test(email));
    if (wrong) return setError(`« ${wrong} » ne semble pas être une adresse e-mail valide.`);
    const refused = await saving(async () => {
      const failed: string[] = [];
      for (const email of typedColleagues) {
        const { error: refusal } = await authClient.organization.inviteMember({ email, role: "member", organizationId: agency.id, resend: true });
        if (refusal) failed.push(email);
      }
      return failed;
    });
    const sent = typedColleagues.length - refused.length;
    if (sent) toast(sent === 1 ? "Invitation envoyée" : `${sent} invitations envoyées`);
    if (!refused.length) return finish();
    setColleagues(refused);
    setError(refused.length === 1 ? `L’invitation de ${refused[0]} n’est pas partie (déjà membre ?).` : "Ces invitations ne sont pas parties (déjà membres ?).");
  }

  const filled = step === "agency" ? agencyName.trim() : step === "space" ? spaceName.trim() : step === "project" ? projectName.trim() : "ok";
  const nextLabel = step !== "team" ? "Suivant" : typedColleagues.length ? "Inviter et terminer" : "Terminer";

  return (
    <div className="ob">
      <header className="ob-header">
        <Link href="/" className="auth-logo" aria-label="Kora, accueil">
          <KoraMark />
          <span>Kora</span>
        </Link>
        <Button type="button" variant="outline" className="ob-quit" disabled={pending} onClick={finish}>
          Quitter
        </Button>
      </header>

      <main className="ob-main">
        <form id={formId} key={step} className="ob-step" data-direction={direction} onSubmit={submit} noValidate>
          <p className="ob-eyebrow">
            Étape {index + 1} sur {steps.length} · {stepLabels[step]}
          </p>

          {step === "agency" && (
            <>
              <h1>Le nom de votre organisation</h1>
              <p className="ob-lead">C’est ce que verront vos collègues et vos clients.</p>
              <Label htmlFor="ob-agency" className="ob-label">
                Nom de votre organisation
              </Label>
              <Input id="ob-agency" className="ob-input" autoFocus maxLength={80} value={agencyName} onChange={(event) => (setAgencyName(event.target.value), setError(""))} />
            </>
          )}

          {step === "space" && (
            <>
              <h1>Créez votre premier espace</h1>
              <p className="ob-lead">Un espace regroupe vos projets : un client, une marque ou une équipe interne (marketing, design…).</p>
              <Label htmlFor="ob-space" className="ob-label">
                Nom de l’espace
              </Label>
              <Input id="ob-space" className="ob-input" autoFocus maxLength={120} placeholder="Maison Verte, Marketing…" value={spaceName} onChange={(event) => (setSpaceName(event.target.value), setError(""))} />
            </>
          )}

          {step === "project" && space && (
            <>
              <h1>Nommez votre premier projet</h1>
              <p className="ob-lead">
                Une mission pour <b>{space.name}</b> : une refonte, une campagne, un site… Vous y déposerez ensuite vos livrables.
              </p>
              <Label htmlFor="ob-project" className="ob-label">
                Nom du projet
              </Label>
              <Input id="ob-project" className="ob-input" autoFocus maxLength={120} placeholder="Refonte du site vitrine" value={projectName} onChange={(event) => (setProjectName(event.target.value), setError(""))} />
            </>
          )}

          {step === "team" && (
            <>
              <h1>Invitez vos collègues</h1>
              <p className="ob-lead">Ils rejoignent votre organisation et travaillent avec vous sur tous ses projets. Chacun reçoit son invitation par e-mail.</p>
              <fieldset className="ob-emails">
                <legend className="ob-label">E-mails de vos collègues</legend>
                {colleagues.map((email, at) => (
                  <div key={at} className="ob-email">
                    <Input
                      type="email"
                      aria-label={`E-mail du collègue ${at + 1}`}
                      autoFocus={at === 0}
                      maxLength={320}
                      placeholder="prenom@exemple.fr"
                      className="ob-input"
                      value={email}
                      onChange={(event) => {
                        const value = event.target.value;
                        setColleagues((current) => current.map((other, row) => (row === at ? value : other)));
                        setError("");
                      }}
                    />
                    {colleagues.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Retirer l’adresse ${at + 1}`} onClick={() => setColleagues((current) => current.filter((_, row) => row !== at))}>
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
                {colleagues.length < maxRows && (
                  <Button type="button" variant="ghost" className="ob-add" onClick={() => setColleagues((current) => [...current, ""])}>
                    <Plus /> Ajouter une adresse
                  </Button>
                )}
              </fieldset>
              <p className="ob-note">Et votre client ? Vous l’inviterez plus tard, en partageant un livrable avec lui.</p>
            </>
          )}

          {error && (
            <p role="alert" className="ob-error">
              {error}
            </p>
          )}
        </form>
      </main>

      <footer className="ob-footer">
        <div className="ob-progress" aria-hidden="true">
          {steps.map((name, at) => (
            <span key={name} data-done={at <= index ? "" : undefined} />
          ))}
        </div>
        <div className="ob-actions">
          {previous ? (
            <Button type="button" variant="link" className="ob-back" disabled={pending} onClick={() => go(previous, "back")}>
              Retour
            </Button>
          ) : (
            <span />
          )}
          <div className="ob-next">
            {(step === "space" || step === "project") && (
              <Button type="button" variant="ghost" size="lg" disabled={pending} onClick={() => forward(step)}>
                Passer
              </Button>
            )}
            <Button type="submit" form={formId} size="lg" className="ob-submit" disabled={pending || !filled}>
              {nextLabel}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
