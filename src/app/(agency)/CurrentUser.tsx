"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, LogOut, Users } from "lucide-react";
import type { CurrentUser } from "@/lib/session";
import { authClient } from "@/lib/auth-client";
import { TeamDialog } from "./TeamDialog";
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

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : (words[0]?.[1] ?? ""))).toUpperCase() || "?";
}

/** Avatar (and name, outside the rail) opening the account menu: team, agency switch, sign-out. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();
  const [teamOpen, setTeamOpen] = useState(false);

  async function switchAgency(organizationId: string) {
    await authClient.organization.setActive({ organizationId });
    // Full load: the app starts again on the other agency's data.
    window.location.assign("/");
  }

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
            {initialsOf(user.name)}
          </button>
        ) : (
          <button type="button" className="account" aria-label={`Compte de ${user.name}`}>
            <span className="avatar dark-avatar">{initialsOf(user.name)}</span>
            <b>{user.name}</b>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={compact ? "right" : "bottom"}>
        <DropdownMenuLabel>
          <span className="block">{user.name}</span>
          <span className="block text-xs font-normal opacity-70">{user.email}</span>
          <span className="block text-xs font-normal opacity-70">{user.organizationName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTeamOpen(true)}>
          <Users />
          Équipe
        </DropdownMenuItem>
        {user.organizations.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal opacity-70">Changer d’agence</DropdownMenuLabel>
            {user.organizations.map((agency) => (
              <DropdownMenuItem key={agency.id} disabled={agency.id === user.organizationId} onSelect={() => void switchAgency(agency.id)}>
                {agency.id === user.organizationId ? <Check /> : <Building2 />}
                {agency.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <TeamDialog open={teamOpen} onClose={() => setTeamOpen(false)} />
    </>
  );
}
