import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { ModeSetter } from "@/lib/client/ModeSetter";
import { storageMode } from "@/lib/server/store";

const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PresenceOS — Luxury Marketing Studio", template: "%s · PresenceOS" },
  description: "Prototype: orchestrated AI agents turn a property brief into a reviewed, brand-consistent luxury real-estate campaign.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen">
        <ModeSetter mode={storageMode()} />
        {children}
      </body>
    </html>
  );
}
