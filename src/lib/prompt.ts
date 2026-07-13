import type { Subject } from "@/lib/state";

const SCENE_SHAPE = `
Scene kinds (every scene has "kind" and a unique kebab-case "id"). Narration is split into BEATS —
each beat is one spoken chunk ("say"/"narration", 1-2 sentences, <=320 chars) that plays EXACTLY while
its visual element appears. Write every beat about the element it accompanies and nothing else.

- {"kind":"bigtext","narration":"...","text":"<=80 chars","sub":"<=110 optional"} — hook or section card
- {"kind":"bullets","sayIntro":"optional lead-in","title":"<=60","items":[{"text":"<=110","say":"spoken while THIS item appears"}, 2-5 items]}
- {"kind":"code","sayIntro":"optional setup line spoken over an empty editor","lang":"js|ts|python|sql|bash|yaml|text","title":"filename or panel title","code":"<=22 lines, EVERY line <=46 chars","segments":[{"fromLine":1,"toLine":4,"say":"spoken while lines 1-4 type"}, ...contiguous, covering every line exactly once],"focusLines":[optional emphasis],"expectedOutput":"exact stdout if executable code prints"} — typing panel; with lang "text" it is a typed worked-example/derivation panel
- {"kind":"terminal","narration":"...","lines":["$ command","output", 1-10 lines, each <=60 chars]}
- {"kind":"diagram","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=28","x":0-11,"y":0-11,"w":2-12,"h":1-4,"accent":bool}],"arrows":[{"from","to","label":"<=24 optional"}],"steps":[{"reveal":[node ids],"highlight":[node ids],"say":"spoken while THIS step reveals/highlights"}, 1-8 steps]} — 12x12 grid, nodes must not overlap; tell the story step by step (also perfect for timelines, maps-as-boxes, flows, hierarchies)
- {"kind":"compare","sayIntro":"optional","title":"<=60","left":{"title":"<=30","items":["<=70",1-4],"say":"spoken while the LEFT panel shows"},"right":{same with its own "say"},"verdict":"<=110 optional","sayVerdict":"spoken while the verdict appears"}
- {"kind":"question","narration":"...","text":"<=180","hint":"<=110 optional"} — ending challenge for comments
- {"kind":"timeline","sayIntro":"optional","title":"<=60","events":[{"when":"<=18 date/era/marker","label":"<=52","say":"spoken as THIS event appears"}, 2-6 chronological events]} — dated vertical spine; ideal for history, the evolution of an idea, a sequence of events
- {"kind":"stat","narration":"...","value":"<=14 (e.g. \\"₹1.2 Cr\\", \\"40%\\", \\"8 min\\", \\"1 in 9\\")","label":"<=60 what the number measures","context":"<=100 optional framing"} — ONE huge number made visceral; use for a stunning figure or the payoff of a calculation
- {"kind":"steps","sayIntro":"optional","title":"<=60","steps":[{"text":"<=80","detail":"<=90 optional sub-line","say":"spoken as THIS step appears"}, 2-5 ordered steps]} — numbered spine; use for a how-to, an algorithm, or a worked method (slow way then fast way)
- {"kind":"quiz","question":"<=120","options":[{"text":"<=52","correct":true|false}, 3-4 options with EXACTLY ONE correct (2 only for a genuine true/false)],"sayQuestion":"spoken as the question+options appear","sayReveal":"spoken as the correct answer highlights"} — a mid-video multiple-choice check; wrong options must be plausible, each a real misconception
- {"kind":"vocab","sayIntro":"optional","word":"<=28","pron":"<=32 optional e.g. /ˈɛləkwənt/","pos":"<=16 optional noun/verb/adj","meaning":"<=90","examples":[{"text":"<=90 a real sentence that LITERALLY CONTAINS the word/phrase, used naturally","say":"spoken as THIS example appears"}, 1-3],"synonym":"<=48 optional"} — English-vocabulary flashcard; the word is auto-highlighted inside each example, so each example text MUST include the exact word/phrase (a sentence that only describes the meaning without using the word is wrong and teaches nothing)
- {"kind":"chart","sayIntro":"optional","title":"<=60","items":[{"label":"<=24","value":number (plain number, no commas),"unit":"<=8 optional e.g. %, Cr, km","say":"spoken as THIS bar grows"}, 2-6 items]} — animated horizontal bar comparison with counting values; perfect for rankings, sizes, before/after numbers
- {"kind":"quote","narration":"...","text":"<=200 the exact quotation","author":"<=40 optional"} — styled quotation card; ONLY real, correctly attributed quotes (or mark as proverb/saying)
- {"kind":"mythfact","myth":"<=140 the common false belief","fact":"<=160 the correction","sayMyth":"spoken while the myth card shows","sayFact":"spoken while the myth is struck out and the fact appears"} — myth-buster reveal; high-engagement way to correct a misconception`;

