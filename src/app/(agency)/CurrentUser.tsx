"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { CurrentUser } from "@/lib/session";
import { authClient } from "@/lib/auth-client";
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

/** Avatar (and name, outside the rail) opening the account menu. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  }

  return (
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
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
