import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDemoSession } from "@/lib/demo-auth";

export async function SiteHeader() {
  const session = await getDemoSession();

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.22em] text-foreground/90 uppercase">
          <span className="h-3 w-3 rounded-full bg-primary" />
          CodeCinematic
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/pricing">Pricing</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/projects/demo-project">Demo Editor</Link>
        </nav>

        <div className="flex items-center gap-3">
          {session ? <Badge>{session.plan} demo</Badge> : null}
          <Link href={session ? "/dashboard" : "/login"}>
            <Button variant={session ? "secondary" : "default"} size="sm">
              {session ? "Open app" : "Login"}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
