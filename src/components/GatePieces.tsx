// The pieces of the client's pages (AuthShell plain): a step's heading, the address it is about, the
// 6-digit code, an error; shadcn components where there is one. Styled in src/components/auth.css.

import { BadgeCheck, CircleAlert, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** A step: the deliverable it opens, a real title and one sentence. */
export function GateHeading({ deliverable, title, children }: { deliverable?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="gate-heading">
      {deliverable && (
        <p className="gate-context">
          <FileText aria-hidden="true" />
          <span className="sr-only">Livrable : </span>
          <span className="truncate">{deliverable}</span>
        </p>
      )}
      <h1>{title}</h1>
      {children && <p className="gate-text">{children}</p>}
    </div>
  );
}

/** The address a step is about, as an account: its initial, the address, and what can be done about it. */
export function GateAccount({ email, verified = false, action }: { email: string; verified?: boolean; action?: React.ReactNode }) {
  return (
    <div className="gate-account">
      <span className="gate-avatar" aria-hidden="true">
        {email.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="gate-account-text">
        <span className="truncate">{email}</span>
        {verified && (
          <small>
            <BadgeCheck aria-hidden="true" /> Adresse vérifiée
          </small>
        )}
      </span>
      {action}
    </div>
  );
}

/** What went wrong (shadcn's Alert). */
export function GateError({ children }: { children: React.ReactNode }) {
  return (
    <Alert variant="destructive" className="gate-error">
      <CircleAlert />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
