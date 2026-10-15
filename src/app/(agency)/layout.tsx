import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AgencyApp } from "./AgencyApp";
import { CurrentUserProvider } from "./CurrentUser";

export default async function AgencyLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  return (
    <CurrentUserProvider user={user}>
      <Suspense fallback={null}>
        <AgencyApp />
      </Suspense>
      {children}
    </CurrentUserProvider>
  );
}
