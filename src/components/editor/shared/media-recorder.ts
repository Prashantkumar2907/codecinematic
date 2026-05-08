export function pickWebmMimeType(preferAudio = false): string | null {
  if (typeof MediaRecorder === "undefined") return null;

  const candidates = preferAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ]
    : [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

export function createWebmRecorder(
  stream: MediaStream,
  options: MediaRecorderOptions = {},
  preferAudio = false,
): MediaRecorder {
  const mimeType = pickWebmMimeType(preferAudio);
  const preferredOptions: MediaRecorderOptions = {
    ...options,
    ...(mimeType ? { mimeType } : {}),
  };

  try {
    return new MediaRecorder(stream, preferredOptions);
  } catch {
    if (mimeType) {
      try {
        return new MediaRecorder(stream, { mimeType });
      } catch {
        // Fall through to the browser default below.
      }
    }

    return new MediaRecorder(stream);
  }
}

export function createWebmBlob(chunks: BlobPart[], mimeType?: string | null): Blob {
  return new Blob(chunks, { type: mimeType || "video/webm" });
}
