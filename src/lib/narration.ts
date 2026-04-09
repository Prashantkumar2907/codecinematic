/** Narration segment — maps a range of code lines to spoken commentary. */
export type NarrationSegment = {
  /** First line number (1-based, inclusive). */
  lineStart: number;
  /** Last line number (1-based, inclusive). */
  lineEnd: number;
  /** The narration text to speak while these lines type. */
  text: string;
};

/** Full narration for a project. */
export type Narration = {
  /** Short intro spoken before code starts typing. */
  intro: string;
  /** Per-line-range commentary segments. */
  segments: NarrationSegment[];
  /** Short outro spoken after all code is typed. */
  outro: string;
};
