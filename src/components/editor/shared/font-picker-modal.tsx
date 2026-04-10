"use client";

import { Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FONT_CATALOG } from "./font-catalog";

interface FontPickerModalProps {
  currentFont: string;
  onSelect: (font: string) => void;
  onClose: () => void;
  sampleText: string;
}

export function FontPickerModal({
  currentFont,
  onSelect,
  onClose,
  sampleText,
}: FontPickerModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md max-h-[70vh] border-white/10 bg-background shadow-2xl dark:bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="py-2.5 px-4 border-b border-white/5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Type className="h-4 w-4 text-primary" />
            Choose Font
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 overflow-y-auto max-h-[55vh] space-y-1">
          {FONT_CATALOG.map((font) => (
            <button
              key={font.name}
              type="button"
              onClick={() => onSelect(font.name)}
              className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/50 ${
                currentFont === font.name
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {font.name}
                </span>
                <span className="text-[9px] text-muted-foreground/60">{font.style}</span>
              </div>
              <p
                className="text-lg truncate"
                style={{ fontFamily: `"${font.name}", ${font.style}` }}
              >
                {sampleText}
              </p>
              <p
                className="text-xs text-muted-foreground italic truncate mt-0.5"
                style={{ fontFamily: `"${font.name}", ${font.style}` }}
              >
                The quick brown fox jumps over the lazy dog
              </p>
            </button>
          ))}
        </CardContent>
        <div className="p-2 border-t border-white/5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
