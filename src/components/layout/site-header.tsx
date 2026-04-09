import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { PLAN_CONFIG } from "@/lib/plans";
import { NavLinks } from "./nav-links";
import { ProfileMenu } from "./profile-menu";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shadow-sm shadow-black/10">
      <div className="grid grid-cols-[auto_1fr_auto] h-12 items-center px-3 sm:px-5 gap-3">
        {/* Left: logo */}
        <Link
          href="/"
          className="group flex items-center gap-2 text-[13px] font-bold tracking-widest uppercase text-foreground/80 hover:text-foreground transition-colors shrink-0"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all shadow-lg shadow-primary/20" />
          CodeCinematic
        </Link>

        {/* Center: nav tabs */}
        <div className="flex justify-center">
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
            <Link href="/login">
              <Button
                size="sm"
                className="h-7 text-[10px] px-4 rounded-full font-medium shadow-sm shadow-primary/10 hover:shadow-primary/20 transition-all"
              >
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
