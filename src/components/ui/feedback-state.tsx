"use client";

import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

type FeedbackStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export function LoadingState({ title, description, className }: FeedbackStateProps) {
  return (
    <div className={cn("flex min-h-[18rem] items-center justify-center px-4", className)}>
      <div className="animate-surface-in w-full max-w-3xl rounded-lg border border-border/50 bg-card/60 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, className }: FeedbackStateProps) {
  return (
    <div className={cn("flex min-h-[14rem] items-center justify-center px-4", className)}>
      <div className="animate-surface-in max-w-sm rounded-lg border border-dashed border-border/70 bg-card/40 p-5 text-center">
        <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: FeedbackStateProps & { onRetry?: () => void }) {
  return (
    <div className={cn("flex min-h-[18rem] items-center justify-center px-4", className)}>
      <div className="animate-surface-in max-w-md rounded-lg border border-destructive/30 bg-destructive/8 p-5 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
        <p className="mt-3 text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" className="mt-4 h-8 gap-2 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
