import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Manrope } from "next/font/google";
import { AgentationProvider } from "./AgentationProvider";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Kora",
  description: "Le portail de validation client qui transforme les demandes hors périmètre en décisions facturées.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" offset={16} mobileOffset={16} />
        <AgentationProvider />
      </body>
    </html>
  );
}
