import { Suspense } from "react";
import { AgencyApp } from "./AgencyApp";

export default function AgencyLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={null}>
        <AgencyApp />
      </Suspense>
      {children}
    </>
  );
}