const NARRATION_RULES = `
Narration rules (neural TTS voice; each beat is voiced separately):
- LOCKSTEP is the #1 rule: a beat may only talk about the element on screen during that beat.
- Conversational, confident, warm — a great teacher at a whiteboard. Short sentences.
- No emojis, no markdown, no "let's dive in", no "in this video". Plain speakable text.
- Beat lengths drive pacing: a beat's visuals stay on screen exactly as long as its audio.
  Keep beats tight (5-12s spoken). One idea per beat.
- Sound like a person who has lived this, not a script: vary sentence length, allow one small aside
  ("yes, your browser has been lying to you"), and never use formulaic transitions like "Next,",
  "Now let's look at", "In conclusion" — a knowledgeable friend explaining, not a narrator.
- Talk like a top creator, NOT a textbook. Ban academic register: no "possesses", "utilize",
  "furthermore", "this mechanism relies on", "it is imperative". Say "has", "use", "and", "here's
  how". Every scene should land ONE concrete, sticky image or turn of phrase the viewer repeats to a
  friend ("a ballpark figure keeps you in the game"), not a definition they forget in five seconds.`;

const TEACHING_METHOD = `
How to teach (dual-track rule — a total newcomer AND a practitioner are both watching; both must
stay hooked, so every idea runs on two tracks at once: plain words + the precise term):
- FOUNDATION FIRST: before any mechanism, one early beat must answer "what IS this thing, in one
  plain sentence, and what problem does it exist to solve?" for the video's core subject. If the
  video is about Redis, say it plainly ("Redis is a database that keeps data in memory instead of on
  disk — a giant labelled locker wall your app reads from in under a millisecond") BEFORE showing a
  request flow. Never open the mechanics assuming the viewer already knows what the thing is. The
  hook can tease; the very next teaching beat must ground the fundamental.
- ONE concrete running example threads the WHOLE video (a real name, place or number — resolving
  "youtube.com", investing "₹10,000", caching user "42" named Priya, the year 1857). Every diagram
  step, chart bar, code line and steps item narrates what happens to THAT example — never an
  abstraction like "a domain" or "a user".
- The first time ANY technical term appears, the SAME beat anchors it in everyday words
  ("the root server — think of it as the phone book's front desk"). Term + plain-words anchor
  together, every single time. Never define a term using another undefined term.
- Before any diagram/steps/code/chart scene, one beat must say in plain words what PROBLEM this
  solves and why the viewer should care ("your browser has no idea where youtube.com lives —
  someone has to know").
- After the mechanism, pay off the practitioner: one non-obvious consequence, trade-off or real
  failure ("this is why the internet slows down when a root server is attacked").
- COMPLETENESS: teach the mechanism as it REALLY happens, end to end, in true order — including the
  cache layers, fast paths and short-circuits real systems use (DNS resolution is browser cache →
  OS cache and the hosts file → the ISP or public resolver's cache → and only on a miss root → TLD →
  authoritative; compound interest includes the tax drag; a battle includes the supply lines).
  Skipping a real step to "simplify" is a factual error an expert viewer will call out in the
  comments. Every real step must be VISIBLE on screen — its own node/row, or a grouped one that
  NAMES each layer (a "Cache: browser → OS → resolver" node given one fast beat) — never silently
  dropped into a vague clause like "if it's not cached".
- CREDIBILITY: include one or two details only practitioners know — a real file name (/etc/hosts),
  a port number, a typical latency, the exact command, the clause number, the actual price — chosen
  where they sharpen the point. These are what make the video feel hand-made by an expert.
- Never say "simply", "just" or "obviously" — if it were obvious the viewer would not be watching.`;

