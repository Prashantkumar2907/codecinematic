import type { Metadata } from "next";
import { Caveat, Shantell_Sans } from "next/font/google";
import "./globals.css";

const shantell = Shantell_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-shantell",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DevStudio",
  description: "Personal AI coding-video studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${shantell.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
