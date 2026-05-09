import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { PLAN_CONFIG } from "@/lib/plans";
import { NavLinks } from "./nav-links";
import { ProfileMenu } from "./profile-menu";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shadow-sm shadow-black/10">
      <div className="grid h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 sm:gap-3 sm:px-5">
        {/* Left: logo */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-foreground/80 transition-colors hover:text-foreground"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all shadow-lg shadow-primary/20" />
          <span className="hidden sm:inline">CodeCinematic</span>
          <span className="sm:hidden">CC</span>
        </Link>

        {/* Center: nav tabs */}
        <div className="flex min-w-0 justify-center overflow-hidden">
          <NavLinks isLoggedIn={!!session} />
        </div>

        {/* Right: profile or sign in */}
        <div className="flex items-center justify-end">
          {session ? (
            <ProfileMenu
              email={session.email}
              planLabel={PLAN_CONFIG[session.plan].name}
              isAdmin={session.isAdmin}
            />
          ) : (
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-7 text-[10px] px-4 rounded-full font-medium shadow-sm shadow-primary/10 hover:shadow-primary/20 transition-all",
              )}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
