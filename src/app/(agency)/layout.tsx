import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AgencyApp } from "./AgencyApp";
import { CurrentUserProvider } from "./CurrentUser";
import { FigmaReturn } from "./FigmaReturn";

export default async function AgencyLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  // Signed in but in no agency yet: create one, or join through an invitation.
  if (!user.organizationId) redirect("/bienvenue");

  return (
    <CurrentUserProvider user={user}>
      <Suspense fallback={null}>
        <AgencyApp />
        <FigmaReturn />
      </Suspense>
      {children}
    </CurrentUserProvider>
  );
}
