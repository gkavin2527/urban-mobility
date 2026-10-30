import type { Metadata } from "next";
import "./globals.css";
import "./simulation.css";

export const metadata: Metadata = {
  title: "ASQL | Urban Mobility Traffic Analytics",
  description: "MySQL-backed analysis of an urban traffic dataset and a separate synthetic junction simulation with fixed and adaptive signal comparisons.",
  keywords: ["Advanced SQL", "Urban Mobility", "Traffic Analysis", "MySQL", "Traffic Dataset"],
  authors: [{ name: "Urban Mobility Research" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="antialiased bg-background text-foreground">{children}</body></html>;
}
