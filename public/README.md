# public/

Static assets served at the site root.

## music.mp3 — the background bed (optional, not committed)

`src/studio/engine.ts` fetches `/music.mp3` at the start of every render and
mixes it under the narration at `MUSIC_GAIN` (~-22 dBFS), looped, with an 0.8 s
fade in and a 1.5 s fade out. If the file is absent the render logs a warning and
continues with narration over silence.

Drop a licensed track here as `music.mp3` to enable it. It is deliberately not
committed — pick one you have the rights to publish on YouTube.

Notes:
- The bed is **not** ducked under speech (out of scope), so the track must be
  quiet and static — no vocals, no strong transients, no melodic hooks.
- It loops, so a track with a clean loop point beats a track that fades out.
