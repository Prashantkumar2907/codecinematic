"use client";

import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { BG_PRESETS, type BgPreset } from "./canvas-utils";

interface BgPickerProps {
  selectedId: string;
  onSelect: (preset: BgPreset) => void;
  uploadedImageUrl: string | null;
  onImageUpload: (file: File) => void;
  onImageClear: () => void;
  presets?: BgPreset[];
}

export function BgPicker({
  selectedId,
  onSelect,
  uploadedImageUrl,
  onImageUpload,
  onImageClear,
  presets = BG_PRESETS,
}: BgPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImageUpload(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground">BACKGROUND</span>
        {uploadedImageUrl && (
          <button
            type="button"
            onClick={onImageClear}
            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors"
          >
            <X className="h-3 w-3" /> Clear image
          </button>
        )}
      </div>

      {/* Uploaded image preview */}
      {uploadedImageUrl && (
        <div className="relative rounded-md overflow-hidden border border-primary/30 h-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={uploadedImageUrl}
            alt="Custom background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">
              Custom image active
            </span>
          </div>
        </div>
      )}

      {/* Gradient preset grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.label}
            aria-label={preset.label}
            onClick={() => onSelect(preset)}
            className={`relative h-8 rounded-md border-2 transition-all overflow-hidden ${
              selectedId === preset.id && !uploadedImageUrl
                ? "border-primary shadow-md scale-105"
                : "border-transparent hover:border-white/20"
            }`}
            style={{ background: preset.preview }}
          >
            {selectedId === preset.id && !uploadedImageUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-md" />
              </div>
            )}
          </button>
        ))}

        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Upload custom image"
          className={`h-8 rounded-md border-2 border-dashed flex items-center justify-center transition-colors ${
            uploadedImageUrl
              ? "border-primary bg-primary/10"
              : "border-white/20 hover:border-primary/50 bg-transparent"
          }`}
        >
          <Upload className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* Preset label */}
      {!uploadedImageUrl && (
        <p className="text-[9px] text-muted-foreground/60 text-center">
          {presets.find((p) => p.id === selectedId)?.label ?? ""}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