const CODING_RULES = `
Code rules (js/python/sql code is EXECUTED to verify your claimed output — it must be real):
- Self-contained, standard library only. No network, no filesystem, no external packages.
- Deterministic: never use random, dates, times, or anything that changes between runs.
- If the code prints, "expectedOutput" must be EXACTLY what it prints (every character, every newline).
- "segments" must start at line 1, be contiguous, and cover every line exactly once (3-15s of speech each).
- Line limit: aim <=46 characters per line, <=22 lines. Break lines rather than exceed width.
- sql means SQLite syntax (it runs under sqlite3). bash/yaml/text are display-only (not executed).
- REALISM OVER EXECUTABILITY: the code must show the ACTUAL concept, idiomatic to how a pro writes it.
  If the topic centres on a library/tool NOT in the js/python/sql standard library (redis, react,
  express, pandas, fastapi, kafka...), do NOT fake it with a stdlib mock — e.g. never simulate a cache
  with "time.sleep(0.2)" or a dict pretending to be Redis. That misteaches the concept. Instead use
  lang "text" to DISPLAY the real, idiomatic library code (r.set("user:42", data, ex=3600); r.get(...))
  — display-only code can show the genuine API. Reserve executable js/python/sql for logic that is
  truly self-contained (an algorithm, a SQL query, a pure function) where running it proves something.`;

const NON_CODING_RULES = `
Visual rules for this subject (no executable code, no terminal scenes):
- Reach for the RICH scene kinds, not just bullets+diagram: timeline (chronology), stat (one stunning
  number), chart (compared numbers), steps (a worked method), compare (side by side), mythfact
  (bust a misconception), quiz (a check), quote (a real quotation), and — for English — vocab.
  A code scene with lang "text" still works for a calculation or quoted lines.
- Numbers, dates and names must be historically/factually accurate — if unsure of an exact figure,
  say "around" rather than inventing precision.`;

const VARIETY_RULE = `
Scene variety (this is a hard quality bar — a monotonous script is a bad script):
- Do NOT build the whole video from one or two scene kinds. A short must use at least 3 DIFFERENT
  kinds; a long must use at least 6. Lean on the kinds your subject playbook recommends below.
- NEVER use the same scene kind twice in a row, and in a short use no single kind more than twice
  total — two "steps" scenes back to back look identical and bore the viewer. If you need two
  processes, make the second a "diagram", "compare" or "chart" instead.
- Open with the strongest possible hook for THIS subject (a stat, a mythfact, a bold bigtext claim).
- Vary the rhythm: after two dense scenes (diagram/code/chart), give one light scene (stat/quote/quiz).`;

