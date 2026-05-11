export type CanvasCaptureTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

export type CanvasCapture = {
  stream: MediaStream;
  track: CanvasCaptureTrack;
  manualFrameCapture: boolean;
  requestFrame: () => void;
  stop: () => void;
};

export function captureCanvasStream(canvas: HTMLCanvasElement, fallbackFps = 30): CanvasCapture {
  if (typeof canvas.captureStream !== "function") {
    throw new Error("Canvas captureStream is not available in this browser.");
  }

  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0] as CanvasCaptureTrack | undefined;
  let manualFrameCapture = typeof track?.requestFrame === "function";

  if (!track || !manualFrameCapture) {
    stopMediaStream(stream);
    stream = canvas.captureStream(fallbackFps);
    track = stream.getVideoTracks()[0] as CanvasCaptureTrack | undefined;
    manualFrameCapture = false;
  }

  if (!track) {
    stopMediaStream(stream);
    throw new Error("Could not create a canvas video track.");
  }

  return {
    stream,
    track,
    manualFrameCapture,
    requestFrame() {
      if (manualFrameCapture) {
        track.requestFrame?.();
      }
    },
    stop() {
      stopMediaStream(stream);
    },
  };
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function stopRecorder(recorder: MediaRecorder | null | undefined) {
  if (!recorder || recorder.state === "inactive") return;
  try {
    recorder.stop();
  } catch {
    // The browser may throw if the recorder is already transitioning to inactive.
  }
}

export function closeImageBitmapSafely(image: ImageBitmap | null | undefined) {
  try {
    image?.close();
  } catch {
    // Older browsers may not support close() on ImageBitmap.
  }
}
