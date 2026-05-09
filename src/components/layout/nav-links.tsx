"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const links = isLoggedIn ? [...publicLinks, ...authLinks] : publicLinks;

  useEffect(() => {
    setOpen(false);
  }, [pathname, currentTab]);

  function isLinkActive(link: (typeof links)[number]) {
    const base = link.href.split("?")[0];

    if (link.tab) {
      return pathname.startsWith("/projects") && currentTab === link.tab;
    }

    if (base === "/dashboard") {
      return pathname.startsWith("/dashboard");
    }

    if (base === "/pricing") {
      return pathname === "/pricing";
    }

    return false;
  }

  return (
    <>
      <div className="relative sm:hidden">
        <button
          type="button"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        {open ? (
          <nav className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-background/95 p-1.5 shadow-xl shadow-black/30 backdrop-blur-xl">
            {links.map((link) => {
              const isActive =
                isLinkActive(link) ||
                (link.tab === "editor" && pathname.startsWith("/projects") && !currentTab);

              return (
                <Link
                  key={link.label}
                  href={link.href as Route}
                  className={`block rounded-md px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>

      <LayoutGroup>
        <nav className="hidden w-full max-w-full items-center justify-center gap-0.5 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04] px-1 py-0.5 sm:flex">
          {links.map((link) => {
            const isActive =
              isLinkActive(link) ||
              (link.tab === "editor" && pathname.startsWith("/projects") && !currentTab);

            return (
              <Link
                key={link.label}
                href={link.href as Route}
                className="relative whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium sm:px-3"
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-bubble"
                    className="absolute inset-0 rounded-full bg-primary/25 shadow-sm shadow-primary/20 ring-1 ring-primary/40"
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
                      ? "font-semibold text-primary drop-shadow-sm"
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
    </>
  );
}
