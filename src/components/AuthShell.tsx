import { KoraMark } from "@/components/KoraMark";

/** Centered card with the Kora mark: agency sign-in, password reset, client access check. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2 text-[var(--ink)]">
          <KoraMark className="size-7" />
          <span className="font-heading text-xl font-bold">Kora</span>
        </div>
        <div className="rounded-[var(--r-panel)] border border-[var(--border)] bg-[var(--paper)] p-6 shadow-[var(--shadow)]">{children}</div>
      </div>
    </main>
  );
}
