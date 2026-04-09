import type { Metadata } from "next";

import "@/app/globals.css";

import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "CodeCinematic",
  description: "Turn code, comments, and technical explanations into cinematic typing videos."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen xl:h-screen xl:overflow-hidden flex flex-col bg-background text-foreground antialiased transition-colors duration-200">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SiteHeader />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
