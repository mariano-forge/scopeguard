"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Frame, LogOut, Settings, Users } from "lucide-react";
import type { CurrentUser } from "@/lib/session";
import { authClient } from "@/lib/auth-client";
import { avatarLetter, initialsOf } from "@/lib/authors";
import { href } from "./routes";
import { AgencyDialog } from "./AgencyDialog";
import { FigmaAccountDialog } from "./FigmaAccountDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in agency member (the agency layout only renders once signed in). */
export function useCurrentUser() {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser outside CurrentUserProvider");
  return user;
}


/** Opens another agency of the person's: the app starts again on its data (account menu, « Partagés avec moi »). */
export async function switchAgency(organizationId: string) {
  await authClient.organization.setActive({ organizationId });
  // Full load: the app starts again on the other agency's data.
  window.location.assign("/");
}

/** Avatar (and name, outside the rail) opening the account menu: team, agency switch, sign-out. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [figmaOpen, setFigmaOpen] = useState(false);
  const canManage = user.role === "owner" || user.role === "admin";

  async function signOut() {
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button type="button" className="avatar dark-avatar rail-avatar" aria-label={`Compte de ${user.name}`}>
            {avatarLetter(initialsOf(user.name))}
          </button>
        ) : (
          <button type="button" className="account" aria-label={`Compte de ${user.name}`}>
            <span className="avatar dark-avatar">{avatarLetter(initialsOf(user.name))}</span>
            <b>{user.name}</b>
          </button>
        )}
      </DropdownMenuTrigger>
      {/* As wide as its content, not as its trigger (the rail's avatar would make it narrow). */}
      <DropdownMenuContent align="start" side={compact ? "right" : "bottom"} className="account-menu w-72">
        <DropdownMenuLabel className="account-menu-head">
          <span className="avatar dark-avatar" aria-hidden="true">
            {avatarLetter(initialsOf(user.name))}
          </span>
          <span className="min-w-0">
            <b>{user.name}</b>
            <small>{user.email}</small>
          </span>
        </DropdownMenuLabel>
        {user.organizationName && (
          <p className="account-menu-agency">
            Connecté à <b>{user.organizationName}</b>
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(href.team())}>
          <Users />
          Équipe
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setFigmaOpen(true)}>
          <Frame />
          Compte Figma
        </DropdownMenuItem>
        {canManage && (
          <DropdownMenuItem onSelect={() => setAgencyOpen(true)}>
            <Settings />
            Paramètres de l’organisation
          </DropdownMenuItem>
        )}
        {user.organizations.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal opacity-70">Changer d’organisation</DropdownMenuLabel>
            {user.organizations.map((agency) => (
              <DropdownMenuItem key={agency.id} disabled={agency.id === user.organizationId} onSelect={() => void switchAgency(agency.id)}>
                {agency.id === user.organizationId ? <Check /> : <Building2 />}
                {agency.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {agencyOpen && <AgencyDialog open onClose={() => setAgencyOpen(false)} />}
    {figmaOpen && <FigmaAccountDialog onClose={() => setFigmaOpen(false)} />}
    </>
  );
}