/** Per-subject scene-kind strategy. Keyed by subject.id (see content/subjects.json). */
const SUBJECT_PLAYBOOKS: Record<string, string> = {
  coding: `Coding playbook: teach the MECHANISM. Use a "code" scene as minimal runnable proof and a
"terminal" scene for the real output. Use "diagram" for architecture/data-flow, "compare" for
approach-vs-approach (e.g. array vs linked list), "steps" for an algorithm walk-through, "chart" for
benchmark/complexity numbers, "mythfact" for a widespread wrong belief. Prove it, do not just assert it.`,
  history: `History playbook: make it a thriller. Use a "timeline" for the sequence of events, a
"diagram" for cause->effect chains or who-fought-whom, a "stat" for the number that stuns (army
sizes, death tolls, distances), a "chart" to compare empires/armies/economies, and a real "quote"
from the era when one exists. "mythfact" for popular history myths. End with a "quiz" or "question"
that makes people argue. Dates and figures must be accurate.`,
  geography: `Geography playbook: explain WHY the place is the way it is. Use a "diagram" for physical
processes (monsoon, plate tectonics, river systems) and maps-as-boxes, a "chart" for rankings
(longest rivers, rainfall, populations), a "stat" for one jaw-dropping scale number, "compare" for
two regions, "steps" for a process (how a delta forms), "mythfact" for geo-myths.`,
  math: `Math & Aptitude playbook: trick-first. Use a "steps" scene to show the slow way then the fast
way, a "code" scene with lang "text" for the worked calculation, a "stat" for the punchline
number/time saved, and a "chart" when comparing methods or growth rates. ALWAYS end with a "quiz"
or "question" giving one practice problem.`,
  science: `Science playbook: everyday-phenomenon first. Open with a "stat", "mythfact" or bold
"bigtext" wow-fact, use a "diagram" for the mechanism, "steps" for a process (how vision works),
"chart" for scale comparisons (speeds, sizes, energies), "compare" for misconception-vs-reality.
One vivid real-world anchor per video.`,
  finance: `Money & Finance playbook: make rupees visceral. Use a "stat" for the big compounding
number (₹), a "chart" to compare returns/costs across options or years, a "steps" scene for the
how-to (start an SIP), a "code" scene with lang "text" for the compounding math, "mythfact" for
money myths (e.g. "renting is wasted money"), "compare" for two instruments. Concepts only, never
stock tips.`,
  english: `English & Communication playbook — teach like a charismatic creator, NOT a dictionary.
The enemy is dryness: stating one rule three times across mythfact + steps + compare is boring and
low-value. Every scene must add something NEW — the rule, THEN a tricky edge case, THEN real usage,
THEN a memory trick — never restate the same point in a new format.
- IDIOMS & PHRASES: open on the vivid literal image, then actually DELIVER the origin or "why this
  metaphor" that your hook promises — never tease "why do we say X?" and leave it unanswered. Then
  show the phrase used VERBATIM in 2-3 natural sentences a real person would say, in different
  settings (office, family, news headline). Close with the common misuse. If the true origin is
  uncertain, say "the story goes…" — never invent a false etymology.
- VOCABULARY & ETYMOLOGY: this is the #1 rule — every "vocab" example sentence MUST literally
  contain the target word/phrase, used naturally in a real sentence ("She finally addressed the
  elephant in the room and asked about the layoffs"). An example that only describes the meaning
  ("everyone knew but nobody said it") is worthless — the viewer never hears the word in action.
  Add a memory hook: a mnemonic, the root it comes from, or a vivid association that makes it stick.
- CONFUSING PAIRS: "compare" with ONE crisp discriminator (direction, countability, location) and
  one sticky test the viewer keeps forever ("if you can count it, use fewer"). Real Indian examples.
- GRAMMAR: state the rule ONCE, then spend the rest of the video on the EDGE CASES and the specific
  mistakes people actually make — not re-explaining the basic rule. "mythfact" for a real myth, and
  a "quiz" on a genuinely tricky case, not an obvious one.
- SPOKEN & DAILY CONVERSATION: teach FUNCTIONAL language for a real situation — ordering food,
  disagreeing politely, small talk, a phone call, an interview answer — with word-for-word phrases
  the viewer can copy and say today, then a native-sounding upgrade. This is NOT a grammar lesson;
  model the actual spoken sentences.
- Correct common Indian-English mistakes warmly, and use Indian names, ₹ and contexts in examples.`,
  gk: `GK & Amazing Facts playbook: hook with the unbelievable "stat" or bigtext fact, then a "diagram"
or "timeline" explaining the mechanism behind it. Use "chart" for rankings and records, "mythfact"
for widely believed nonsense. ALWAYS end with a "quiz".`,
  psychology: `Psychology playbook: name the bias/effect, then make the viewer FEEL it with a relatable
scenario. Use "mythfact" for pop-psychology myths (10% of the brain, learning styles), "steps" for
the mechanism or the fix, "stat"/"chart" for the striking experimental numbers, "quiz" to let viewers
test themselves mid-video, "diagram" for loops (habit loop, feedback). One practical takeaway at the
end; never preachy, never clinical advice.`,
  business: `Business & Startups playbook: case-first. Open with a company and a stunning "stat"
(revenue, users, valuation), dissect the model with a "diagram" (who pays whom), use "chart" for
scale comparisons and growth, "timeline" for rise/fall stories, "compare" for two strategies, a
"quote" from a founder when real. Mix Indian (Jio, UPI, Zomato) and global (Apple, Netflix) cases.
Explain incentives and moats, not buzzwords.`,
  health: `Health & Body playbook: mechanism-first — show what actually happens inside the body with a
"diagram" or "steps". Bust one popular myth per video with "mythfact" (detox, spot reduction,
8-glasses). Use "stat"/"chart" for evidence numbers with "about/around" hedging. "compare" for
this-vs-that (whey vs food protein). Educational tone only — explain evidence, never prescribe;
no miracle claims ever.`,
  philosophy: `Philosophy playbook: start from a modern, concrete dilemma, then bring in the thinker or
school that cracks it. Use a "quote" (real and correctly attributed) as an anchor, "compare" for two
schools answering the same question, "diagram" for thought experiments (trolley tracks as boxes),
"steps" for an argument laid out premise by premise, "mythfact" for misread ideas ("Stoicism = no
emotions"). ALWAYS end with a "question" people will argue about.`,
  lifeskills: `Life Skills playbook: one skill per video with a concrete method. Show the failure mode
first (bigtext or mythfact), then the fix as a "steps" scene the viewer can copy today. Use "stat"
for the cost of doing it wrong, "chart" to compare methods, "quiz" to check understanding, and end
with a 24-hour challenge in the "question" scene. Practical over motivational — no platitudes.`,
  mythology: `Mythology & Epics playbook: storytelling-first, like a gripping narrator. Use "timeline"
for the arc of an episode, "diagram" for family trees and who-cursed-whom chains, a "quote" for a
famous verse or line (translated, attributed), "compare" for parallel myths across cultures,
"mythfact" to separate later additions from the original texts. Respect the tradition; clearly
separate story, symbolism and history. End with the lesson or an open question.`,
};

