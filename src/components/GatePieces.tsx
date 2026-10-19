// The pieces of the client's pages (AuthShell plain): a step's heading, the address it is about, the
// 6-digit code. Styled in src/components/auth.css, tokens only.

import { BadgeCheck, FileText } from "lucide-react";

/** A step: its icon, the deliverable it opens, a real title and one sentence. */
export function GateHeading({
  icon,
  deliverable,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  /** The deliverable under review, when known. */
  deliverable?: string;
  title: string;
  /** « success » once done, « warning » when the page cannot go on. */
  tone?: "success" | "warning";
  children?: React.ReactNode;
}) {
  return (
    <div className="gate-heading">
      <span className={`gate-icon${tone ? ` is-${tone}` : ""}`} aria-hidden="true">
        {icon}
      </span>
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

/**
 * The 6-digit code as six boxes. One real field underneath (invisible, over the boxes): typing, pasting
 * and the phone's suggestion of the code received work as in any field.
 */
export function CodeField({ id, value, onChange, length = 6 }: { id: string; value: string; onChange: (value: string) => void; length?: number }) {
  const current = Math.min(value.length, length - 1);
  return (
    <div className="code-field">
      <input
        id={id}
        className="code-field-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${length}}`}
        maxLength={length}
        required
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
      />
      <div className="code-field-slots" aria-hidden="true">
        {Array.from({ length }, (_, at) => (
          <span key={at} className={`code-slot${value[at] ? " is-filled" : ""}${at === current ? " is-current" : ""}`}>
            {value[at] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
