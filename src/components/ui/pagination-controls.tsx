"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

type PaginationControlsProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
};

function getVisiblePages(page: number, pageCount: number) {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  return [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
}

export function PaginationControls({
  page,
  pageCount,
  onPageChange,
  itemLabel,
  className,
}: PaginationControlsProps) {
  if (pageCount <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), pageCount);
  const pages = getVisiblePages(safePage, pageCount);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5", className)}>
      <span className="min-w-0 text-[10px] font-medium text-muted-foreground">
        Page {safePage} of {pageCount}{itemLabel ? ` - ${itemLabel}` : ""}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((value, index) => {
          const hasGap = index > 0 && value - pages[index - 1]! > 1;
          return (
            <span key={value} className="flex items-center gap-1">
              {hasGap ? <span className="px-0.5 text-[10px] text-muted-foreground/70">...</span> : null}
              <button
                type="button"
                aria-label={`Go to page ${value}`}
                aria-current={value === safePage ? "page" : undefined}
                onClick={() => onPageChange(value)}
                className={cn(
                  "h-7 min-w-7 rounded-md border px-2 text-[11px] font-semibold transition",
                  value === safePage
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {value}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
          disabled={safePage === pageCount}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
