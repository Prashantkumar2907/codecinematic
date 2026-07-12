import type { CodeLang } from "./schema";

export type Token = { text: string; color: string };

export const CODE_COLORS = {
  comment: "#7dd3a8",
  string: "#fda4af",
  keyword: "#c084fc",
  builtin: "#7dd3fc",
  number: "#facc15",
  bracket: "#c084fc",
  punct: "#94a3b8",
  operator: "#f97316",
  type: "#4ade80",
  plain: "#e6edf3",
} as const;

const KEYWORDS: Record<string, string[]> = {
  js: "import export from default const let var function return async await class new extends if else for while do switch case break continue try catch finally throw typeof instanceof in of void delete yield super this null undefined true false static get set".split(" "),
  ts: "import export from default const let var function return async await class new extends implements interface type enum if else for while do switch case break continue try catch finally throw typeof instanceof in of void delete yield super this null undefined true false readonly public private protected static abstract as satisfies keyof infer never unknown any string number boolean get set".split(" "),
  python: "def class import from as return yield lambda if elif else for while break continue try except finally raise with pass global nonlocal assert del not and or in is None True False async await self match case".split(" "),
  sql: "select from where insert into values update set delete create table index unique primary key foreign references drop alter add column join inner left right outer on group by order having limit offset distinct as and or not null default between like in exists union all case when then else end begin commit rollback explain analyze vacuum".split(" "),
  bash: "if then else elif fi for do done while case esac function return exit export local echo cd set read shift".split(" "),
  yaml: [],
  text: [],
};

const BUILTINS: Record<string, string[]> = {
  js: "console log warn error map filter reduce forEach find includes push pop shift slice splice length JSON parse stringify Object keys values entries assign freeze Promise resolve reject then catch setTimeout Math Array String Number Boolean prototype hasOwnProperty bind call apply require module exports".split(" "),
  ts: "console log warn error map filter reduce forEach find includes push pop shift slice splice length JSON parse stringify Object keys values entries assign freeze Promise resolve reject then catch setTimeout Math Array String Number Boolean prototype hasOwnProperty bind call apply".split(" "),
  python: "print len range enumerate zip dict list set tuple str int float bool type isinstance super sorted sum min max abs open input map filter any all getattr setattr hasattr id repr iter next".split(" "),
  sql: "count sum avg min max coalesce now current_timestamp cast concat lower upper substr round".split(" "),
  bash: "docker kubectl git curl grep awk sed sudo apt npm node python pip ls cat mkdir rm cp mv chmod tail head ps kill".split(" "),
  yaml: [],
  text: [],
};

function commentPrefixes(lang: CodeLang): string[] {
  switch (lang) {
    case "python":
    case "bash":
    case "yaml":
      return ["#"];
    case "sql":
      return ["--"];
    case "text":
      return [];
    default:
      return ["//", "/*", "*"];
  }
}

const STRING_RE = /^("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/;
const NUMBER_RE = /^\d+(\.\d+)?/;
const BRACKET_RE = /^[{}()[\]]/;
const PUNCT_RE = /^[.,:;]/;
const OPERATOR_RE = /^(=>|===|!==|==|!=|>=|<=|&&|\|\||\?\?|\+\+|--|\+=|-=|\*=|\/=|->|\||[+\-*/%!<>=&?~^@$])/;
const TYPE_NAME_RE = /^[A-Z][a-zA-Z0-9_]*/;
const IDENT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*/;

export function tokenizeLine(line: string, lang: CodeLang): Token[] {
  const trimmed = line.trimStart();
  if (commentPrefixes(lang).some((p) => trimmed.startsWith(p))) {
    return [{ text: line, color: CODE_COLORS.comment }];
  }
  if (lang === "yaml") return tokenizeYaml(line);

  const keywords = new Set(KEYWORDS[lang] ?? []);
  const builtins = new Set(BUILTINS[lang] ?? []);
  const foldCase = lang === "sql";

  const tokens: Token[] = [];
  let rest = line;
  while (rest.length > 0) {
    let match: RegExpMatchArray | null;
    if ((match = rest.match(STRING_RE))) {
      tokens.push({ text: match[0], color: CODE_COLORS.string });
    } else if ((match = rest.match(NUMBER_RE))) {
      tokens.push({ text: match[0], color: CODE_COLORS.number });
    } else if ((match = rest.match(IDENT_RE)) || (match = rest.match(TYPE_NAME_RE))) {
      const word = foldCase ? match[0].toLowerCase() : match[0];
      const color = keywords.has(word)
        ? CODE_COLORS.keyword
        : builtins.has(word)
          ? CODE_COLORS.builtin
          : /^[A-Z]/.test(match[0])
            ? CODE_COLORS.type
            : CODE_COLORS.plain;
      tokens.push({ text: match[0], color });
    } else if ((match = rest.match(BRACKET_RE))) {
      tokens.push({ text: match[0], color: CODE_COLORS.bracket });
    } else if ((match = rest.match(PUNCT_RE))) {
      tokens.push({ text: match[0], color: CODE_COLORS.punct });
    } else if ((match = rest.match(OPERATOR_RE))) {
      tokens.push({ text: match[0], color: CODE_COLORS.operator });
    } else {
      const ch = rest.match(/^./u)?.[0] ?? rest[0];
      tokens.push({ text: ch, color: CODE_COLORS.plain });
      rest = rest.slice(ch.length);
      continue;
    }
    rest = rest.slice(match[0].length);
  }
  return tokens;
}

function tokenizeYaml(line: string): Token[] {
  const keyMatch = line.match(/^(\s*)([\w.-]+)(:)(.*)$/);
  if (!keyMatch) return [{ text: line, color: CODE_COLORS.plain }];
  const [, indent, key, colon, value] = keyMatch;
  const tokens: Token[] = [];
  if (indent) tokens.push({ text: indent, color: CODE_COLORS.plain });
  tokens.push({ text: key, color: CODE_COLORS.builtin });
  tokens.push({ text: colon, color: CODE_COLORS.punct });
  if (value) {
    const color = /^\s*\d+(\.\d+)?\s*$/.test(value)
      ? CODE_COLORS.number
      : /^\s*(true|false|null)\s*$/.test(value)
        ? CODE_COLORS.keyword
        : CODE_COLORS.string;
    tokens.push({ text: value, color });
  }
  return tokens;
}
