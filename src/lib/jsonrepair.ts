/**
 * Best-effort repair of a truncated or slightly-malformed JSON document from the
 * model. Gemini caps output at MAX_OUTPUT_TOKENS; a long script that hits the cap
 * arrives with an unterminated string and unclosed arrays/objects, which throws in
 * JSON.parse and — before this — killed the whole generation attempt (issues #29,
 * #30). This closes what the truncation left open so the partial script can still
 * parse; the schema/repair loop downstream fills or fixes anything missing.
 *
 * It is a backstop, not a parser: it does not validate, and on input it cannot make
 * sense of it returns the string unchanged so the caller's JSON.parse throws as before.
 */

/** Trim anything before the first `{`/`[`. */
function sliceToJson(text: string): string {
  const start = text.search(/[{[]/);
  return start < 0 ? text : text.slice(start);
}

/**
 * Walk the text tracking string/escape state and the bracket stack, then close
 * whatever a mid-token truncation left open. Handles the shapes a cut-off Gemini
 * response takes: cut inside a string, after a dangling `:` (key with no value),
 * and a dangling object key or trailing comma. The stack's top container type
 * disambiguates a dangling object key (needs a value) from a valid array element.
 */
export function repairJson(text: string): string {
  const sliced = sliceToJson(text.trim());
  const stack: string[] = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < sliced.length; i++) {
    const c = sliced[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }

  let out = sliced;
  if (inStr) out += '"'; // truncated inside a string — close it
  out = out.replace(/\s+$/, "");

  // A key whose value was cut before it started: `"say":` → give it a null value.
  if (/:\s*$/.test(out)) out += "null";

  // Clean up trailing junk the cut left behind. Loop because stripping a dangling
  // key can expose the comma that preceded it. Only strip a trailing string-as-key
  // when the innermost open container is an object — inside an array the same string
  // is a valid element and must be kept.
  let prev: string;
  do {
    prev = out;
    out = out.replace(/,\s*$/, "");
    if (stack[stack.length - 1] === "{") {
      out = out.replace(/(\{|,)\s*"(?:[^"\\]|\\.)*"\s*$/, "$1");
    }
  } while (out !== prev);
  out = out.replace(/,\s*$/, "");

  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === "{" ? "}" : "]";
  }
  return out;
}
