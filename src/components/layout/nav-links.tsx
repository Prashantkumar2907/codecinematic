"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, LayoutGroup } from "framer-motion";

const publicLinks = [
  { href: "/pricing", label: "Pricing", tab: null },
];

const authLinks = [
  { href: "/dashboard", label: "Dashboard", tab: null },
  { href: "/projects/new-project?tab=editor", label: "Code Studio", tab: "editor" },
  { href: "/projects/new-project?tab=wordofday", label: "Word of Day", tab: "wordofday" },
  { href: "/projects/new-project?tab=didyouknow", label: "Did You Know", tab: "didyouknow" },
  { href: "/projects/new-project?tab=shayari", label: "Shayari", tab: "shayari" },
  { href: "/projects/new-project?tab=suvichar", label: "Suvichar", tab: "suvichar" },
  { href: "/projects/new-project?tab=bollywood", label: "Bollywood", tab: "bollywood" },
  { href: "/projects/new-project?tab=factshindi", label: "Facts Hindi", tab: "factshindi" },
];

export function NavLinks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const links = isLoggedIn ? [...publicLinks, ...authLinks] : publicLinks;

  return (
    <LayoutGroup>
      <nav className="flex w-full max-w-full items-center justify-start gap-0.5 overflow-x-auto overscroll-x-contain rounded-full border border-white/[0.06] bg-white/[0.04] px-1 py-0.5 scrollbar-none sm:justify-center">
        {links.map((link) => {
          const base = link.href.split("?")[0];
          let isActive = false;

          if (link.tab) {
            isActive = pathname.startsWith("/projects") && currentTab === link.tab;
          } else if (base === "/dashboard") {
            isActive = pathname.startsWith("/dashboard");
          } else if (base === "/pricing") {
            isActive = pathname === "/pricing";
          }

          // Default: if on /projects/ with no tab param, highlight Code Studio
          if (
            link.tab === "editor" &&
            pathname.startsWith("/projects") &&
            !currentTab
          ) {
            isActive = true;
          }

          return (
            <Link
              key={link.label}
              href={link.href as Route}
              className="relative rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap sm:px-3"
            >
              {isActive && (
                <motion.span
                  layoutId="nav-bubble"
                  className="absolute inset-0 rounded-full bg-primary/25 ring-1 ring-primary/40 shadow-sm shadow-primary/20"
                  style={{ borderRadius: 9999 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 28,
                    mass: 0.6,
                  }}
                />
              )}
              <span
                className={`relative z-10 transition-colors duration-200 ${
                  isActive
                    ? "text-primary font-semibold drop-shadow-sm"
                    : "text-muted-foreground/60 hover:text-foreground"
                }`}
              >
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
