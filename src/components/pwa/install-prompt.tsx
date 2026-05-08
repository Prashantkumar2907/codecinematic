"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "codecinematic:pwa-install-dismissed-at";
const DISMISS_TTL = 1000 * 60 * 60 * 24 * 7;

function isDismissedRecently() {
  try {
    const value = window.localStorage.getItem(DISMISS_KEY);
    return value ? Date.now() - Number(value) < DISMISS_TTL : false;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isLocalHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);

  const isAppRoute = useMemo(
    () => pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/dashboard") || pathname.startsWith("/projects"),
    [pathname]
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  useEffect(() => {
    const ios = isIosDevice();
    setIsIos(ios);

    const localHost = isLocalHost();
    if (!isAppRoute || (!localHost && isStandaloneMode()) || isDismissedRecently()) {
      setVisible(false);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, 900);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [isAppRoute, pathname]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setVisible(false);
  }

  function handleDismiss() {
    rememberDismissal();
    setVisible(false);
  }

  if (!visible || !isAppRoute) return null;

  return (
    <div className="sticky top-14 z-40 mx-2 mt-2 max-w-3xl rounded-lg border border-primary/30 bg-background/95 p-2.5 shadow-xl shadow-black/30 backdrop-blur sm:mx-auto sm:p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            {isIos ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5 text-foreground">Install CodeCinematic</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {isIos
                ? "On iOS, use Share, then Add to Home Screen for a full-screen app."
                : deferredPrompt
                  ? "Add it to your device for a faster, full-screen workspace."
                  : "Use your browser install option for a faster, full-screen workspace."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isIos && deferredPrompt ? (
            <Button type="button" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={handleInstall}>
              Install
            </Button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={handleDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