export function buildTopicsPrompt(opts: {
  subject: Subject;
  moduleLabel: string;
  submoduleLabel: string;
  moduleStyle?: string;
  submoduleStyle?: string;
  covered: string[];
  siblingLabels?: string[];
}): string {
  const { subject, moduleLabel, submoduleLabel, moduleStyle, submoduleStyle, covered, siblingLabels } = opts;
  const exclusions = covered.length
    ? `\nAlready covered (EXCLUDE these and near-duplicates):\n${covered.map((t) => `- ${t}`).join("\n")}`
    : "";
  const lanes = siblingLabels?.length
    ? `\nSTAY IN YOUR LANE: sibling sub-modules cover ${siblingLabels.join(", ")} — a topic that belongs to one of those (e.g. a squaring trick under "Squares & Cubes", a famous paradox under a "Paradoxes" module) must NOT appear here. Propose only topics that are unmistakably about ${submoduleLabel}.`
    : "";
  return `You plan content for a YouTube education channel.

Audience: ${subject.audience}. Videos teach on two tracks at once — a total newcomer must follow,
a practitioner must still learn something new — so topics need angles that work for both.
Subject: ${subject.label} → Module: ${moduleLabel} → Sub-module: ${submoduleLabel}.
Teaching style: ${subject.style}.${moduleStyle ? `\nModule brief: ${moduleStyle}` : ""}${
    submoduleStyle ? `\nSub-module brief: ${submoduleStyle}` : ""
  }

Propose the 10 BEST video topics for this sub-module right now, ordered from most fundamental to most advanced. Great topics:
- answer a question the audience actually types into YouTube
- teach ONE mechanism/idea deeply (not "top 10 tips")
- have a hook angle that creates curiosity
- can be taught visually with diagrams/examples in 60s (short) or 8 minutes (long)
- vary the title shapes across the 10 — mix "Why X ...", "How X actually works", "X vs Y", "The X
  mistake everyone makes", "What happens when ..." — never 10 titles with the same shape
- format titles as "Punchy headline: the specifics" — the part BEFORE the colon is <=6 words and
  works alone as a thumbnail headline; every title must be COMPLETE (never end mid-phrase or with a
  dangling colon and no specifics)
${lanes}${exclusions}

Return STRICT JSON only:
{"topics":[{"title":"<=100 chars, specific and curiosity-driven","angle":"<=140 chars — the hook/approach"}]}`;
}

