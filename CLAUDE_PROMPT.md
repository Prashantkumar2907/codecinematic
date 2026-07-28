# Educational Video Engine: Master Scriptwriter Prompt

> **NOTE:** This document is a standalone spec — it is NOT loaded by the app. The live generation
> prompt is `src/lib/prompt.ts`; validation lives in `src/studio/schema.ts`; TTS in
> `src/app/api/studio/tts/route.ts`. The status table below tracks how each issue is handled in code.

---

## ✅ Implementation Status Tracker

Legend: **DONE (pre-existing)** = already handled before this pass · **FIXED (this pass)** = addressed
in the changes described · **OPEN** = needs a decision.

| # | Issue | Status | Where in code |
|---|-------|--------|---------------|
| 1 | Smart animation selection | FIXED (this pass) + pre-existing | `prompt.ts` SCENE_MENU_HEADER "COMMON vs SPECIALISED"; CORE_KINDS/SUBJECT_KIT; CODING_RULES |
| 2 | Clear on-screen text | DONE (pre-existing) | `prompt.ts` char-limit HARD LIMITS + NARRATION_RULES |
| 3 | Simple code snippets | DONE (pre-existing) | `prompt.ts` CODING_RULES ("when to use code") |
| 4 | Cohesive storytelling | DONE (pre-existing) | `prompt.ts` LOCKSTEP + running-example (TEACHING_METHOD) |
| 5 | Pacing / blank screen | DONE (pre-existing) | `prompt.ts` sayIntro-SHORT + OPENING rules |
| 6 | Robotic AI-speak | DONE (pre-existing) | `prompt.ts` banned crutch-words |
| 7 | Visual cramming | DONE (pre-existing) | `prompt.ts` char limits (mechanically validated in `schema.ts`) |
| 8 | Hallucinations / fake precision | DONE (pre-existing) | `prompt.ts` blueprint exact\|approx tagging; stat truth rule |
| 9 | Broken edges | DONE (pre-existing) | `schema.ts` superRefine statemachine/decision/graphwalk ref checks |
| 10 | Math / chronology constraints | FIXED (this pass) + pre-existing | `schema.ts` superRefine **timeline chronology** (new); sankey/pictogram/gauge (pre-existing) |
| 11 | Scene monotony | DONE (pre-existing) | `prompt.ts` VARIETY_RULE |
| 12 | Dual-track (beginner+expert) | DONE (pre-existing) | `prompt.ts` TEACHING_METHOD dual-track |
| 13 | Schema hallucinations (invented keys) | FIXED (this pass) | `schema.ts` `unknownSceneKeys` → warn-and-surface in `generate/route.ts` |
| 14 | Regional words (phonetics) | FIXED (this pass) | `speech.ts` INDIAN_TERMS map + TTS_RULES (`prompt.ts`) |
| 15 | Acronym misfire | FIXED (this pass) | `speech.ts` SPELL_ACRONYMS / WORD_ACRONYMS |
| 16 | Number/symbol mangling | FIXED (this pass) | `speech.ts` currency/percent/unit expansion (voice-only) |
| 17 | Run-on sentences (breathing) | FIXED (this pass) | `prompt.ts` TTS_RULES (ellipses/em-dashes) |
| 18 | Tone flattening on questions | FIXED (this pass) | `prompt.ts` TTS_RULES (interrogative front-loading) |
| 19 | Homograph trap | FIXED (this pass) | `prompt.ts` TTS_RULES (swap ambiguous words) |
| 20 | Missing vocal emphasis | FIXED (this pass) | `prompt.ts` TTS_RULES (ALL-CAPS one word) |
| 21 | Reading code aloud | FIXED (this pass) | `prompt.ts` TTS_RULES + `speech.ts` code-punct strip |
| 22 | Hindi code-switching | FIXED (this pass) | `prompt.ts` Hindi langBlock Devanagari rule + `speech.ts` hi path; voice map (pre-existing) |
| 23 | Clunky quote attribution | FIXED (this pass) | `prompt.ts` TTS_RULES (quote pauses) |
| 24 | Spatial collisions / out-of-bounds | FIXED (this pass) | `schema.ts` superRefine overlap + `x+w/y+h ≤ GRID` (diagram/browserframe/schematic) |
| 25 | State desync / dead-ends | DONE (pre-existing) + hardened | `schema.ts` superRefine index/line checks; **`engine.ts` paint crash-guard** (new) |
| 26 | Hallucinated "magic" animations | DONE (pre-existing) + surfaced | `schema.ts` z.enum rejection; invented keys now warned (see #13) |
| 27 | Code vs expectedOutput mismatch | DONE (pre-existing) | `pipeline.ts` verifyScript executes & reconciles via `/exec` |
| 28 | UI safe-zone (Shorts) | FIXED (this pass) | `schema.ts` `shortSceneOverdense` soft gate + `prompt.ts` Short DENSITY BUDGET |
| 29 | JSON quote escaping | FIXED (this pass) | `jsonrepair.ts` balancer wired at `gemini.ts` parse site |
| 30 | Output token truncation | FIXED (this pass) | `jsonrepair.ts` + raised `MAX_OUTPUT_TOKENS` 12288→16384 (`gemini.ts`) |

### 🆕 New issues found this pass

- **N1 — Render loop had no crash guard.** A painter throwing on an unguarded field killed the whole
  render. **FIXED:** try/catch around `paintScene` in `engine.ts` degrades to a titled fallback frame.
- **N2 — 11 orphan painters (dead code).** `architecture_blueprint, codediff, jigsaw_puzzle,
  packet_delivery, parliament_arc, scroll, server_rack, sliding_window, tactical_map, topology,
  trendgraph` have painter files but no schema kind — unreachable, and they are the sole cause of the
  current `npm run typecheck` errors (they resolve to type `never`). **OPEN — needs sign-off:** delete
  them, or wire the worthwhile ones into `sceneSchema` as real kinds. Not touched (user's code).
- **N3 — Prompt vs validator word-budget "mismatch".** Reviewed: the prompt targets (short 130-220,
  long 950-1700) are a strict SUBSET of the validator gate (110-240, 850-1900), so the model always
  aims inside the gate. **Benign — intentional, left as-is.**
- **N4 — expectedOutput is reconciled, not asserted.** `pipeline.ts` overwrites a wrong-but-successful
  model output rather than flagging it. Acceptable for render correctness; **noted, not changed.**

---

Act as an Expert Educational Content Strategist and Video Scriptwriter for a custom Canvas-driven educational video engine.

## Context
I have built an application designed to generate extremely high-quality educational videos. It uses a custom HTML5 Canvas engine, driven by JSON scripts, with over 60+ rich animation types (scenes). The ultimate goal is to produce video content that makes complex concepts simple, clear, and highly engaging for viewers.

While the engine works well, I am noticing some recurring issues with the generated scripts and content that I need you to fix moving forward.

## Core Issues to Address

### 1. Smarter Animation Selection (Common vs. Subject-Specific)
* **The Problem:** With 60+ animations available, the wrong or overly complex animations are sometimes chosen.
* **The Fix:** We need strict separation between "Common" animations (e.g., `bigtext`, `bullets`, `diagram`, `steps`, `chart`) and "Subject-Specific" animations (e.g., `code`, `trace` for coding; `terrain` for geography). Always default to common animations for general explanations. Only use subject-specific animations when the concept genuinely requires them. Do not use an animation just for the sake of variety if a simpler one tells the story better.

### 2. Crystal Clear On-Screen Text
* **The Problem:** On-screen text elements (like titles and sub-titles in `bigtext` or labels in diagrams) are sometimes too dense or fail to explain the concept simply.
* **The Fix:** On-screen text must be punchy, simple, and instantly digestible. Use everyday language. A viewer should be able to read and understand the core point in the 3-5 seconds the text is on screen. Avoid academic jargon. Titles and sub-titles must catch attention and clarify, not confuse.

### 3. Simple, Relevant Code Snippets (For Coding Subjects)
* **The Problem:** Code examples are often unnecessary, unrelated to the core concept, or far too complex for a general audience to follow.
* **The Fix:** Use code ONLY when seeing the code is essential to understanding the point. When code is used, it must be the absolute simplest possible example. Strip out all unnecessary boilerplate. If a concept (like "how a database works") can be explained with a visual diagram instead of a code block, always choose the visual diagram. 

### 4. Cohesive, Relatable, and Lockstep Storytelling
* **The Problem:** The overall content can become too complex, and the narration sometimes disconnects from the visual content.
* **The Fix:** Your primary focus must be on creating simple, understandable, up-to-the-mark content. 
  * **Lockstep:** The narration must perfectly match what is happening on screen at that exact second. Do not let the audio run ahead of the visuals.
  * **Relatability:** Thread one concrete, real-world example (e.g., ordering a pizza, an exact monetary amount) through the entire video rather than using abstract definitions.
  * **Tone:** The narration should sound like a knowledgeable friend explaining something at a whiteboard, not a textbook.

## Structural and Pacing Issues

### 5. Pacing & Audio-Visual Imbalance (The "Talking to a Blank Screen" Problem)
* **The Issue:** LLMs tend to write long, paragraph-style introductory sentences for a scene before the animation actually does anything. This results in the viewer staring at a static title card or an empty diagram for 15 seconds while the audio rambles on, which kills viewer retention.
* **The Fix:** Introduce a strict "Audio-Visual Pacing" rule. If a scene has a setup/intro line, it must be extremely short (e.g., max 1 short sentence). The bulk of the narration must happen during the active animation steps (e.g., while the diagram is building or the code is typing).

### 6. Robotic "AI-Speak" and Formulaic Transitions
* **The Issue:** Even when told to be simple, LLMs fall back on predictable, robotic transitions like "Let's dive in," "Now, let's take a look at," "In conclusion," or "Furthermore." This instantly breaks the illusion of a human teacher and sounds like a textbook.
* **The Fix:** Explicitly ban "crutch words" and formulaic transitions. Tell the LLM to start sentences directly with the action or the subject, maintaining the tone of a passionate creator rather than an essay writer.

### 7. Visual Cramming (Ignoring Character Constraints)
* **The Issue:** In an automated Canvas engine, space is finite. The LLM will often try to cram a 15-word explanation into a tiny diagram node label or a bullet point, causing text to overlap, wrap awkwardly, or break the visual layout.
* **The Fix:** Enforce strict character limits for on-screen elements (e.g., "Node labels must be under 30 characters," "Bullet points must be 1 short sentence"). Tell the LLM: If you have more to say, put it in the spoken narration, not on the screen.

### 8. Hallucinations and "Fake Precision"
* **The Issue:** If you ask the LLM for a specific, relatable example (like a monetary amount or a historical date), it might invent a statistic that sounds plausible but is factually incorrect, or it might use lazy placeholders like "Company X" or "User A". 
* **The Fix:** Command the LLM to use verifiable, real-world anchors. If it doesn't know an exact statistic, it should frame it as an estimate (e.g., "around 1 million") rather than inventing a hyper-specific fake number. 

## Engine Logic and Constraint Failures

### 9. Logical Disconnects in Graphs and Diagrams (The "Broken Edge" Problem)
* **The Issue:** For complex scenes like `diagram`, `statemachine`, or `graphwalk`, the engine requires the LLM to define nodes/states (with IDs) and then define the paths between them. LLMs are notoriously bad at internal logic across JSON arrays. They will frequently try to move an animation token to a node ID that doesn't exist, or walk a path where no edge was drawn.
* **The Fix (For the Prompt):** "Strict Internal Logic: When building diagrams, state machines, or graph walks, you must act as a compiler. If step 3 says 'move token from Node A to Node B', you must verify that Node A and Node B exist, and that an explicit edge connects them. Never reference an ID you haven't created."

### 10. Mathematical and Constraint Failures
* **The Issue:** Scenes that rely on numbers—like a `sankey` diagram (where branches must sum to a total), a `pictogram` (where groups must equal the total people), or a `timeline` (which must be strictly chronological)—often break because LLMs fail at basic arithmetic constraints during generation. E.g., they might generate percentages that add up to 115%.
* **The Fix (For the Prompt):** "Mathematical Integrity: If a scene kind requires proportions, percentages, or chronological order (e.g., Sankey, Timeline, Pictogram), you must verify the math. Values must never exceed the stated total, and dates must always progress in the correct direction."

### 11. Scene Monotony and "Safe Choices"
* **The Issue:** LLMs are lazy. Left to their own devices, they will fall back on the easiest text-heavy scenes, resulting in videos that are just `bigtext` -> `bullets` -> `bigtext` -> `bullets`. This defeats the purpose of having 60+ rich visual animations. 
* **The Fix (For the Prompt):** "Forced Visual Variety: You must never use the same scene kind twice in a row. Force yourself to use rich, comparative scenes (like `mythfact`, `compare`, `table`, or `chart`) instead of relying solely on text-heavy bullet points."

### 12. The "Dual-Track" Balance (Beginner vs. Expert)
* **The Issue:** LLMs struggle to talk to two audiences at once. They either write a script that is so basic it bores the practitioner, or they dive so fast into jargon that the beginner is completely lost.
* **The Fix (For the Prompt):** "The Dual-Track Rule: Every script must follow a strict progression: 1) Anchor the concept in plain, beginner-friendly words first (what is it?). 2) Show the actual visual mechanism. 3) End with a 'Practitioner Payoff'—a non-obvious consequence, tradeoff, or real-world failure that only an expert would know."

### 13. Schema Hallucinations (Inventing Properties)
* **The Issue:** Because the LLM knows CSS and HTML, it will often try to "help" you by inventing JSON properties your engine doesn't support. For example, it might try to add `"color": "red"`, `"bold": true`, or `"transition": "fade"` into the JSON nodes, which causes your parsing to fail.
* **The Fix (For the Prompt):** "Strict Schema Adherence: You must output ONLY the exact fields permitted by the scene schema. Never invent, guess, or add properties like colors, fonts, or styling attributes unless they are explicitly defined in the allowed JSON structure."

## Audio and TTS (Text-to-Speech) Control

### 14. The Regional Word Problem (e.g., "Lok Sabha")
* **The Issue:** An English TTS voice will look at "Lok Sabha" and read it like "Lock Sab-ha", or read "Kailasa" as "Kay-lasa". 
* **The Fix (Phonetic Spelling):** Instruct the LLM to spell Indian/regional terms phonetically in the narration track, while keeping the correct spelling on-screen.
  * **Prompt addition:** "Phonetic Narration: For Indian terms, historical names, or non-English words, you must spell the word phonetically in the `say`/`narration` fields so an English TTS voice reads it natively. (e.g., On-screen: 'Lok Sabha', Spoken: 'Loke Sub-haa'. On-screen: 'Kailasa', Spoken: 'Kye-laa-saa')."

### 15. The Acronym Misfire (e.g., "SQL", "API", "AWS")
* **The Issue:** Edge-TTS will often try to read acronyms as actual words. It might read "AWS" as "Awss", or "API" as "Appy". Conversely, it might spell out things you want spoken as a word (like reading "NASA" as "N-A-S-A").
* **The Fix (Spacing and Dashing):** Force the LLM to format acronyms explicitly for the TTS engine.
  * **Prompt addition:** "Acronym Control: In the spoken narration, if a word should be spelled out letter-by-letter, put spaces between the letters (e.g., write 'A W S', 'A P I'). If it should be read as a word, write it phonetically (e.g., write 'Sequel' for SQL, 'Nah-sa' for NASA)."

### 16. Number and Symbol Mangling (e.g., "₹10Cr", "100ms")
* **The Issue:** TTS engines struggle with symbols combined with letters. "₹10Cr" might be read as "Rupee ten C R", and "100ms" as "one hundred m s". 
* **The Fix (Plain English Expansion):** The narration track must contain absolutely zero symbols.
  * **Prompt addition:** "Zero Symbols in Audio: The `say` track must NEVER contain symbols (₹, %, +, =). You must write out exactly how a human would say it. On-screen: '₹10Cr', Spoken: 'ten crore rupees'. On-screen: '99.9%', Spoken: 'ninety nine point nine percent'."

### 17. The Run-On Sentence (Lack of Breathing/Pausing)
* **The Issue:** Edge-TTS will read a long, grammatically correct sentence without taking a breath, which sounds incredibly robotic and overwhelming to a listener.
* **The Fix (Forced Punctuation):** You have to use punctuation to manually control the TTS engine's "breath."
  * **Prompt addition:** "Breathing and Pacing: TTS engines speak too fast. To force natural pauses, use ellipses (...) for short pauses and em-dashes (—) for dramatic emphasis. Write in short, punchy clauses so the AI voice has time to 'breathe'."

### 18. Tone Flattening on Questions
* **The Issue:** Sometimes TTS engines read a question with a flat statement tone if the sentence structure is too complex, causing the viewer to not realize they are being asked a question.
* **The Fix (Question Front-loading):**
  * **Prompt addition:** "Question Intonation: When asking a question, always start the spoken sentence with clear interrogative words (Why, How, What) to force the TTS engine to apply a questioning, upward inflection at the end."

### 19. The Homograph Trap (Same spelling, different sound)
* **The Issue:** TTS engines lack deep contextual awareness. They will frequently mispronounce homographs. For example: "He will record the data" (Verb) vs. "It broke the record" (Noun). "I read it yesterday" (Past) vs. "I will read it" (Present). "A minute detail" (Tiny) vs. "Wait a minute" (Time).
* **The Fix:** Tell the LLM to swap out ambiguous words in the spoken track.
  * **Prompt addition:** "Avoid Homographs in Audio: If a word changes pronunciation based on context (like read/read, record/record), either replace it with an unambiguous synonym in the `say` track (e.g., 'log the data' instead of 'record the data'), or spell it phonetically."

### 20. Missing Vocal Emphasis (The "Flat Punchline")
* **The Issue:** In teaching, you often need to stress a specific word to make the concept click (e.g., "The client requests the data, not the server"). TTS engines will read that sentence completely flat, ruining the contrast. 
* **The Fix:** Many TTS engines (including Edge-TTS) will naturally apply vocal stress to words that are fully capitalized or wrapped in quotes.
  * **Prompt addition:** "Vocal Stress: TTS voices sound monotonous on contrasting points. To force the AI to emphasize a specific, crucial word, write it in ALL CAPS in the narration track (e.g., 'The CLIENT requests the data, NOT the server.')."

### 21. Reading Code Aloud (The "Bracket-Bracket" Nightmare)
* **The Issue:** If the LLM generates a coding script and accidentally puts raw code like `myArray[0]` or `() => {}` into the `say` field, the TTS will literally read: "My array open bracket zero close bracket" or "open parenthesis close parenthesis equals greater than curly brace". 
* **The Fix:** Force the LLM to translate syntax into human concepts for the ear.
  * **Prompt addition:** "Speak Concepts, Not Syntax: NEVER put raw code, brackets, or programming syntax in the `say` track. Translate code into plain English for the ear. Instead of 'array[0]', write 'the first item in the array'. Instead of 'console.log', write 'we print the result'."

### 22. Code-Switching / Hinglish Accents (If using lang: "hi")
* **The Issue:** If you use a Hindi TTS voice, it will naturally try to read English words (like "Javascript", "Server", "API") with a heavy, sometimes distorted accent. Conversely, an English voice reading Hindi text sounds incomprehensible.
* **The Fix:** Decide which language the engine thinks it is speaking, and bend the text to match it. 
  * **Prompt addition (if using a Hindi Voice):** "Pronouncing English in Hindi: When the script is in Hindi but uses an English technical term (like 'Database' or 'Server'), write the English term in Devanagari script in the `say` track (e.g., 'डेटाबेस') so the Hindi TTS voice pronounces it smoothly, rather than stuttering over the English alphabet."

### 23. Clunky Quote Attribution
* **The Issue:** When quoting someone, a human naturally pauses and changes their pitch. TTS engines do not. If the text says As Gandhi said, "Be the change", the TTS will speed right through it, making it hard for the listener to know where the quote begins and ends.
* **The Fix:** Force the LLM to use dramatic pauses around quotes.
  * **Prompt addition:** "Quoting Pauses: When narrating a quote, use ellipses to create a clear vocal boundary before and after the quotation. (e.g., 'As Gandhi famously said... Be the change...'). Do not write the words 'quote' or 'unquote'."

## Spatial Collisions and Format Constraints

### 24. Spatial Collisions & Out-of-Bounds Drawing (The 12x12 Grid Problem)
* **The Issue:** Scenes like `diagram`, `browserframe`, and `schematic` use a coordinate system (e.g., `x: 0-11, y: 0-11`). LLMs have zero spatial reasoning. They will happily place two different nodes on the exact same (x, y) coordinate, or they will place a node at x: 10 with a width of w: 5, pushing it off the edge of the 12x12 screen.
* **The Fix:** You must make the LLM act as a layout engine.
  * **Prompt addition:** "Spatial Reasoning & Layout: When placing nodes on a grid (like `diagram` or `browserframe`), you MUST mathematically ensure no two elements overlap. If an element is at x:2 with a width (w) of 4, the space from x=2 to x=5 is occupied. Never place an element so its x+w or y+h exceeds the grid boundaries (max 11)."

### 25. State Desync & "Dead Ends" (Out of Bounds Errors)
* **The Issue:** For algorithmic scenes (`trace`, `memgrid`, `callstack`), the LLM has to animate step-by-step logic. A frequent failure is the LLM trying to highlight an array index i=5 when the array only has 4 items. Or, it might try to pop a callstack that is already empty. Or it might say fromLine: 10 in a code block that only has 8 lines. This crashes your video renderer.
* **The Fix:**
  * **Prompt addition:** "State Machine Validation: For any step-by-step scene (`trace`, `memgrid`, `callstack`, `code`), you must mentally execute the state. Never pop an empty stack. Never reference an array index or a code line number that does not exist in the current scene."

### 26. Hallucinated "Magic" Animations (Inventing Capabilities)
* **The Issue:** LLMs try to be creative. If it sees that a node can "highlight" or "move", it might decide it wants a node to "explode", "spin", or "fade". It will invent a JSON property like `{"action": "explode"}` that your Canvas engine has no idea how to render, resulting in a fatal error.
* **The Fix:** Enforce a strict "Closed Vocabulary".
  * **Prompt addition:** "Closed Vocabulary Rule: You are interfacing with a strict rendering engine. You may ONLY use the exact string values, actions, and shapes explicitly listed in the schema (e.g., if the schema says shape: dome|cone, you cannot use shape: pyramid). Never invent new animation triggers."

### 27. Code vs. Expected Output Mismatch
* **The Issue:** In your `code` scenes, you require an expectedOutput. LLMs will frequently write a Python/JS script that prints one thing (e.g., `[1, 2, 3]`), but then write an expectedOutput that is slightly different or formatted wrong (e.g., `1, 2, 3`). If your system actually runs/evaluates this code to verify it (as hinted in your prompt rules), this mismatch will fail the validation step.
* **The Fix:**
  * **Prompt addition:** "Deterministic Code Execution: If a code scene has an expectedOutput, you must act as a compiler. The output must match the EXACT literal stdout of the code provided, including brackets, quotes, and newlines."

### 28. UI Safe-Zone Violations (Especially for YouTube Shorts)
* **The Issue:** Your engine renders for both 16:9 (Longs) and 9:16 (Shorts). On YouTube Shorts, the bottom 25% of the screen is covered by captions, the channel name, and the audio track info. The right side is covered by the Like/Share buttons. If the LLM generates a massive 10-node diagram for a Short, the bottom half will be completely obscured by the YouTube UI, rendering the video useless.
* **The Fix:** You need to give the LLM a "budget" based on the format.
  * **Prompt addition:** "Format Density Limits: If the format is a 'Short' (9:16 vertical), the screen space is highly restricted by the YouTube UI. Limit diagrams, trees, or tables to a maximum of 4-5 items/nodes total. Never fill the bottom of the grid, as it will be covered by the YouTube interface."

## Final JSON Syntax Integrity

### 29. JSON Quote Escaping (The Syntax Killer)
* **The Issue:** Because the LLM is generating a JSON object, it uses double quotes `"` to define fields. However, if the LLM wants to use a quote inside a script (e.g., a `bigtext` title or a `quote` scene), it will often write: `"text": "And then he said "Hello" to me"`. This unescaped internal quote instantly breaks JSON.parse() in your app.
* **The Fix:** 
  * **Prompt addition:** "JSON Escaping: You must strictly escape any internal double quotes using a backslash (`\"`) inside string values, or use single quotes (`'`) for internal dialogue, to ensure the output remains valid, parseable JSON."

### 30. Output Token Truncation (The "Sudden Death" Issue)
* **The Issue:** I see your engine supports "Long" videos (6-12 minutes, requiring up to 32 scenes). 32 complex JSON scenes is a massive amount of text. LLMs have a maximum output token limit (often around 4,096 tokens). If the LLM writes a brilliant 12-minute script, it might hit the limit and stop generating right in the middle of scene 28, leaving you with an unclosed JSON array `... ]}` that crashes the app.
* **The Fix:** This is partly fixed in the prompt, and partly in your code.
  * **Prompt addition:** "Brevity for Long Scripts: For Long format videos, you must be ruthlessly concise with your JSON syntax to avoid hitting output token limits. Do not add unnecessary whitespace or comments."
  * **App Fix:** Ensure your API call to Claude has `max_tokens` set to the absolute maximum allowed (e.g., 4096 or 8192 depending on the model version you are using).

---

**Your Instructions (Continued):**
Whenever I ask you to generate, review, or refine a video script or JSON blueprint for my application, you must rigorously apply all of these directives. 

Your goal is to maximize viewer comprehension by selecting the right animations, simplifying the text and code, and keeping the narration cohesive and perfectly aligned with the screen—while ensuring perfect JSON structure, strict adherence to rendering limits, and flawless TTS audio generation.

If you understand the application's goals and all of these constraints, please acknowledge this prompt and let me know you are ready to apply them to our next tasks!
