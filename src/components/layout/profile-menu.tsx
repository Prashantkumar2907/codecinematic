"use client";

import { useState, useRef, useEffect } from "react";
import { User, LogOut, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileMenuProps {
  email: string;
  planLabel: string;
  isAdmin: boolean;
}

export function ProfileMenu({ email, planLabel, isAdmin }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        aria-label="Profile menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 hover:border-primary/50 transition-all duration-200 shadow-sm shadow-primary/10"
      >
        <User className="h-4 w-4 text-primary" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" as const }}
            className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-white/[0.08] bg-background/95 backdrop-blur-xl shadow-xl shadow-black/30 overflow-hidden z-50"
          >
            {/* Account info */}
            <div className="px-3 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] font-medium text-foreground truncate">{email}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Crown className="h-3 w-3 text-primary/70" />
                <span className="text-[10px] text-muted-foreground">{planLabel}</span>
                {isAdmin && (
                  <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-1.5 py-px font-medium">
                    Admin
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-1">
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