export function buildScriptPrompt(opts: {
  subject: Subject;
  moduleLabel: string;
  submoduleLabel: string;
  moduleStyle?: string;
  submoduleStyle?: string;
  format: "short" | "long";
  topic: string;
  angle?: string;
  recentTopics: string[];
}): string {
  const { subject, moduleLabel, submoduleLabel, moduleStyle, submoduleStyle, format, topic, angle, recentTopics } = opts;
  const isCoding = subject.id === "coding";
  const playbook = SUBJECT_PLAYBOOKS[subject.id] ?? "";
  const structure =
    format === "short"
      ? `Structure for a SHORT (45-90s, 9:16 vertical, 4-8 scenes):
1. a hook that fits this subject — a bold "bigtext" claim, a "stat" wow-number, or a sharp question
2-3. the core idea told visually, using 2+ of the scene kinds your playbook recommends
4. a concrete example or proof${isCoding ? " (code -> terminal output)" : ""}, or a quick "quiz"
5. a "question" scene — a challenge worth arguing about in the comments
PACING BUDGET (the video runs exactly as long as the narration): total spoken words across ALL
beats must be 130-220. Count them. Over 220 words the Short overruns 90 seconds and dies.`
      : `Structure for a LONG video (6-12 min, 16:9 landscape, 14-32 scenes):
- open with a hook ("bigtext" claim, a "stat", or a "mythfact"), then a "bullets" of "what you'll walk away knowing"
- 3-5 sections, each a "bigtext" section card FOLLOWED BY 2-3 teaching scenes drawn from your
  playbook's kinds (diagram / timeline / steps / compare / stat / chart / mythfact / quote${isCoding ? " / code -> terminal" : " / vocab"} as fits the point)
- HARD RULE: a "bigtext" section card must ALWAYS be followed by at least one non-bigtext teaching
  scene. NEVER place two "bigtext" scenes back to back — a title card with no content beneath it
  teaches nothing. Every "Common mistakes" / "Trade-offs" / "Pitfalls" section needs a real
  bullets/compare/diagram scene, not just a card.
- escalate difficulty: fundamentals early, nuance/tradeoffs/consequences later
- near the end: a "bullets" of common mistakes and a "quiz" to test the idea
- close with a "bigtext" recap then a "question" scene as the FINAL scene (this recap is the ONE
  allowed bigtext not followed by a content scene). NOTHING comes after the question — no "see you
  next time", no sign-off card, no "pro tip" outro. The question is the finale.
- bigtext section cards double as YouTube chapters — give them crisp 2-5 word titles
PACING BUDGET (the video runs exactly as long as the narration): total spoken words across ALL
beats must be 950-1700 (≈7-11 minutes at teaching pace). This is a hard floor: a "long" with
one-sentence beats becomes a thin 3-minute video that underdelivers versus the real YouTube
tutorials it competes with. Each teaching scene's beats should be 3-5 full sentences of genuine
explanation — narrate the WHY and the mechanism, not a caption. Count your words; if you are under
950 you have skipped depth the topic deserves — add the missing mechanism, not filler.`;

  const avoid = recentTopics.length
    ? `Recently covered in this sub-module (do NOT repeat): ${recentTopics.join("; ")}`
    : "";

  return `You are the content engine for a YouTube education channel.

Audience: ${subject.audience}.
Teaching style: ${subject.style}.
For THIS video assume the viewer has heard of ${submoduleLabel} but never truly understood it —
while a practitioner watching alongside must still learn one new thing.${
    moduleStyle ? `\nModule brief (${moduleLabel}): ${moduleStyle}` : ""
  }${submoduleStyle ? `\nSub-module brief (${submoduleLabel}): ${submoduleStyle}` : ""}

Write a complete video script as STRICT JSON (no prose, no markdown fences) for:
- Subject: ${subject.label} → Module: ${moduleLabel} → Sub-module: ${submoduleLabel}
- Topic: ${topic}${angle ? `\n- Angle: ${angle}` : ""}
- Format: ${format}

${structure}

${SCENE_SHAPE}
${NARRATION_RULES}
${TEACHING_METHOD}
${VARIETY_RULE}
${isCoding ? CODING_RULES : NON_CODING_RULES}

Your subject playbook — favour these scene kinds and this teaching pattern:
${playbook}

Teaching quality bar (viewers range from beginners to experts — beginners must follow, experts must not be bored):
- The FIRST beat is the retention decision: at most 2 short sentences that open a loop the scene does
  not close — a question, an assumption about to break, or a number that seems impossible. Never open
  with a definition, a greeting, or background.
- Teach the MECHANISM or the WHY, never just surface facts.
- Use one concrete anchor: a real number, a vivid comparison, or a story detail that makes it visceral.
- Include one insight that would make an expert nod ("ah, that's why").
- NUMERIC CLARITY: every number must be unambiguous. Never reuse the same figure for two different
  quantities in one video without distinguishing them (e.g. don't say the plate moves "5" and the
  peak rises "5" and leave the viewer conflating cm/yr with mm/yr). A "stat" scene's value must be
  the exact number its label describes — if you say money doubles, the stat is the doubled figure,
  not a later one. Round sensibly and say "about" when it's an estimate.
- EVERY SCENE EARNS ITS PLACE: this is the bar between good and great. If a scene only restates the
  previous one in a new format, cut it or replace it with the NEXT idea (the edge case, the
  consequence, the counter-example). No two scenes may make the same point.
- The ending question must be answerable from what was taught; make it the kind people argue about in comments.

Also produce "meta" for YouTube:
- "title": 35-90 chars${format === "short" ? ', ends with " #Shorts"' : ""} — lead with the exact phrase people search
  (the concrete concept), then the curiosity gap; proven shapes: "How X actually works", "Why X ...",
  "X vs Y", "The X mistake ..."; no clickbait lies, no ALL-CAPS words
- "description": lines 1-2 restate the topic with the exact phrases viewers type into search (they are
  the visible snippet); then 3-5 lines on what the viewer learns using the video's concrete facts; end
  by inviting a comment answer to the ending question; no links, no timestamps
- "tags": 10-15 — broad subject terms + the exact topic phrase + specific concepts covered + 2-3
  learner phrases ("<topic> tutorial", "learn <submodule>")
- "hashtags": 5-8 like #JavaScript or #IndianHistory — mix broad reach, topic-specific and audience
  tags${format === "short" ? ' ("#Shorts" first)' : ""}; first three are the visible ones, order by relevance

Top-level JSON shape:
{"format":"${format}","subject":"${subject.label}","module":"${moduleLabel}","submodule":"${submoduleLabel}","topic":"${topic}","scenes":[...],"meta":{"title":"...","description":"...","tags":[...],"hashtags":["#..."]}}

${avoid}

HARD LIMITS — validated mechanically, the script is REJECTED on any violation, so re-check every scene:
- code: max 22 lines, EVERY line max 46 characters (count them; break long lines)
- code segments: contiguous from line 1, cover every line exactly once
- terminal lines: max 60 characters each
- every "say"/beat: max 320 chars; scene "narration": max 400 chars
- bigtext.text 80 / bullets item text 110 / node label 28 / compare item 70 / question.text 180
- timeline: when 18, label 52 / stat: value 14, label 60 / steps: text 80, detail 90
- quiz: question 120, option 52, EXACTLY one correct / vocab: word 28, meaning 90, example 90
- chart: label 24, unit 8, value is a plain number / quote: text 200, author 40 / mythfact: myth 140, fact 160

Return ONLY the JSON object.`;
}

