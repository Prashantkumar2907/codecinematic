export const renderPresets = {
  "9:16": {
    width: 1080,
    height: 1920,
    fontSize: 26,
    lineHeight: 1.7,
    padding: 32,
    maxVisibleLines: 14,
    captionPosition: "bottom"
  },
  "16:9": {
    width: 1920,
    height: 1080,
    fontSize: 24,
    lineHeight: 1.6,
    padding: 40,
    maxVisibleLines: 18,
    captionPosition: "right"
  }
} as const;
