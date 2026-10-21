"use client";

// The client's 6-digit code (src/app/review/[token]/AccessGate.tsx), on shadcn's InputOTP. Its own
// client file: input-otp runs in the browser, and GatePieces is also used by server pages.

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

/** The 6-digit code (shadcn's InputOTP): typing, pasting and the phone's suggestion of the code received. */
export function CodeField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <InputOTP id={id} maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" autoFocus value={value} onChange={onChange} containerClassName="gate-otp">
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}