export function buildRegenScenePrompt(opts: {
  format: "short" | "long";
  subject: string;
  moduleLabel: string;
  submoduleLabel: string;
  topic: string;
  sceneJson: string;
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  beforeSummary?: string;
  afterSummary?: string;
}): string {
  const { format, subject, moduleLabel, submoduleLabel, topic, sceneJson, sceneId, sceneIndex, sceneCount, beforeSummary, afterSummary } = opts;
  return `You are improving ONE scene of an existing YouTube ${format} teaching video. The rest of the
script stays untouched, so the rewritten scene must still flow from the previous scene into the next.

Video: ${subject} → ${moduleLabel} → ${submoduleLabel} — "${topic}"
This is scene ${sceneIndex + 1} of ${sceneCount}.${beforeSummary ? `\nPrevious scene: ${beforeSummary}` : ""}${afterSummary ? `\nNext scene: ${afterSummary}` : ""}

Rewrite the scene below to teach its point BETTER: more concrete, more visual, sharper narration.
Keep its teaching purpose and roughly its narration length. Keep "id" EXACTLY "${sceneId}".
You may change "kind" if a different scene kind teaches this point better.

Current scene:
${sceneJson}

${SCENE_SHAPE}
${NARRATION_RULES}
${TEACHING_METHOD}

HARD LIMITS (mechanically validated): code max 22 lines, every line max 46 chars, segments contiguous
from line 1 covering all lines; terminal lines max 60 chars; say max 320; narration max 400;
bigtext.text 80; bullets item 110; node label 28; compare item 70; question.text 180; timeline when
18/label 52; stat value 14/label 60; steps text 80/detail 90; quiz question 120/option 52, exactly one
correct; vocab word 28/meaning 90/example 90; chart label 24/unit 8, value plain number; quote text
200/author 40; mythfact myth 140/fact 160.

Return ONLY the JSON object of the ONE rewritten scene.`;
}

export function buildRepairPrompt(originalJson: string, errors: string): string {
  return `The JSON video script below failed schema validation. Fix ONLY the listed problems and return the corrected complete JSON object (no prose, no markdown fences). Keep everything that was valid unchanged.

Validation errors:
${errors}

Script:
${originalJson}`;
}
