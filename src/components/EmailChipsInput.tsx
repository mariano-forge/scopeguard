"use client";

// Several e-mail addresses in one field: each address becomes a chip once followed by a space, a comma,
// a semicolon or a paste; Backspace in the empty field takes the last one back. The value stays one
// string (addresses separated by commas) for whoever sends it: the chips are only how it is shown.

import { X } from "lucide-react";
import { cn } from "cn";

const separators = /[\s,;]+/;
const looksLikeEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

export function EmailChipsInput({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter: send the addresses (the chips and what is being typed). */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const tokens = value.split(separators);
  const finished = /[\s,;]$/.test(value);
  const chips = (finished ? tokens : tokens.slice(0, -1)).filter(Boolean);
  const typing = finished ? "" : (tokens.at(-1) ?? "");
  const compose = (list: string[], text: string) => [...list.map((email) => `${email}, `), text].join("");

  return (
    <div className={cn("email-chips", disabled && "is-disabled", className)}>
      {chips.map((email, at) => (
        <span key={`${email}-${at}`} className={cn("email-chip", !looksLikeEmail(email) && "is-invalid")}>
          {email}
          <button type="button" aria-label={`Retirer ${email} de la liste`} disabled={disabled} onClick={() => onChange(compose(chips.filter((_, other) => other !== at), typing))}>
            <X aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        inputMode="email"
        autoComplete="off"
        value={typing}
        disabled={disabled}
        placeholder={chips.length ? "" : placeholder}
        onChange={(event) => onChange(compose(chips, event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // What is being typed is already in the value: it is sent with the chips.
            event.preventDefault();
            onSubmit?.();
          } else if (event.key === "Backspace" && !typing && chips.length) {
            event.preventDefault();
            onChange(compose(chips.slice(0, -1), chips.at(-1) ?? ""));
          }
        }}
      />
    </div>
  );
}
