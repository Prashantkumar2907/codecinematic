const structuralStarts = [
  "function",
  "def",
  "class",
  "export default",
  "export const",
  "const",
  "async function",
  "app.",
  "router."
];

const importantWords = ["auth", "api", "middleware", "handler", "validate", "schema", "token", "session", "jwt", "fetch"];

export type FocusLine = {
  line: number;
  score: number;
  rule: string;
  caption?: string;
};

export function detectImportantLines(rawCode: string) {
  const lines = rawCode.split("\n");
  const results: FocusLine[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let score = 0;
    let rule = "default";

    if (structuralStarts.some((prefix) => trimmed.startsWith(prefix))) {
      score += 5;
      rule = "declaration";
    }

    if (importantWords.some((word) => trimmed.toLowerCase().includes(word))) {
      score += 3;
      rule = rule === "default" ? "keyword-match" : `${rule}+keyword-match`;
    }

    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
      score += 4;
      rule = "explanation-comment";
    }

    if (score >= 4) {
      results.push({
        line: index + 1,
        score,
        rule,
        caption: trimmed.startsWith("//") || trimmed.startsWith("#") ? trimmed.replace(/^\/\/|^#/, "").trim() : undefined
      });
    }
  });

  return results;
}
