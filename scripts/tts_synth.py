"""Batch edge-tts synthesis with per-word timings.

Why this exists rather than `python -m edge_tts` per segment (which is what
`api/studio/tts/route.ts` used to do):

  1. Word timings are unreachable from the CLI. `Communicate` takes
     `boundary="WordBoundary"`, the CLI exposes no `--boundary` flag, and the
     default is `SentenceBoundary` — so `--write-subtitles` only ever emitted one
     cue per sentence. See improvement_plan.md §12a (SPIKE row 12.1).
  2. One process voices the whole batch. The old route spawned a Python
     interpreter per beat — up to 160 of them for one long script.

Protocol: a JSON request on stdin, a JSON response on stdout. Audio goes to
files (not stdout) so a 160-beat batch does not push megabytes through a pipe.

  in   {"outDir": str,
        "voice": str, "rate"?: str, "pitch"?: str, "volume"?: str,
        "segments": [{"id": str, "text": str,
                      "voice"?, "rate"?, "pitch"?, "volume"?}]}
  out  {"segments": [{"id": str, "file": str,
                      "words": [{"t": str, "startMs": float, "durationMs": float}]}]}
  err  {"error": str}  with a non-zero exit code

A segment that fails every attempt fails the whole batch on purpose: a video
silently missing one beat's audio is worse than a visible error.
"""

import asyncio
import json
import os
import sys

import edge_tts

CONCURRENCY = 4
SEGMENT_TIMEOUT_S = 30
ATTEMPTS = 2

# edge-tts reports offsets in 100-nanosecond ticks.
TICKS_PER_MS = 10_000


async def synth_one(seg, defaults, out_dir, index):
    text = seg["text"]
    kwargs = {
        "rate": seg.get("rate") or defaults.get("rate") or "+0%",
        "volume": seg.get("volume") or defaults.get("volume") or "+0%",
        "pitch": seg.get("pitch") or defaults.get("pitch") or "+0Hz",
    }
    voice = seg.get("voice") or defaults["voice"]
    path = os.path.join(out_dir, f"{index}.mp3")

    last_err = None
    for _ in range(ATTEMPTS):
        try:
            audio = bytearray()
            words = []
            stream = edge_tts.Communicate(
                text, voice, boundary="WordBoundary", **kwargs
            ).stream()
            async def drain():
                async for chunk in stream:
                    if chunk["type"] == "audio":
                        audio.extend(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        words.append({
                            "t": chunk["text"],
                            "startMs": chunk["offset"] / TICKS_PER_MS,
                            "durationMs": chunk["duration"] / TICKS_PER_MS,
                        })
            await asyncio.wait_for(drain(), timeout=SEGMENT_TIMEOUT_S)
            if not audio:
                raise RuntimeError("edge-tts returned no audio")
            with open(path, "wb") as fh:
                fh.write(bytes(audio))
            return {"id": seg["id"], "file": path, "words": words}
        except Exception as err:  # noqa: BLE001 — retried, then surfaced verbatim
            last_err = err
    raise RuntimeError(f'"{text[:60]}...": {type(last_err).__name__}: {last_err}')


async def main():
    req = json.loads(sys.stdin.read())
    segments = req["segments"]
    out_dir = req["outDir"]
    defaults = {k: req.get(k) for k in ("voice", "rate", "pitch", "volume")}

    sem = asyncio.Semaphore(CONCURRENCY)

    async def guarded(seg, i):
        async with sem:
            return await synth_one(seg, defaults, out_dir, i)

    results = await asyncio.gather(*(guarded(s, i) for i, s in enumerate(segments)))
    json.dump({"segments": results}, sys.stdout)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:  # noqa: BLE001 — the route reads this as the failure reason
        json.dump({"error": f"{type(err).__name__}: {err}"}, sys.stdout)
        sys.exit(1)
