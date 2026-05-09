"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Github, Loader2, AlertCircle, Code2, Film, Zap, BookOpen, Crown } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { DEMO_PREMIUM_EMAIL, DEMO_PREMIUM_PASSWORD } from "@/lib/demo-account";
import { getSafeRedirectPath } from "@/lib/session-cookie";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "invalid-provider": "Unknown authentication provider.",
  "oauth-missing-code": "Social login did not return a verification code. Please try again.",
  "supabase-not-configured": "Social login is not yet configured. Please sign in with email and password.",
  "oauth-failed": "Social login failed. Please try again or use email login.",
  "supabase-unavailable": "Password login is not configured for this account. Use the Premium demo button or enable Supabase auth.",
  "rate-limited": "Too many sign-in attempts. Please wait a few minutes and try again.",
};

const features = [
  { icon: Code2, label: "Code Studio", desc: "Type code cinematically with syntax highlighting" },
  { icon: Film, label: "Export Video", desc: "Download 9:16 or 16:9 WebM for social media" },
  { icon: BookOpen, label: "Word of Day", desc: "Create beautiful word definition reveal videos" },
  { icon: Zap, label: "Did You Know?", desc: "Animate facts and quotes into engaging shorts" },
];

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = getSafeRedirectPath(searchParams.get("next"));
  const socialNextParam = encodeURIComponent(nextPath);
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (AUTH_ERROR_MESSAGES[urlError] ?? "An error occurred. Please try again.") : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);

    try {
      const res = await fetch("/api/auth/demo-login", { method: "POST", body: formData });
      let data: { ok?: boolean; error?: string | { code?: string; message?: string } } = {};
      try { data = await res.json() as typeof data; } catch { data = { ok: false, error: "Unexpected server response." }; }

      if (data.ok) { window.location.href = nextPath; return; }

      const errorCode = typeof data.error === "string" ? "" : data.error?.code ?? "";
      const rawError = typeof data.error === "string" ? data.error : data.error?.message ?? "";
      if (errorCode === "rate_limited") {
        setError(AUTH_ERROR_MESSAGES["rate-limited"]);
      } else if (errorCode === "not_configured" || rawError.toLowerCase().includes("supabase") || rawError.toLowerCase().includes("not configured")) {
        setError(AUTH_ERROR_MESSAGES["supabase-unavailable"]);
      } else if (rawError.toLowerCase().includes("invalid") || rawError.toLowerCase().includes("wrong")) {
        setError("Incorrect email or password. Please try again.");
      } else if (rawError) {
        setError(rawError);
      } else {
        setError("Sign in failed. Please check your credentials.");
      }
    } catch {
      setError("Unable to reach authentication service. Check your network and try again.");
    } finally {
      setLoading(false);
    }
  }

  function usePremiumDemo() {
    setEmail(DEMO_PREMIUM_EMAIL);
    setPassword(DEMO_PREMIUM_PASSWORD);
    setError(null);
  }

  return (
    <div className="flex-1 grid lg:grid-cols-2 overflow-hidden">
      {/* Left - branding panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden bg-[linear-gradient(135deg,#080c12_0%,#0c1118_48%,#10161c_100%)]">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,rgba(45,212,191,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />

        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-lg shadow-primary/40" />
          <span className="text-[13px] font-bold tracking-widest uppercase text-foreground/80">CodeCinematic</span>
        </div>

        {/* Tagline */}
        <div className="relative z-10 space-y-6">
          <p className="text-3xl font-semibold leading-snug tracking-tight text-foreground/90">
            Turn code into<br />
            <span className="text-gradient">cinematic videos</span>
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Write code, add narration, and export stunning typing videos for TikTok, Reels, and Shorts.
          </p>

          {/* Feature list */}
          <div className="space-y-3 pt-2">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-3 group">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/10 group-hover:bg-primary/15 transition-colors shrink-0">
                  <f.icon className="h-3.5 w-3.5 text-primary/80" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground/80">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note */}
        <p className="text-[11px] text-muted-foreground/40 relative z-10">
          (c) 2026 CodeCinematic. All rights reserved.
        </p>
      </div>

      {/* Right - form */}
      <div className="flex items-center justify-center px-6 py-10 bg-background">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[12px] font-bold tracking-widest uppercase text-foreground/70">CodeCinematic</span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to your CodeCinematic account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10 bg-card border-border/60 placeholder:text-muted-foreground/40 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-10 pr-10 bg-card border-border/60 placeholder:text-muted-foreground/40 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" aria-label="Sign in with email" className="w-full h-10 font-semibold group glow-primary-sm hover:glow-primary transition-all" disabled={loading}>
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><span>Sign in</span><ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
              }
            </Button>

            <button
              type="button"
              onClick={usePremiumDemo}
              className="flex w-full items-center justify-between rounded-md border border-primary/25 bg-primary/8 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/12"
            >
              <span className="flex items-center gap-2 font-semibold text-primary">
                <Crown className="h-3.5 w-3.5" />
                Premium demo
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{DEMO_PREMIUM_EMAIL}</span>
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
            <div className="relative flex justify-center text-[11px]"><span className="bg-background px-3 text-muted-foreground/60">or continue with</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a
              href={`/api/auth/social?provider=google&next=${socialNextParam}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full h-9 border-border/60 hover:bg-card hover:border-border text-xs transition-all",
              )}
            >
              <svg className="mr-2 h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </a>
            <a
              href={`/api/auth/social?provider=github&next=${socialNextParam}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full h-9 border-border/60 hover:bg-card hover:border-border text-xs transition-all",
              )}
            >
              <Github className="mr-2 h-3.5 w-3.5" />GitHub
            </a>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/40">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-muted-foreground transition-colors">Terms</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-muted-foreground transition-colors">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
