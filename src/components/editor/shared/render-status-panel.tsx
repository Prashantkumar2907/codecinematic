import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

type RenderStatus = "empty" | "loading" | "error" | "success";

type RenderStatusPanelProps = {
  status: RenderStatus;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

const statusStyles: Record<RenderStatus, string> = {
  empty: "border-dashed border-border/60 bg-muted/15 text-muted-foreground",
  loading: "border-primary/25 bg-primary/5 text-primary",
  error: "border-destructive/35 bg-destructive/10 text-destructive",
  success: "border-primary/30 bg-primary/5 text-primary",
};

export function RenderStatusPanel({
  status,
  title,
  description,
  action,
  className,
}: RenderStatusPanelProps) {
  const Icon = status === "loading"
    ? Loader2
    : status === "error"
      ? AlertCircle
      : status === "success"
        ? CheckCircle2
        : Inbox;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors duration-200",
        statusStyles[status],
        className,
      )}
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "loading" || status === "error" ? "polite" : "off"}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", status === "loading" && "animate-spin")} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          {description ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p> : null}
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
