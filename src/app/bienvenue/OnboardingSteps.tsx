// Where a new agency is in its first steps: the agency (/bienvenue), then its first space, project and
// colleagues (/demarrer). A thin bar of segments and « Étape n sur 4 ».

export const onboardingSteps = ["Agence", "Espace", "Projet", "Équipe"] as const;

export function OnboardingSteps({ current }: { current: number }) {
  return (
    <div className="auth-progress">
      <ol aria-hidden="true">
        {onboardingSteps.map((label, index) => (
          <li key={label} data-done={index <= current ? "" : undefined} />
        ))}
      </ol>
      <p>
        Étape {current + 1} sur {onboardingSteps.length} · {onboardingSteps[current]}
      </p>
    </div>
  );
}
