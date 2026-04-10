import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";

import "@/app/globals.css";

import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/theme-provider";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "CodeCinematic — Turn Code Into Cinematic Videos",
  description: "Turn code, comments, and technical explanations into cinematic typing videos for TikTok, Reels, and YouTube Shorts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${outfit.variable} ${jetbrains.variable} font-sans min-h-screen xl:h-screen xl:overflow-hidden flex flex-col bg-background text-foreground antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <SiteHeader />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
