import type { Subject } from "@/lib/state";

const SCENE_MENU_HEADER = `
Scene kinds (every scene has "kind" and a unique kebab-case "id"). Narration is split into BEATS —
each beat is one spoken chunk ("say"/"narration", 1-2 sentences, <=320 chars but aim for ~24 spoken
words — a beat is ONE visual step and the picture cannot change while it is still being read) that plays EXACTLY while
its visual element appears. Write every beat about the element it accompanies and nothing else.

COMMON vs SPECIALISED: "bigtext, bullets, stat, compare, steps, chart, diagram, table, timeline,
quote, mythfact, quiz" are your COMMON workhorses — default to them for general explanation. The
richer specialised kinds (trace, terrain, sankey, statemachine, lifeline, iso3d, schematic…) earn
their place ONLY when the concept's motion or structure IS the point; never reach for a fancy kind
just for variety when a common one tells the story more clearly.

CONCEPT ICONS: in a "diagram" node icon or a "compare" side icon, instead of an emoji you may use one
of these concept WORDS to get a rich animated 3-D icon (auto-drawn) — strongly preferred for tech/
system topics: server, database, cache, queue, client, mobile, browser, cloud, api, loadbalancer,
cpu, disk, network, shield, gear, globe, message. (Aliases like db, redis, lb, auth, cdn also work.)
Anything else in an icon field is still treated as an emoji.`;

const ALL_KINDS_MENU = `

- {"kind":"bigtext","narration":"<=150 chars / ~24 spoken words — this is the WHOLE scene, so it is also exactly how long the card sits frozen","text":"<=80 chars","sub":"<=110 optional","icon":"optional ONE emoji shown large above the text (🚀, 🧠, ⚖️) — use when it sharpens the card"} — the opening hook or the closing recap ONLY; never a section title card
- {"kind":"bullets","sayIntro":"optional lead-in","title":"<=60","items":[{"text":"<=110","say":"spoken while THIS item appears"}, 2-5 items]}
- {"kind":"code","sayIntro":"optional setup line spoken over an empty editor","lang":"js|ts|python|sql|bash|yaml|text","title":"filename or panel title","code":"<=22 lines, EVERY line <=46 chars","segments":[{"fromLine":1,"toLine":4,"say":"spoken while lines 1-4 type"}, ...contiguous, covering every line exactly once],"focusLines":[optional emphasis],"expectedOutput":"exact stdout if executable code prints"} — typing panel; with lang "text" it is a typed worked-example/derivation panel
- {"kind":"terminal","narration":"<=210 chars — the typewriter animates while it plays, so this one may run longer","lines":["$ command","output", 1-10 lines, each <=60 chars]}
- {"kind":"diagram","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=28","x":0-11,"y":0-11,"w":2-12,"h":1-4,"accent":bool,"icon":"optional ONE emoji drawn above the label"}],"arrows":[{"from","to","label":"<=24 optional","curve":"optional bool, default false — bow the arrow instead of right-angle routing","style":"solid|dashed|double (optional, default solid) — dashed for optional/async links, double for a strong/bidirectional bond"}],"steps":[{"reveal":[node ids],"highlight":[node ids],"move":[{"node":"id","x":0-11,"y":0-11}, optional 0-4 — the node GLIDES to the new grid spot during this step's beat],"say":"spoken while THIS step reveals/highlights/moves"}, 1-8 steps]} — 12x12 grid, nodes must not overlap; tell the story step by step. Use "curve":true when a straight arrow would cross a node, "dashed"/"double" style to distinguish link kinds. "move" is perfect for sliding-window/two-pointer walks, queue shifts, swaps and anything that physically travels — narrate the movement while it happens
- {"kind":"tree","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=24","parent":"parent id, or null for the SINGLE root","icon":"optional concept-icon word or emoji"}, 2-14],"steps":[{"reveal":[node ids revealed together — usually one whole depth LEVEL],"say":"spoken as this level appears"}, 1-6]} — auto-laid-out hierarchy with tiered colours (root/mid/leaf) and rounded elbow connectors; reveals level by level. THE kind for classifications & hierarchies: type taxonomies (types of memory, DNS nameserver hierarchy), org/court/government charts, class inheritance, file trees, dynasty lineages. Give parent links only — positions are automatic.
- {"kind":"mindmap","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=24","parent":"parent id, or null for the SINGLE central idea"}, 2-14],"steps":[{"reveal":[node ids revealed together — usually one whole ring],"say":"spoken as this ring appears"}, 1-6]} — a RADIAL concept map: a central idea with branches curving outward, revealed ring by ring. For brainstorms, topic overviews, "everything connected to X", concept maps. (Radial — use "tree" instead for a strict top-down hierarchy.)
- {"kind":"iso3d","sayIntro":"optional","title":"<=60","stages":[{"label":"<=20","shape":"client|server|database|cache|queue|cloud|disk|cpu|loadbalancer (optional 3-D model)","say":"spoken as a packet flows INTO this stage"}, 2-5],"loop":"optional bool"} — a REAL 3-D isometric system scene: stages appear as extruded blocks/cylinders on a grid and a glowing packet flows stage→stage per beat. THE hero for request lifecycles and data paths (client→server→cache→DB, hard-drive→RAM, browser→CDN→origin). Use sparingly — one 3-D hero per video.
- {"kind":"orbit","sayIntro":"optional","title":"<=60","center":"<=20 central body","bodies":[{"label":"<=18","say":"spoken as this body's orbit appears"}, 1-6, inner→outer]} — a REAL 3-D orbital system: a glowing centre with bodies orbiting on tilted concentric rings, revealed inner→outer. For the solar system, electron shells, moon phases, satellites/ISRO missions, anything revolving around a core.
- {"kind":"compare","sayIntro":"optional","title":"<=60","left":{"title":"<=30","icon":"optional ONE emoji","items":["<=70",1-4],"say":"spoken while the LEFT panel shows"},"right":{same with its own "say" and optional "icon"},"verdict":"<=110 optional","sayVerdict":"spoken while the verdict appears"}
- {"kind":"question","narration":"<=150 chars / ~24 spoken words — the whole scene","text":"<=180","hint":"<=110 optional"} — ending challenge for comments
- {"kind":"timeline","sayIntro":"optional","title":"<=60","orient":"vertical|horizontal (optional, default vertical)","events":[{"when":"<=18 date/era/marker","label":"<=52","icon":"optional ONE emoji on the event","era":"<=20 optional — consecutive events sharing an era get a tinted background band","say":"spoken as THIS event appears"}, 2-6 chronological events]} — dated spine; ideal for history, the evolution of an idea, a sequence of events. Use orient "horizontal" on landscape/long videos to run the spine left-to-right with cards alternating above/below; add "era" to group consecutive events into labelled periods
- {"kind":"stat","narration":"<=150 chars / ~24 spoken words — the whole scene","value":"<=14 (e.g. \\"₹1.2 Cr\\", \\"40%\\", \\"8 min\\", \\"1 in 9\\")","label":"<=60 what the number measures","context":"<=100 optional framing"} — ONE huge number made visceral; use for a stunning figure or the payoff of a calculation. The value MUST be an actual number/quantity you are confident is TRUE — never a word like "Higher" or "Faster", and never a figure invented for impact (a wrong "wow" number is a factual error that destroys trust). If you are not certain of a real figure, use a different scene kind instead of guessing.
- {"kind":"steps","sayIntro":"optional","title":"<=60","steps":[{"text":"<=80","detail":"<=90 optional sub-line","say":"spoken as THIS step appears"}, 2-5 ordered steps]} — numbered spine; use for a how-to, an algorithm, or a worked method (slow way then fast way)
- {"kind":"quiz","question":"<=120","options":[{"text":"<=52","correct":true|false}, 3-4 options with EXACTLY ONE correct (2 only for a genuine true/false)],"sayQuestion":"spoken as the question+options appear","sayReveal":"spoken as the correct answer highlights"} — a mid-video multiple-choice check; wrong options must be plausible, each a real misconception
- {"kind":"vocab","sayIntro":"optional","word":"<=28","pron":"<=32 optional e.g. /ˈɛləkwənt/","pos":"<=16 optional noun/verb/adj","meaning":"<=90","examples":[{"text":"<=90 a real sentence that LITERALLY CONTAINS the word/phrase, used naturally","say":"spoken as THIS example appears"}, 1-3],"synonym":"<=48 optional"} — English-vocabulary flashcard; the word is auto-highlighted inside each example, so each example text MUST include the exact word/phrase (a sentence that only describes the meaning without using the word is wrong and teaches nothing)
- {"kind":"chart","sayIntro":"optional","title":"<=60","mode":"bars|column|line|area|pie|donut (optional, default bars)","items":[{"label":"<=24","value":number (plain number, no commas),"unit":"<=8 optional e.g. %, Cr, km","say":"spoken as THIS element appears"}, 2-6 items]} — animated comparison with counting values; one element reveals per beat. Pick mode: "pie"/"donut" for shares of a whole (values summing ~100, donut centre counts the running total), "line"/"area" for a trend across the item sequence over time, "column" for vertical bars, "bars" (default) for horizontal ranking bars
- {"kind":"quote","narration":"<=150 chars / ~24 spoken words — the whole scene","text":"<=200 the exact quotation","author":"<=40 optional"} — styled quotation card; ONLY real, correctly attributed quotes (or mark as proverb/saying)
- {"kind":"mythfact","myth":"<=140 the common false belief","fact":"<=160 the correction","sayMyth":"spoken while the myth card shows","sayFact":"spoken while the myth is struck out and the fact appears"} — myth-buster reveal; high-engagement way to correct a misconception
- {"kind":"table","sayIntro":"optional","title":"<=60","revealBy":"row|column (optional, default row)","columns":["<=18 header", 2-5],"rows":[{"cells":["<=24 value, one per column — prefix a cell with + to tint it green (added/good) or - to tint it red (removed/bad); the +/- stays visible","..."],"say":"spoken as THIS row (or column) reveals","highlight":bool optional},2-6 rows],"highlightCol":optional 0-based column to tint (the key/join column),"caption":"<=90 optional"} — animated data grid; header appears, then rows reveal one per beat (or set revealBy:"column" to wipe columns in left-to-right, ideal for schema/field explainers). PERFECT for SQL result sets / JOIN outputs / WHERE-filtered rows (set highlight:true on rows that match), a schema's columns, a pricing/plan comparison, or a before/after diff (use +/- cell prefixes). Keep cells short; narrate what each reveal shows.
- {"kind":"trace","sayIntro":"optional","title":"<=60","code":["<=44 chars per line", 2-12 lines],"cells":["<=8 chars", 3-10 initial array values],"steps":[{"line":1-based code line this step executes,"pointers":[{"label":"<=6 e.g. i","index":0-based cell}, max 3],"mark":[{"index":0-based,"state":"focus|done|visit"}],"swap":{"a":idx,"b":idx} optional — the two cell values arc over each other,"say":"narrate what THIS step does"}, 1-10]} — algorithm stepper: a code panel beside a live array; each beat highlights a code line while pointers glide, cells mark and swap. THE kind for sorting, two-pointers, sliding window, binary search walks
- {"kind":"memgrid","sayIntro":"optional","title":"<=60","cells":[{"addr":"<=6 e.g. 0x04","value":"<=10 optional (omit = free slot)"}, 4-12],"steps":[{"write":[{"index":i,"value":"<=10"}],"free":[indexes],"pointer":{"label":"<=8 e.g. head","index":i} optional — ONE labelled pointer chip glides between cells,"highlight":[indexes],"say"}, 1-8]} — memory cells with addresses: values type in, frees empty out, the pointer walks. For arrays vs linked lists, hash slots, stack vs heap, caching/paging
- {"kind":"callstack","sayIntro":"optional","title":"<=60","steps":[{"op":"push|pop","frame":"<=24 REQUIRED on push e.g. fib(3)","note":"<=40 optional","ret":"<=12 optional on pop — the return value floats down to the caller","say"}, 2-10; never pop an empty stack]} — call-stack frames pushing and popping. For recursion, stack overflow, how function calls really work
- {"kind":"lifeline","sayIntro":"optional","title":"<=60","actors":[{"id","label":"<=16","icon":"optional ONE emoji"}, 2-4],"messages":[{"from":actor id,"to":actor id (never itself),"label":"<=28","style":"call|return|data","say":"narrate THIS message"}, 1-8]} — sequence diagram: actor columns with lifelines, a glowing envelope travels per beat. THE kind for handshakes (TCP, TLS), auth/OAuth flows, request lifecycles, DNS, replication
- {"kind":"bits","sayIntro":"optional","title":"<=60","width":4-12,"steps":[{"op":"set|and|or|xor|not|shl|shr","value":"0/1 string of EXACTLY width chars — required for set/and/or/xor","note":"<=30 optional","say"}, 1-8]} — a binary register: tiles flip and shift with a live decimal readout. For bit manipulation, masks, subnets, permissions, binary numbers
- {"kind":"browserframe","sayIntro":"optional","url":"<=48","blocks":[{"id","role":"header|hero|text|image|button|card","x":0-11,"y":0-11,"w":1-12,"h":1-6}, 2-8],"steps":[{"show":[block ids appear as loading skeletons],"paint":[block ids hydrate with colour],"shift":{"block":id,"y":new row} optional — the layout-shift moment,"badge":"<=24 optional chip by the URL bar e.g. \\"DNS 20ms\\"","say"}, 1-8]} — a browser window renders a wireframe page stage by stage. For how browsers render, critical rendering path, CLS/web performance, hydration
- {"kind":"cycle","sayIntro":"optional","title":"<=60","nodes":[{"label":"<=22","icon":"optional ONE emoji","detail":"<=40 optional, shown in the ring centre","say":"narrate THIS stage"}, 3-8]} — a circular loop: each beat lights the next stage, then dots flow around forever. THE kind for anything that repeats — water/carbon/nutrient cycles, the event loop, habit loops, business cycles
- {"kind":"statemachine","sayIntro":"optional","title":"<=60","states":[{"id","label":"<=18","x":0-11,"y":0-11,"accent":bool}, 2-6],"edges":[{"from","to","label":"<=16 optional — the event/trigger"}, 1-10],"steps":[{"go":"state id the token moves to — an edge from the previous state MUST exist; the walk starts at the FIRST state","say"}, 1-8]} — a glowing token walks the states edge by edge. For TCP connection states, process lifecycles, order status flows, how a bill becomes an act
- {"kind":"decision","sayIntro":"optional","title":"<=60","nodes":[{"id","shape":"question|outcome","label":"<=40","x":0-11,"y":0-11}, 2-8],"edges":[{"from","to","label":"<=10 e.g. yes/no"}, 1-10],"steps":[{"go":"node id — an edge from the previous node MUST exist; the walk starts at the FIRST node","say"}, 1-8]} — a flowchart walk: diamonds decide, rejected branches grey out, the final outcome stamps. For which-X-to-use guides, eligibility/qualification rules
- {"kind":"chain","sayIntro":"optional","title":"<=60","links":[{"text":"<=60","icon":"optional ONE emoji","say":"narrate THIS link"}, 3-7]} — domino cause-and-effect: each card tips over and knocks the next upright. THE kind for causal chains in history, inflation spirals, cascade failures, food chains
- {"kind":"pipeline","sayIntro":"optional","title":"<=60","item":{"label":"<=16 what enters","icon":"optional"},"stations":[{"label":"<=20","icon":"optional","out":"<=16 what the item BECOMES after this station","say"}, 2-6]} — an item rides a conveyor and visibly transforms at each station. For compilation, CI/CD, supply chains, how X gets made
- {"kind":"ledger","sayIntro":"optional","title":"<=60","unit":"<=4 default ₹","parties":[{"id","label":"<=16","icon":"optional","start":opening balance number}, 2-4],"transfers":[{"from":party id,"to":party id,"amount":number,"label":"<=24 optional","say":"narrate THIS payment"}, 1-6]} — party cards with LIVE balances; coins stream between them and both balances tick in sync. THE kind for money flows: repo rate transmission, taxes, UPI, subsidies, trade
- {"kind":"sankey","sayIntro":"optional","title":"<=60","source":{"label":"<=24","total":number,"unit":"<=8 optional"},"branches":[{"label":"<=22","value":number,"say":"narrate THIS share"}, 2-6; values must NOT sum above total]} — proportional ribbons fan out from one total, each with a counting % chip. For budget allocation, GDP composition, energy mix, where the rain goes
- {"kind":"gauge","sayIntro":"optional","title":"<=60","min":number,"max":number,"unit":"<=8 optional","zones":[{"upTo":number (ascending),"label":"<=12 optional","tone":"good|warn|danger"}, 0-3],"readings":[{"label":"<=24","value":number within min-max,"say"}, 1-4]} — a big dial: the needle sweeps to each reading with overshoot and a counting readout. For repo rate, inflation, AQI, earthquake magnitude — any metric with healthy/danger ranges
- {"kind":"pictogram","sayIntro":"optional","title":"<=60","mode":"grid|arc (arc = parliament hemicycle)","total":10-100 person icons,"groups":[{"label":"<=22","count":int,"say":"narrate THIS group"}, 1-4; counts must NOT sum above total],"majorityAt":optional seat index where the majority tick sits (arc mode)} — people-as-units: waves of person icons tint per group. For 1-in-N statistics, literacy/employment shares, parliament seats (arc + majorityAt)
- {"kind":"race","sayIntro":"optional","title":"<=60","unit":"<=8 optional","racers":[{"label":"<=16","icon":"optional"}, 2-5],"checkpoints":[{"when":"<=12 e.g. 1990","values":[one number per racer, same order],"say":"narrate THIS moment of the race"}, 2-6]} — an animated ranking race across time: bars grow, overtake, and lanes swap places. For GDP races, adoption battles, empires or companies over decades
- {"kind":"schematic","sayIntro":"optional","title":"<=60","parts":[{"id","shape":"dome|onion-dome|spire|finial|pillar|arch|gateway|platform|stairs|wall|tower|cone|umbrella|flag|orb|wave|mound|ring|block","x":0-11,"y":0-11,"w":1-12,"h":1-8,"label":"<=24 optional, shown when highlighted"}, 2-12 — parts MAY overlap to compose (a dome ON a wall, an umbrella ABOVE a mound); earlier parts draw behind],"steps":[{"reveal":[part ids draw on blueprint-style],"highlight":[part ids get label chips with leader lines],"say"}, 1-8]} — labelled anatomy drawn like a technical blueprint. THE kind for temple/stupa/mosque anatomy, monument features, cross-sections built from named parts
- {"kind":"terrain","sayIntro":"optional","title":"<=60","profile":[4-12 elevation samples 0-10, left to right — the landscape silhouette],"river":bool (a river flows from the highest point to the right edge),"features":[{"at":0-11 horizontal position,"kind":"peak|glacier|dam|city|delta|rain|wind|plate|volcano|forest","label":"<=20","say":"narrate THIS feature"}, 1-6]} — a living side-view landscape; pins drop and vignettes play (rain falls, winds curl over the ridge, plates collide, embers rise). For river journeys, monsoon vs mountains, plate tectonics, dams
- {"kind":"zoomladder","sayIntro":"optional","title":"<=60 optional","direction":"out|in","rungs":[{"label":"<=24","scale":"<=14 e.g. \\"1 km\\"","icon":"ONE emoji strongly recommended","say":"narrate THIS magnitude"}, 2-6, ordered smallest→largest]} — a powers-of-ten camera: each beat zooms to the next magnitude with a breadcrumb trail. For atom→cell→you, village→India→Earth, byte→datacenter, second→era
- {"kind":"dialogue","sayIntro":"optional","title":"<=40 optional","left":{"name":"<=14","icon":"optional ONE emoji"},"right":{"name":"<=14","icon":"optional"},"messages":[{"from":"left|right","text":"<=110","reaction":"optional ONE emoji","say":"speak THIS message (may quote or paraphrase it)"}, 2-8]} — a chat conversation: typing dots, bubbles pop in, reactions land. For prompt/LLM transcripts, debates, courtroom or assembly exchanges, "if X and Y texted" history
- {"kind":"graphwalk","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=16","x":0-11,"y":0-11}, 3-8],"edges":[{"from","to","weight":optional int 1-99}, 2-12],"steps":[{"visit":[node ids newly finalised],"frontier":[node ids being explored this step],"dist":[{"node","value":"<=6 e.g. 7 or ∞"}],"path":[node ids of the final route, usually only the last step],"say"}, 1-8]} — an algorithm exploring a graph: visited nodes fill, the frontier pulses, distance chips tick, the shortest path glows. For BFS/DFS, Dijkstra, shortest path, spanning trees, network spread
- {"kind":"matrix","sayIntro":"optional","title":"<=60","rows":2-8,"cols":2-10,"rowLabels":["<=8", optional, empty or one per row],"colLabels":["<=8", optional, empty or one per col],"steps":[{"set":[{"r":0-based row,"c":0-based col,"value":"<=6 optional","tone":"accent|good|warn|dim"}],"sweep":{"kind":"row|col|diag","index":which} optional — a highlight band travels that line,"say"}, 1-8]} — a 2D grid that fills cell by cell. THE kind for DP tables, flood fill, Punnett squares, spreadsheets, pixel grids
- {"kind":"threads","sayIntro":"optional","title":"<=60","lanes":[{"label":"<=12"}, 2-4 parallel lanes],"tasks":[{"id","lane":0-based,"label":"<=14","start":0-11 time,"len":1-12,"kind":"run|wait|crit"}, 2-12],"steps":[{"reveal":[task ids appear],"marker":{"at":0-11 time,"label":"<=16"} optional — a sync fence across all lanes,"clash":[task ids that collide — a race condition],"say"}, 1-8]} — parallel timelines: task blocks run, wait (hatched), and clash. For concurrency, async/await, threads, race conditions, parallel vs sequential
- {"kind":"queueflow","sayIntro":"optional","title":"<=60","servers":1-4,"steps":[{"arrive":0-6 new items this step,"serve":0-6 items served this step,"note":"<=24 optional","say"}, 1-8]} — arrivals queue up and servers process them; the queue visibly grows when arrivals outpace service. For queues, load balancing, rate limiting, backpressure, real-world lines
- {"kind":"cipher","sayIntro":"optional","title":"<=60","mode":"shift|hash","text":"UPPERCASE A-Z and spaces only, <=12","shift":1-25 (required for shift mode),"steps":[{"op":"map|input|mix|digest|avalanche","upTo":optional letters mapped so far (shift mode),"say"}, 1-8]} — encryption made visible: Caesar letters map through a shift, or a hash box churns input into an avalanche of hex. For cryptography, hashing, encoding basics
- {"kind":"circuit","sayIntro":"optional","title":"<=60","parts":[{"id","kind":"battery|bulb|switch|resistor|and|or|not|led","x":0-11,"y":0-11,"label":"<=10 optional"}, 2-10],"wires":[{"from":part id,"to":part id}, 1-12],"steps":[{"close":[switch ids that close],"on":[part ids that energise],"signal":bool (current flows visibly around the loop),"highlight":[part ids get a label],"say"}, 1-8]} — an electrical circuit where current flows as glowing dots when the switch closes. For electricity, series vs parallel, logic gates, how circuits work
- {"kind":"formula","sayIntro":"optional","title":"<=60","lhs":{"symbol":"<=10 e.g. GDP","gloss":"<=30 plain words"},"terms":[{"op":"(empty for first)|+|−|×|÷|^","symbol":"<=10","gloss":"<=30 plain-words meaning","value":"<=10 optional number to substitute","say"}, 1-6],"resultValue":"<=12 optional","sayResult":"optional — spoken as the formula computes"} — an equation assembles term by term, each with a plain-words gloss, then optionally computes. For any formula: GDP, compound interest, F=ma, EMI
- {"kind":"curves","sayIntro":"optional","title":"<=60","xLabel":"<=14 optional","yLabel":"<=14 optional","curves":[{"label":"<=16","shape":"linear|exp|log|sine|bell|supply|demand|scurve|ushape","say"}, 1-3],"mark":{"x":0-100 percent across,"label":"<=20","say"} optional — a point or the intersection of two curves} — continuous function graphs that draw on; two curves can cross at an equilibrium. For supply-demand, exponential vs linear growth, distributions, break-even
- {"kind":"buckets","sayIntro":"optional","title":"<=60","unit":"<=4 default ₹","buckets":[{"label":"<=16","capacity":number,"rate":"<=8 optional e.g. 5%"}, 2-5],"pours":[{"amount":number,"say"}, 1-6]} — liquid pours in and OVERFLOWS from a full bucket into the next. THE kind for marginal tax slabs, reservoirs, tiered quotas, cascading fills
- {"kind":"probability","sayIntro":"optional","title":"<=60","segments":[{"label":"<=12","weight":int 1-10,"win":bool}, 2-8],"spins":[{"land":0-based segment index it lands on,"say"}, 1-6],"verdict":"<=60 optional","sayVerdict":"optional"} — a spinner wheel lands on outcomes and a tally converges toward the expected probability. For probability, odds, gambler's fallacy, expected value
- {"kind":"basket","sayIntro":"optional","title":"<=60","unit":"<=4 default ₹","items":[{"label":"<=14","icon":"optional emoji","prices":[one price per year, 2-4 numbers]}, 2-6],"years":[{"when":"<=8 e.g. 2020","say"}, 2-4]} — the SAME shopping cart, priced across years, total climbing. THE kind for inflation, CPI, cost of living, purchasing power
- {"kind":"radar","sayIntro":"optional","title":"<=60","axes":["<=14", 3-6 axis names],"entities":[{"label":"<=16","values":[one 0-100 per axis, same order],"say"}, 1-3]} — a spider chart; each entity's polygon extends along the axes. For multi-trait comparisons: phone specs, empire strengths, skill profiles
- {"kind":"bodymap","sayIntro":"optional","title":"<=60","path":bool (marks form a JOURNEY — a signal/food travelling),"marks":[{"region":"brain|eyes|ears|throat|heart|lungs|stomach|liver|kidneys|intestines|muscles|bones|skin|blood","label":"<=20","say"}, 1-6]} — a human body silhouette; organs glow per beat, or a pulse travels a path. For anatomy, digestion, circulation, nerve signals
- {"kind":"constellation","sayIntro":"optional","title":"<=60","points":[{"id","x":0-11,"y":0-11,"label":"<=12 optional"}, 4-12],"steps":[{"connect":[{"a":point id,"b":point id}, 1-6],"say"}, 1-8],"finale":{"label":"<=24","say"} optional} — scattered dots connect line by line until a shape emerges. For constellations, connecting clues, correlation/trend reveal, pattern recognition
- {"kind":"dayclock","sayIntro":"optional","title":"<=60","face":"12h|24h","pins":[{"at":"HH:MM 24-hour","label":"<=24","icon":"optional emoji","say"}, 2-8]} — a clock face; hands sweep and events pin to times. THE kind for deep time compressed to a day, circadian rhythm, a day-in-the-life
- {"kind":"storyboard","sayIntro":"optional","title":"<=60","panels":[{"icons":["1-4 emoji composing the scene"],"caption":"<=60","say"}, 2-6]} — comic-strip panels revealed one per beat, each a captioned scene. For mythology and history scenes, moral dilemmas, step-by-step stories
- {"kind":"bracket","sayIntro":"optional","title":"<=60","contenders":[{"label":"<=14","icon":"optional emoji"}, 4-8],"matches":[{"winner":0 or 1 (top or bottom of the pair),"say"}, EXACTLY contenders-1 matches in play order]} — a single-elimination tournament; winners advance until a champion is crowned. For "best of" rankings, knockout comparisons, playoff explainers
- {"kind":"showdown","sayIntro":"optional","title":"<=60","left":{"label":"<=14","icon":"optional"},"right":{"label":"<=14","icon":"optional"},"rounds":[{"criterion":"<=18","winner":"left|right|tie","note":"<=40 optional","say"}, 2-6],"verdict":"<=60 optional","sayVerdict":"optional"} — a round-by-round versus bout scored on each criterion. For X vs Y face-offs (SQL vs NoSQL, rent vs buy), judged comparisons
- {"kind":"skyline","sayIntro":"optional","title":"<=60","eras":[{"when":"<=12","buildings":[{"kind":"hut|house|mill|tower|skyscraper|temple|dome|landmark","h":1-10}, 1-5],"stat":"<=14 optional e.g. 1.2M","say"}, 2-6]} — a city skyline that grows era by era, buildings rising from the ground. For urbanisation, population growth, a company's rise
- {"kind":"calendar","sayIntro":"optional","title":"<=60","marks":[{"from":1-12 month,"to":1-12 month (>= from; split a wrap-around into two marks),"label":"<=16","tone":"accent|secondary|good|warn","say"}, 1-6]} — a 12-month strip; seasons and event windows sweep across the months. For crop seasons, monsoon onset, festival calendars, fiscal-year events
- {"kind":"geomap","sayIntro":"optional","title":"<=60","base":"india|world|asia|subcontinent|europe","markers":[{"id","label":"<=24","lon":number,"lat":number,"kind":"city|battle|capital|port|peak|dot"}, max 8],"routes":[{"id","points":[{"lon","lat"}],"label":"<=24","style":"route|river|wind|front"}, max 4],"regions":[{"id","name":"<=40"}],"steps":[{"reveal":[ids],"highlight":[ids],"focus":{"lon","lat","zoom":1-8},"say"}, 1-8]} — plan-view geographic map with markers, river/route flows, and regional highlights. THE kind for geography, empire maps, battles, trade routes, monsoon winds, and migration
- {"kind":"numberline","sayIntro":"optional","title":"<=60","min":number,"max":number,"tickUnit":"<=8","mode":"line|plane","marks":[{"value":number,"y":number,"label":"<=20","kind":"point|jump|range","to":number,"say"}, 1-6]} — number line & coordinate points: points drop, jumps hop, ranges sweep. THE math number-sense primitive for series, percentages, doubling hops, frequency scales, and altitude
- {"kind":"geometry","sayIntro":"optional","title":"<=60","points":[{"id","x":0-100,"y":0-100,"label":"<=8"}, max 10],"segments":[{"a","b","label":"<=12","style":"side|aux|ray|radius"}],"angles":[{"at","from","to","label":"<=8","right":bool}],"fills":[{"pts":[ids],"label":"<=14","value":"<=10"}],"steps":[{"reveal":[ids],"highlight":[ids],"say"}, 1-8]} — labelled geometric figure & visual proofs: triangles, circles, rays, angles, and area proof fills (Pythagoras a²+b²=c², unit circle, ray diagrams)
- {"kind":"molecule","sayIntro":"optional","title":"<=60","mode":"equation|structure","equation":{"left":[{"formula","count"}],"right":[{"formula","count"}],"sayLeft","sayReact","sayRight"},"structure":{"atoms":[{"el","x","y"}],"bonds":[{"a","b","order":1-3}],"steps":[{"reveal":[idx],"say"}]}} — chemical equations and 2-D molecular structures: equations recombine with bond reformation; structures reveal bonding
- {"kind":"layers","sayIntro":"optional","title":"<=60","shape":"stack|rings|dome","layers":[{"label":"<=26","detail":"<=60","icon":"optional","say"}, 2-7]} — stacked/concentric layer peel: horizontal/vertical bands or concentric rings that expand apart. THE kind for OSI 7 layers, computer memory hierarchy, Earth interior, soil horizons, atmosphere bands
- {"kind":"trafficflow","sayIntro":"optional","title":"<=60","algorithm":"round-robin|least-connections|hash","clients":1-8,"servers":[{"id","label":"<=24","load":0-100,"status":"healthy|overloaded|drained"}, 2-6],"steps":[{"targetServer":"id","rate":"<=16","say"}, 1-8]} — load balancer & traffic sharding: requests route to server pools with live load meters and particle flow pipes
- {"kind":"eventbus","sayIntro":"optional","title":"<=60","busName":"<=40","producers":[{"id","label":"<=20"}],"topics":[{"id","name":"<=24"}],"consumers":[{"id","label":"<=20","topicId":"id"}],"steps":[{"publish":{"producerId":"id","topicId":"id","event":"<=20"},"consume":{"consumerId":"id","topicId":"id"},"say"}, 1-8]} — pub/sub message bus streaming: producers publish events to topics; consumers fan out to process streams
- {"kind":"globe3d","sayIntro":"optional","title":"<=60","markers":[{"id","label":"<=24","lon":-180..180,"lat":-90..90,"kind":"city|wind|current|zone|peak|dot"}, 1-8],"arcs":[{"fromLon","fromLat","toLon","toLat","label":"<=24 optional","style":"wind|current|route|jet"}, 0-5],"steps":[{"reveal":["marker ids"],"highlight":["marker ids"],"arcs":[indices into arcs[]],"focus":{"lon","lat"} optional,"say"}, 1-8]} — a REAL 3-D rotating Earth (three.js): pins on lon/lat, great-circle arcs, the globe eases so each focused region faces the camera. THE kind for planetary-scale phenomena — jet streams, ocean/gulf currents, global pressure belts, climate zones, continent-spanning geography
- {"kind":"dp_table_fill","sayIntro":"optional","title":"<=60","rows":2-12,"cols":2-12,"rowLabels":["<=8", 0 or rows entries e.g. \\"\\",\\"A\\",\\"B\\"],"colLabels":["<=8", 0 or cols entries],"steps":[{"cells":[{"r":0-based,"c":0-based,"value":"<=6"}, 1-12 cells written this beat],"focus":{"r","c"} optional — the current cell,"deps":[{"r","c"}, 0-4 cells whose arrows point INTO focus e.g. top/left/diagonal],"say"}, 1-10]} — a 2-D Dynamic-Programming table that fills cell by cell, highlighting the current cell and drawing dependency arrows from the cells that feed it. THE kind for LCS, Edit Distance, 0/1 Knapsack, and any 2-D DP state-transition table
- {"kind":"sysarch","sayIntro":"optional","title":"<=60","tiers":[{"id","label":"<=20","kind":"client|cdn|gateway|lb|app|worker|cache|queue|db|storage","count":1-5 replicas shown,"say"}, 2-6],"flows":[{"from":"tier id","to":"tier id","label":"<=16 optional","style":"solid|dashed"}, 0-12]} — a cloud-native tiered architecture: extruded depth cards reveal one per beat, a tier with count>1 shows stacked replicas (horizontal scaling), animated packets flow along the connectors. For load balancers, leader-follower replication, vertical vs horizontal scaling, request paths through client→CDN→gateway→app→cache/db
- {"kind":"slidingwindow","id","title","values":["1","2",…],"metric":"in flight","steps":[{"left":0,"right":3,"value":"4 KB","note":"receiver window","tone":"accent","say":""}],"sayIntro?"} — a resizable window frame sliding over a row of value cells with L/R pointer chips and a running aggregate readout; use for TCP/download flow-control windows, sliding-window algorithms, and greedy jump/expand windows (one beat = one window position).
- {"kind":"trendgraph","title":"...","sayIntro":"?optional intro","unit":"?%|₹","series":[{"label":"Actual GDP","values":[n,...],"role":"accent|secondary|muted"}, ...2-3 series],"band":true,"steps":[{"x":"FY19","say":"..."}, ...2-10]} — a multi-line trend graph that reveals 2–3 diverging time series left→right on one shared axis and shades the divergence band between the first two series; use for output gap (Actual vs Potential GDP), Nominal vs Real GDP / the deflator, or WPI vs CPI divergence. Each series' values[] length MUST equal steps[] length; give the first two series contrasting roles (e.g. accent + muted) so the gap reads clearly.
- {"kind":"topology","title":"...","nodes":[{"id":"...","label":"...","kind":"hub|switch|router|host|node","x":0-11,"y":0-11}],"links":[{"from":"nodeId","to":"nodeId"}],"steps":[{"focus":"nodeId","emit":"none|one|all","target":"nodeId?","say":"..."}]} — a network topology of hubs/switches/routers/hosts/P2P peers wired by links; each beat lights one focus device and emits a frame to ALL its neighbours (a hub's broadcast domain — everyone hears it) or to ONE target (a switch's unicast forward, or a single Chord finger hop). Use for broadcast-vs-switched explainers, DaemonSet one-pod-per-node reveals, and DHT/finger-table routing.
- {"kind":"scroll","sayIntro":"optional","title":"<=60","heading":"<=40 optional document header","seal":"1 emoji optional wax stamp","lines":[{"text":"<=90","label":"<=16 optional clause/era e.g. \"81(1)\"","say"}, 2-6]} — an aged parchment/edict that unfurls between two scroll rods, each line writing itself in one per beat (quill typewriter) with a wax seal pressed at the end. THE kind for stone inscriptions, constitutional articles, royal edicts, treaties, and any historical document read line by line
- {"kind":"tactical_map","id","title","sideALabel","sideBLabel","terrain":"hills|plain|river|fort","units":[{"id","side":"a|b","label","x":0-12,"y":0-12,"strength":1-9}],"steps":[{"kind":"move|clash","moves":[{"unit","toX":0-12,"toY":0-12}],"clashAt":{"x","y"}?,"say"}],"sayIntro"?} — strategic battle map: troop blocks maneuver over stylized terrain, flanking arrows on MOVE beats and a shockwave on CLASH beats; use for battles/campaigns/troop movements (Panipat, night raids, chariot warfare).
- {"kind":"architecture_blueprint","sayIntro":"optional","title":"<=60","parts":[{"id","shape":"wall|room|dome|minaret|court|road|gate","x":0-11,"y":0-11,"w":1-12,"h":1-12,"label":"<=24 optional, shown when highlighted"}, 2-14 — a TOP-DOWN plan; parts MAY overlap to compose (a court inside a room, a gate on a wall, a dome over a room); earlier parts draw behind],"steps":[{"reveal":[part ids that ink on this beat],"highlight":[part ids that glow + get label chips with leader lines],"say"}, 1-8]} — a top-down architectural blueprint on faint grid paper: walls (hatched poché), rooms, open courtyards, roads (with flowing traffic + dashed centreline), gates (with a door-swing arc), and top-view domes/minarets ink themselves on one group per beat. THE kind for grid-city street plans (e.g. Kalibangan), mosque and temple floorplans, tomb-and-garden layouts, fort and monument site plans built from named parts
- {"kind":"packet_delivery","sayIntro":"optional","title":"<=60","hops":[{"id","label":"<=20","kind":"host|router|proxy|firewall"}, 2-6],"steps":[{"action":"send|drop|retransmit|inspect|ack","from":"hop id","to":"hop id","at":"hop id optional — where drop/inspect happens","payload":"<=18 optional envelope contents","payloadAfter":"<=18 optional rewritten contents","say"}, 1-8]} — packets as literal envelopes travelling hop-to-hop; each beat sends, loses (envelope falls + fades), retransmits a fresh envelope, inspects (flap opens at a proxy/firewall, contents can be rewritten), or acks (envelope travels back). Use for TCP loss/retransmit, ARP spoofing/interception, the HTTP→WebSocket upgrade, and any proxy/firewall packet path.
- {"kind":"codediff","sayIntro":"optional line spoken over the file before the first hunk","title":"<=60","filename":"<=32, shown in the editor tab e.g. app.js","lang":"<=12, badge in the status bar e.g. js","lines":[{"text":"<=52 chars, one exact source line (blank allowed)","kind":"same|add|del"}, 2-16 in file order — a unified diff: "same" context lines set the shape, "add" are green additions, "del" are red deletions],"steps":[{"focus":[0-based line indices this hunk reveals/highlights],"say":"spoken while this hunk lands"}, 1-8]} — a unified inline code-diff: green additions and red struck-through deletions reveal one hunk per beat behind a +/- gutter, the active hunk breathing with an accent edge. THE kind for refactors, bug fixes, and before/after version-control changes (git revert vs reset, let vs var, adding a few config lines)
- {"kind":"parliament_arc","sayIntro":"optional","title":"<=60","total":6-600 seats in the hemicycle,"majorityAt":optional seat index where the majority tick sits (e.g. 272 for a Lok Sabha simple majority, the two-thirds line for an Article 368 special majority),"factions":[{"label":"<=22","seats":int,"tone":"for|against|abstain|accent|secondary","say":"narrate THIS faction"}, 1-6; factions fill left→right and a running tally shows in the centre]} — a semicircle legislative chamber that fills with seat dots faction by faction; a threshold line flashes as the tally crosses it and the centre readout flips to MAJORITY REACHED. For amendment thresholds (Article 368 special majority), bill/vote arithmetic, "how many votes to pass", and seat-count questions like the Supreme Court bench size
- {"kind":"server_rack","sayIntro":"optional","title":"<=60","racks":[{"id","label":"<=20","slots":1-8 blade bays,"active":optional initial healthy-blade count (default = slots, i.e. fully populated)","group":"<=20 optional — racks sharing a group get a dashed isolation boundary drawn around them"}, 1-5 racks],"steps":[{"op":"crash|recover|scale|lead|failover|probe","rack":rack id,"slot":optional 0-based blade index (default: crash/probe pick a healthy blade, scale picks an empty one, lead picks the first non-crashed blade),"to":{"rack":id,"slot":int} — REQUIRED for failover, the destination blade that becomes the new leader,"note":"<=28 optional caption chip","say":"narrate THIS mutation"}, 1-8 steps]} — a REAL 3-D physical data-center: racks of blades with blinking LEDs. "crash" darkens a blade and it catches fire, "recover" brings a crashed blade back, "scale" lights up a new blade, "lead" crowns a permanent leader (persists across steps), "failover" crashes the old leader and moves the crown to "to", "probe" pulses a monitoring ring with no state change. THE kind for failure detectors & heartbeat timeouts, container/network isolation (group racks into networks), and leader election / failover in replicated databases.
- {"kind":"jigsaw_puzzle","sayIntro":"optional","title":"<=60","pieces":[{"label":"<=26","icon":"optional: drawIcon vector name (shield/server/database/...) or one emoji","sub":"<=28 optional caption","fits":true|false default true — false = piece never seats, hovers off-seam and rattles,"say"}, 2-6]} — abstract concepts as interlocking jigsaw pieces that slide in from alternating sides and SNAP together (easeOutBack) when they're truly complementary halves of one whole (fits:true), or hover off-seam and rattle when they don't actually fit (fits:false). THE kind for contrasting two protocols/mechanisms/policies that are often confused — OAuth vs OIDC (authorization vs authentication), static vs dynamic linking, capex vs revenue multipliers
- {"kind":"domino_cascade","dominoes":[{"label","icon?","say"}] (3-7 items)} — a row (or column in 9:16) of standing domino tiles that topple one into the next, one domino revealed per narration beat; use for compounding cause-effect chains and cascading/feedback loops (wage-price spirals, Netflix Chaos-Monkey-style failure cascades, thrashing feedback loops) — NOT for a simple linear sequence with no causal "this triggers that" relationship (use "chain" or "steps" instead).
- {"kind":"sheet_music","sayIntro":"optional","title":"<=60","keyLabel":"<=28 optional e.g. raga/tala/instrument name","legend":[{"voice":"a|b","label":"<=16"}, 0-2 — name the two voices when comparing instruments/singers],"tala":{"beats":2-16,"sam":1-16 default 1,"label":"<=16 optional"} optional — a rhythmic-cycle tick strip,"steps":[{"notes":[{"pos":-6..6 int (0=middle line, ±2 per line/space, ±5/±6=ledger notes),"dur":"whole|half|quarter|eighth|sixteenth","label":"<=10 optional syllable/note name","voice":"a|b","slideToNext":bool — meend/glide tie into the next note}, 1-8],"matra":1-16 optional — which tala beat this phrase lands on,"say"}, 1-8]} — a 5-line staff that reveals one phrase per beat as its own row while a playhead sweeps left-to-right lighting each notehead; two colour-coded voices can share one staff. THE kind for ragas, comparing two instruments/vocal styles (Sitar vs Sarod), and explaining tala/rhythmic timing (Thumri, Teentaal)
- {"kind":"canvas_reveal","sayIntro":"optional","title":"<=60","artLabel":"<=30 optional museum-placard caption","canvasColor":"#rrggbb optional, the ground pigment the motifs sit on","regions":[{"id","x":0-11,"y":0-11,"w":1-12,"h":1-12,"label":"<=24","color":"#rrggbb","shape":"rect|blob|triangle"}, 1-6 painted motifs on a 12x12 grid, may overlap],"swatches":[{"hex":"#rrggbb","label":"<=20"}, 0-6 named pigments],"steps":[{"focus":"a region id — camera zooms/pans here, omit for a full-canvas beat","swatchIndex":"index into swatches[] revealed this beat, optional","say"}, 1-8]} — zoom into a framed painting/artifact, panning to one motif per beat while its real pigment pops into a swatch strip below. THE kind for decoding an artwork's colour story: Warli's white-on-red, Thangka palettes, Harappan figurine motifs
- {"kind":"scalecompare","axis":"height|length","scale":"linear|log","unit":"shared unit e.g. m/km/ns","items":[{"label","value","icon?"}] (2-5),"verdict?":"closing line"} — overlays scaled silhouettes (waterfalls, empires' trade roads, CPU-vs-disk latencies…) on one shared baseline so a size/length/time-scale ratio hits viscerally, with counting values and a live "N× bigger" callout; use for "A vs B, which is bigger" or "if X were 1 unit, Y would take..." scripts.
- {"kind":"fluidflow","sayIntro":"optional","title":"<=60","sources":[{"id","label":"<=24","x":0-12,"y":0-12,"flowDeg":0-359 default 90 (screen-space: 0=east,90=south,180=west,270=north),"icon":"1 emoji optional"}, 1-6],"sinks":[{"id","label":"<=24","x":0-12,"y":0-12}, 0-4],"steps":[{"reveal":["source ids introduced this beat"],"highlight":["source ids emphasized this beat, defaults to reveal"],"revealSinks":["sink ids introduced this beat"],"say"}, 1-8]} — a particle field advecting along simplex-noise-bent streamlines from each source's flowDeg heading, with a faint direction-tick field and glowing origin/destination pins. THE kind for continuous physical flow: ocean currents (Gulf Stream), wind belts/weather fronts, river/drainage networks — several sources at one spot with different headings read as radial drainage (Amarkantak sending rivers in all directions), one source→sink reads as a single current (Gulf Stream → London).
- {"kind":"ecosystem_web","nodes":[{id,label,kind:producer|consumer|factor,icon?}],"links":[{id,from,to,type:eats|affects,label?}],"steps":[{reveal:[linkId,...],say}]} — an organic interconnected web linking producers/consumers/environmental factors to explain food chains, biodiversity and ecological interdependence; each step reveals one or more links as a chain (energy or disruption flowing along the edge), e.g. microplastics entering a food chain, deforestation breaking the water cycle, or trawling threatening dugongs through their seagrass meadow.
- {"kind":"turing_tape","sayIntro":"optional","title":"<=60","initial":["<=4 chars each, 1-12 cells — the tape's starting contents e.g. bits or register values"],"headStart":0-11 index into initial where the head starts,"blank":"<=2 default glyph shown for untouched cells e.g. \"0\" or \"·\"","showIndex":bool optional — label each cell with its index,"steps":[{"write":"<=4 optional new value written into the cell under the head","move":"L|R|none","state":"<=16 optional status/instruction label e.g. \"carry\", \"LOAD x\"","say"}, 1-10]} — an infinite tape scrolls beneath a fixed read/write head; each beat can write the current cell, glide the head left/right, and update a state chip above it. THE kind for how a single bit of memory is stored (SR latches, move:"none" throughout), two's-complement / ripple-carry bit flips (walk the head across bits), CPU fetch-decode-execute steps, and literal Turing-machine walks.
- {"kind":"grid_flood","sayIntro":"optional","title":"<=60","mode":"bfs|dfs","rows":2-12,"cols":2-12,"walls":[{"r","c"}, 0-60 impassable cells],"cells":[{"r","c","value":"<=3"}, 0-144 optional static overlay text e.g. a 1/0 land-water grid],"groups":[{"label":"<=14"}, 0-4 named fronts shown as legend chips e.g. \"Island 1\",\"Pacific\"],"starts":[{"r","c","label":"<=10 optional","group":0-3}, 1-6 seed cells],"steps":[{"visit":[{"r","c","group":0-3,"from":{"r","c"} optional — omit for a freshly seeded root, include to draw the parent/backtrack edge}, 1-24 cells revealed this beat],"say"}, 1-14]} — a grid-as-graph traversal: BFS floods outward in simultaneous ripple layers (flood fill, Number of Islands scanning new unvisited land), DFS snakes a single path with a visible parent chain (Pacific Atlantic's dual ocean crawl); a cell reached by two different groups highlights gold. THE kind for Number of Islands, Flood Fill, Pacific Atlantic Water Flow, and any BFS/DFS-on-a-2D-grid problem
- {"kind":"hash_ring","nodes":[{id,label,angle?,tokens?}],"keys":[{id,label,angle?}],"steps":[{action:"addNode"|"removeNode"|"placeKey",nodeId?,keyId?,say}]} — a circular consistent-hashing ring where nodes and keys sit at clockwise angles and each key belongs to the first node reached going clockwise; use for consistent hashing, adding/removing a server without reshuffling everything, and virtual nodes/token ranges (set a node's "tokens" > 1 to show its virtual-node cloud + ×N badge).
- {"kind":"recursion_tree","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=20","parent":"parent id, or null/omitted for the SINGLE root"}, 2-24],"steps":[{"expand":[node ids newly called this beat, 0-6],"prune":[node ids that fail fast and are cut this beat, 0-6],"accept":[node ids that are complete valid leaves this beat, 0-6],"backtrack":[node ids whose call returns/unwinds this beat, 0-6],"note":"<=40 optional short reason caption","say"}, 1-16]} — a growing/shrinking backtracking call tree with a live call-stack panel: nodes pop in as expand() is called, failed branches get a red X and fade (prune), a full valid leaf gets a green check (accept), and a curved arrow plus the stack panel show the unwind on backtrack. THE kind for any backtracking/DFS-with-pruning algorithm: N-Queens (place a queen per row, backtrack on conflict), palindrome partitioning (try each cut position), Word Break II (every valid segmentation), subsets/permutations with pruning, combination sum.
- {"kind":"token_exchange","sayIntro":"optional","title":"<=60","tokenLabel":"<=20 default JWT","actors":[{"id","label":"<=16","role":"client|gateway|auth|resource"}, 2-4],"steps":[{"from":"actor id","to":"actor id (same as from = local check, no network hop)","action":"issue|present|verify|expire","valid":true|false default true,"note":"<=24 optional (exp time, mismatch reason, header claim…)","say":"narrate THIS step"}, 1-7]} — the TOKEN ITSELF as a header|payload|signature card: segments snap together on issue, the card travels between actor columns on present, gets checked in place (from===to) with a check/X badge on verify, and is desaturated + stamped EXPIRED on expire. THE kind for JWT structure, OAuth2 vs OIDC token exchange, and refresh-token rotation/expiry — use lifeline instead for generic handshakes/messages where the payload's shape doesn't matter.
- {"kind":"coin_stack","title","unit"?:"₹","stacks":[{"id","label","coins","tone"?:"good"|"warn"|"danger","icon"?}],"steps":[{"from"?,"to"?,"amount","label"?,"say"}]} — stacks of coins/bullion that grow, shrink, or arc coins between each other; omit "from" for money created (added/printed), omit "to" for money leaving the system (taxed/drained away). Use for budgets, money-supply components, wealth transfers, taxation, inflation/depletion narratives.
- {"kind":"btree_index","sayIntro":"optional","title":"<=60","nodes":[{"id","parent":"parent id, or null for the SINGLE root","keys":["<=6 chars each", 1-5],"leaf":true|false default false — nodes with no children render as leaves anyway}, 3-16],"leafChain":["leaf node ids left-to-right, optional — inferred from layout if omitted"],"steps":[{"mode":"descend|scan default descend","target":"node id — descend: the leaf/node the lookup reaches; scan: the first leaf in the run","keyIndex":"0-based key cell to glow, default 0","scanCount":"scan only: how many chained leaves ride the chain this beat, 1-8 default 1","say"}, 1-10]} — a B-Tree/B+Tree index: multi-key nodes tidy-laid-out root→leaves, leaves linked left-to-right by chain arrows; "descend" steps light the root→target path node-by-node with a token riding the connectors and the matched key glowing at the end, "scan" steps sweep a run of leaves with flow-dots riding the chain. THE kind for B-Tree root-to-leaf lookup tracing, B-Tree-vs-binary-tree/hash-index interview comparisons, and range queries that ride the leaf chain instead of re-descending.
- {"kind":"lsm_compaction","sayIntro":"optional","title":"<=60","levelCount":1-4 on-disk SSTable level rows shown (default 2),"memtableCapacity":2-8 visual slots in the memtable bar (default 4),"steps":[{"op":"write|flush|compact","key":"<=10 — write only: key inserted into the memtable","tombstone":true|false default false — write only: this is a delete marker not a value,"fromLevel":0-3 optional,"toLevel":0-3 optional — target level for flush/compact (compact defaults to fromLevel+1, i.e. leveled; set equal to fromLevel for size-tiered),"fileIds":["<=12 id", 0-6] — compact only: source SSTables merged away,"resultId":"<=12 optional — id of the SSTable this step produces,"keys":["<=10 key", 0-8] — compact only: keys the merged SSTable ends up holding,"droppedTombstones":0-6 default 0 — compact only: tombstones permanently removed in this merge,"say"}, 2-14]} — an LSM-tree write path: keys fill an in-memory memtable bar, a flush drops it as one immutable SSTable card into L0, and background compaction merges overlapping file cards into the next level while dropping tombstones (shown vanishing). THE kind for the Cassandra/RocksDB/LevelDB commit-log-and-memtable write path, "flushing memtables to SSTables", and size-tiered vs leveled compaction
- {"kind":"vdom_diff","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=20","parent":"parent id, or null for the SINGLE root","icon":"optional concept-icon word or emoji"}, 2-14],"steps":[{"render":[ids mounted plainly this beat],"add":[ids that are NEW this beat — flash green with a + badge],"remove":[ids removed this beat — flash red, shake, fade out with a − badge],"update":[ids whose props/state changed this beat — flash yellow with a ~ badge],"drill":{"from":"ancestor id","to":"descendant id"} optional — animates a "props" token down through every node on that path,"say"}, 1-8]} — a component / Virtual-DOM tree (auto-laid-out like "tree") that highlights nodes during render and diffs them added/removed/updated in colour. THE kind for the Virtual DOM & reconciliation, React Fiber's tree walk, and prop drilling / lifting state up.
- {"kind":"flamegraph","mode":"flame|waterfall","totalMs":number,"unitLabel?":"ms","warnAtMs?":number,"bars":[{"label","depth":0,"startMs","durMs","tone?":"normal|warn|good","say"}]} — stacked horizontal time bars that grow in one per beat: "flame" mode stacks rows by call-stack/render depth (main-thread long tasks, wasted React re-renders), "waterfall" mode gives each bar its own row in order (network request waterfalls) and auto-draws a "waits on" staircase connector + idle-gap callout when depth increases row-to-row; bars at/above "warnAtMs" auto-tint as blocking/slow. Use for profiling, INP/long-task, and request-waterfall explainers.
- {"kind":"event_loop","sayIntro":"optional","title":"<=60","loopLabel":"<=20 optional, default \"event loop\"","tasks":[{"id","label":"<=20 e.g. \"fetch_user()\"","icon":"optional ONE emoji"}, 2-6],"steps":[{"taskId":"task id","action":"run|await|resume|done","blocking":false optional — true freezes the hub's spin and pings every ready task, for a synchronous/blocking call,"detail":"<=28 optional, shown under the hub e.g. \"awaiting response\"","say"}, 2-14]} — a single-thread event-loop hub with task chips on a ready ring: "run" sends the one glowing token (the thread of control) to a task, "await" slides that chip out to a dashed waiting arc (suspended, not blocking anyone else), "resume" brings it back to ready, "done" retires it. THE kind for asyncio/coroutines/cooperative multitasking, what "await" actually suspends, and why one blocking call (time.sleep, sync I/O) freezes an entire async server — use "cycle" instead for generic repeating loops (water cycle, GC, habits) that aren't about one thread multiplexing suspended tasks
- {"kind":"dom_event_flow","sayIntro":"optional","title":"<=60","eventLabel":"<=24 default \"click\"","delegateAt":"id optional — the node holding the ONE delegated listener","synthetic":"bool default false — wrap the traveling pulse in a SyntheticEvent tag","nodes":[{"id","label":"<=20 e.g. document/body/ul/button","parent":"id optional, omit for the root","icon":"<=16 optional emoji","portal":"bool default false — render this node as a detached satellite box outside its logical parent, dash-connected back to it"}, 2-7],"targetId":"id — the node the event originates at (deepest element clicked)","steps":[{"nodeId":"id","phase":"capture|target|bubble","say"}, 2-13, one per ancestor depth on the way down, then target, then back up]} — the DOM as nested concentric boxes; a single pulse rides one path inward (capture) to the target, hits it, then rides back outward (bubble), highlighting each ancestor box as it passes. THE kind for event delegation (set delegateAt on the shared ancestor), React portals (set portal:true on the detached node), and synthetic/wrapped event systems (set synthetic:true)
- {"kind":"commit_dag","sayIntro":"optional","title":"<=60","commits":[{"id","parents":["parent commit ids",0-2],"lane":0-5,"label":"<=14"}, 2-16],"steps":[{"reveal":["commit ids appearing this beat"],"newRef":{"name":"<=16","at":"commit id"} optional,"moveRef":{"ref":"<=16","to":"commit id"} optional,"head":"ref name (attached) or commit id (detached) — sticky until changed" optional,"fade":["commit ids now orphaned/rewritten"],"note":"<=22 optional mode badge e.g. FAST-FORWARD/3-WAY MERGE/REBASING","say"}, 1-12]} — a git commit DAG: dots on branch lanes linked to parents (curved joins for merges), named ref/HEAD tags that pop in and slide as they move. For commit/branch/checkout, fast-forward vs 3-way merge, rebase rewriting history, detached HEAD
- {"kind":"partitioned_log","sayIntro":"optional","title":"<=60","partitions":[{"id","label":"<=16"}, 1-6 lanes whose tail grows rightward],"consumers":[{"id","label":"<=16","partitionId":"a partition id","offset":0+ default 0 — record index it has read up to}, 0-6 independent read-heads],"steps":[{"op":"append|advance|rebalance","partitionId":"append only: lane the new record lands in","value":"<=8 append only: the record's short label e.g. \"ord:42\"","consumerId":"advance/rebalance: which consumer moves","toOffset":"advance: offset the read-head jumps to on its lane; rebalance: offset it resumes at on its NEW lane, default 0","toPartitionId":"REQUIRED for rebalance: the lane the consumer is reassigned to — this is what triggers the visible stall","say"}, 2-14]} — an append-only log split into lanes: producers pop new record cells onto a lane's tail (with an incoming flow-dot), while consumer flag markers pin the offset they've read up to, sliding along a lane on "advance" or arcing between lanes on "rebalance" with a visible mid-flight freeze + banner. THE kind for how Kafka parallelizes a topic across partitions, what a consumer offset actually bookmarks, and why a consumer-group rebalance pauses reads and can break an SLA.
- {"kind":"container_sandbox","sayIntro":"optional","title":"<=60","processLabel":"<=24 default 'App process'","resources":[{"id","label":"<=20","kind":"pid|net|mount|user|ipc|hostname" default pid,"shared":bool default false}, 2-7],"cgroupLimit":{"label":"<=20 default 'Memory'","capPct":10-100 default 60} optional,"steps":[{"kind":"isolate|limit" default isolate,"hide":["resource id",...] default [] cumulative — once hidden stays hidden,"usagePct":0-100 optional — animates the cgroup meter,"say"}, 1-8]} — Linux namespaces & cgroups as one primitive: an isoBox3D "sandbox" shrinks around a process card as isolate steps grey out the resource chips it can no longer see (severed connector + slash mark), while limit steps drive a cgroup meter toward usagePct and glow warn past the cap (throttled); a resource flagged shared keeps a dashed, still-flowing link to a faint sibling process card even as isolation tightens. Use for container isolation internals, "namespaces aren't a security boundary" (cgroups are the separate, orthogonal control), and why co-located containers in one pod still share a namespace (localhost) while separate pods don't.
- {"kind":"control_loop","sayIntro":"optional","title":"<=60","controllerLabel":"<=20 default \"Controller\" e.g. \"ReplicaSet\"|\"Terraform\"","items":[{"id","label":"<=22","desiredValue":"<=18","icon":"1 emoji or known glyph name optional"}, 2-6],"steps":[{"itemId":"one of items[].id","action":"drift|reconcile","actualValue":"<=18","say"}, 1-10]} — the declarative reconciliation loop (Kubernetes controllers, Terraform/CloudFormation drift detection): a Desired-State list and a live Actual-State list flank a controller node whose gear never stops turning; each beat either DRIFTS one item's actual value away from desired (card flashes red, packet flows actual->controller) or RECONCILES it back to match (packet flows controller->actual, card settles green). THE kind for "delete a pod and watch it resurrect", infra drift detection, self-healing systems, and any desired-vs-actual convergence loop
- {"kind":"telemetry_trace","sayIntro":"optional","title":"<=60","totalMs":number,"unitLabel?":"ms","spans":[{"id","parentId":"parent span id, omit for the root gateway","service":"<=24 e.g. \"Catalog DB\"","kind":"gateway|service|db|cache|queue|external","startMs":number,"durMs":number,"status":"ok|error","say"}, 1-14],"verdict?":{"outcome":"keep|drop","reason":"<=60","say"}} — a distributed-trace waterfall: one root request (the gateway span) fans out into child spans that draw in left-to-right one per beat, each positioned by its true startMs/durMs so parallel children visibly overlap and sequential ones visibly queue; a left rail shows the parent→child call tree via indentation + bracket guides. An optional trailing "verdict" beat glows the whole trace kept (green) or dims it dropped (amber) with a one-line reason. THE kind for "how one request becomes N downstream calls", span waterfalls, and head-vs-tail sampling ("which traces to keep").
- {"kind":"spatial_index","sayIntro":"optional","title":"<=60","capacity":1-4 default 1 — max points a quadrant holds before it splits into 4,"steps":[{"points":[{"id","x":0-100,"y":0-100,"label":"<=10 optional"}, 0-6 points inserted this beat],"query":{"x":0-100,"y":0-100,"radius":2-60 default 18} optional — highlights the cell holding (x,y) plus every neighbouring cell within radius,"say"}, 1-9]} — a square region that recursively subdivides into quadrants as points are inserted, via a REAL capacity-triggered quadtree insert/split algorithm run by the painter itself (never hand-authored split geometry); dense clusters cascade into deep, narrow cells while sparse areas stay coarse, and a query step highlights a cell plus its nearby neighbours. THE kind for quadtrees, geohash/H3 spatial indexing, and proximity/nearby-search location bucketing
- {"kind":"object_heap","vars":[{"id","name"}],"objects":[{"id","label","icon"?,"mutable"?}],"steps":[{"bind"?:{"name","obj"},"link"?:{"from","to"},"unlink"?:{"from","to"},"mutate"?:"id","collect"?:["id"],"note"?,"say"}]} — variable name tags wired by arrows to distinct heap-object cards with live refcount badges; use for object references/aliasing, mutability, shallow vs deep copy, and reference cycles/garbage collection.
- {"kind":"vector_space","sayIntro":"optional","title":"<=60","mode":"2d|3d" default 2d,"xLabel":"<=14 optional","yLabel":"<=14 optional","points":[{"id","label":"<=20 optional","cluster":"<=16 group name — same string = same color","x":-60..60,"y":-60..60,"z":-60..60 optional depth (3d only)}, 2-14],"boundary":{"x1","y1","x2","y2","margin":0-20 default 0} optional — a decision-boundary line (SVM hyperplane) with an optional margin band either side,"distances":[{"from":"point id","to":"point id","label":"<=16 optional"}, 0-6] default [],"steps":[{"reveal":["point ids"] default [],"showBoundary":true|false default false — reveals boundary+margin once,"showDistances":[indices into distances[]] default [],"focus":"point id" optional,"say"}, 1-8]} — a coordinate space plotting points as vectors: colored by cluster, revealed one beat at a time, with an optional separating boundary+margin and labelled distance segments between points. mode:"3d" renders a REAL rotating three.js scatter (falls back to 2-D if WebGL is unavailable) — use it for the kernel-trick payoff shot where points lifted into 3-D become separable by a flat plane. THE kind for word/embedding vector spaces (word2vec analogies like king-man+woman=queen) and classifier geometry (SVM decision boundaries, margins, cosine distance)
- {"kind":"neural_network","sayIntro":"optional","title":"<=60","layers":[{"size":1-6,"label":"<=20 optional","activation":"<=16 optional e.g. ReLU/softmax"}, 2-6],"steps":[{"direction":"forward|backward, default forward","layerIndex":0-based — forward: the layer being activated; backward: the left layer of the edge pair being colored (use layers.length-1 to just highlight the output/loss before any weight is touched),"label":"<=24 optional caption e.g. \"ReLU(Wx+b)\" or \"∂L/∂W2\"","say"}, 1-12]} — a layered feed-forward network auto-arranged into columns of node circles (rows in 9:16) fully connected to the next column; forward steps pop a layer's activations in and pulse the edges feeding it left-to-right, backward steps color the edges between two layers and animate representative packets in reverse for gradients. THE kind for backpropagation walked step by step, and equally for a forward-only walk naming each piece of a network block (e.g. a Transformer's Q/K/V projections, attention, feed-forward)
- {"kind":"matrix_convolution","sayIntro":"optional","title":"<=60","inputRows":2-8,"inputCols":2-8,"kernelRows":1-5,"kernelCols":1-5,"outputRows":1-8,"outputCols":1-8,"inputValues":["<=5", inputRows*inputCols entries row-major],"kernelValues":["<=5", kernelRows*kernelCols entries row-major],"steps":[{"atRow":0-based top-left row the kernel window covers,"atCol":0-based top-left col,"outRow":0-based output cell row,"outCol":0-based output cell col,"products":["<=6", kernelRows*kernelCols elementwise products row-major],"result":"<=6 the summed/aggregated value","say"}, 1-12]} — a small kernel/filter window slides over a larger input grid, popping the elementwise products under the window then beaming their sum into the matching output feature-map cell. THE kind for convolutional filters, feature maps, receptive fields, and "convolution = sliding dot product" explainers.
- {"kind":"consensus_quorum","sayIntro":"optional","title":"<=60","nodes":[{"id","label":"<=14","role":"leader|follower, defaults follower — exactly one leader/coordinator"}, 3-7],"quorumSize":"optional int 2-7 (defaults to floor(n/2)+1 majority)","steps":[{"kind":"propose|ack|commit|fail|reset","from":"nodeId? — the broadcaster this step is about","ackFrom":[nodeIds acking this step, default []],"note":"<=24 e.g. 'Term 3' or 'Split vote'","say"}, 2-9]} — a cluster reaching distributed consensus: the leader/coordinator proposes (arrows fan out), followers ack back one by one while a segmented quorum meter fills, then the round commits (quorum crossed, whole cluster turns green) or fails (split vote / blocked coordinator, turns red) before an optional reset drains the meter to start a new term/round. Use for Raft leader election (terms, votes, split-vote) and Two-Phase Commit (prepare, commit, and a blocking coordinator).`;

/**
 * One entry per kind, built once from the menu text above and keyed by the kind
 * name in each line — the single source of truth for what the model can see.
 * The key pattern must allow digits and underscores: with `[a-z]+` the 35 kinds
 * named like `iso3d` or `dp_table_fill` yielded "", were dropped by the filter
 * below, and were never offered to the model in any prompt.
 */
const KIND_LINE = new Map<string, string>(
  ALL_KINDS_MENU.split(/\n(?=- \{)/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- {"))
    .map((line) => [line.match(/"kind":"([a-z0-9_]+)"/)?.[1] ?? "", line] as const)
    .filter(([k]) => k)
);

/** Kinds every subject may use — versatile, subject-agnostic. */
const CORE_KINDS = [
  "bigtext",
  "bullets",
  "stat",
  "quiz",
  "question",
  "compare",
  "mythfact",
  "steps",
  "chart",
  "diagram",
  "tree",
  "mindmap",
  "timeline",
  "quote",
  "table",
] as const;

/** Extra kinds unlocked per subject.id (added to CORE_KINDS). */
const SUBJECT_KIT: Record<string, string[]> = {
  coding: ["code", "terminal", "iso3d", "trace", "memgrid", "callstack", "bits", "lifeline", "browserframe", "statemachine", "decision", "cycle", "pipeline", "graphwalk", "matrix", "threads", "queueflow", "cipher", "circuit", "formula", "radar", "zoomladder"],
  history: ["chain", "race", "zoomladder", "dialogue", "skyline", "storyboard", "dayclock", "constellation", "ledger", "calendar"],
  geography: ["terrain", "cycle", "zoomladder", "race", "skyline", "calendar", "sankey", "gauge", "radar", "constellation", "curves"],
  math: ["code", "trace", "formula", "curves", "probability", "matrix", "race", "buckets", "radar", "gauge"],
  science: ["orbit", "cycle", "zoomladder", "curves", "formula", "bodymap", "circuit", "constellation", "dayclock", "gauge", "chain", "radar", "terrain"],
  finance: ["code", "ledger", "sankey", "gauge", "race", "buckets", "basket", "curves", "formula", "pictogram", "cycle"],
  english: ["vocab", "dialogue", "storyboard", "radar", "bracket"],
  gk: ["race", "zoomladder", "pictogram", "dayclock", "bracket", "constellation", "radar", "skyline", "calendar", "gauge", "showdown"],
  psychology: ["cycle", "dialogue", "chain", "storyboard", "radar", "gauge", "probability", "showdown", "bracket"],
  business: ["ledger", "race", "pipeline", "sankey", "dialogue", "showdown", "skyline", "bracket", "gauge", "radar"],
  health: ["bodymap", "cycle", "gauge", "pictogram", "chain", "zoomladder", "formula", "buckets", "dayclock", "radar", "curves"],
  philosophy: ["dialogue", "chain", "showdown", "storyboard", "bracket", "cycle"],
  lifeskills: ["cycle", "dialogue", "showdown", "bracket", "gauge", "chain", "storyboard", "calendar"],
  polity: ["statemachine", "decision", "pictogram", "chain", "dialogue", "ledger", "showdown", "bracket"],
  economy: ["ledger", "sankey", "gauge", "race", "buckets", "basket", "pictogram", "cycle", "curves", "chain", "radar", "showdown"],
  environment: ["cycle", "terrain", "gauge", "pictogram", "chain", "sankey", "bodymap", "calendar", "radar", "zoomladder", "curves", "constellation"],
  artculture: ["schematic", "dialogue", "storyboard", "dayclock", "calendar", "radar", "skyline", "constellation"],
  mindset: ["cycle", "dialogue", "chain", "showdown", "bracket", "storyboard", "gauge", "calendar"],
  mythology: ["chain", "dialogue", "storyboard", "cycle", "constellation", "bracket", "dayclock"],
};

/**
 * The scene-kind menu for a subject: header + the CORE kinds plus that
 * subject's kit, in the canonical order they appear in ALL_KINDS_MENU. An
 * unknown/absent subjectId falls back to the FULL menu (safe for regen/refine).
 */
function buildSceneShape(subjectId?: string): string {
  // ALL kinds are available to every subject (capability is universal) so a kind
  // that fits the content is never blocked. The per-subject kit is a SOFT preference
  // — "lean on these, but reach for any when the content calls for it" — not a filter.
  const kit = subjectId ? SUBJECT_KIT[subjectId] : undefined;
  const featured = kit
    ? `\nFEATURED FOR THIS SUBJECT — these fit best; lean on them. You MAY use ANY kind listed below when the content genuinely calls for it, but do not force an off-topic kind for novelty:\n${[...CORE_KINDS, ...kit].join(", ")}\n`
    : "";
  return `${SCENE_MENU_HEADER}\n${featured}\n${[...KIND_LINE.values()].join("\n")}`;
}

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
  friend ("a ballpark figure keeps you in the game"), not a definition they forget in five seconds.
- SAY MATCHES SCREEN (audio and visuals must be balanced, never lopsided): a beat's spoken line must
  be sized to what appears on screen during it. One bullet or one row revealing = ONE short sentence,
  not three. If you have more to say than the single revealed element can carry, split it into more
  beats/items so the picture keeps pace with the voice. Never let the narration run far ahead of what
  the viewer can see.
- OPENING must not be a talking blank screen: the FIRST scene must be a "bigtext", "stat", or
  "mythfact" whose on-screen words ARE the hook — visible instantly, so audio and picture land
  together from second one. Do NOT open the video with a scene whose first beat is a "sayIntro"/setup
  line spoken over an empty frame, title card, or not-yet-drawn content.
- "sayIntro" (and any setup beat spoken before the first item/step/row appears) must be SHORT — at
  most one brief clause (roughly 6-10 words). It plays while only the frame/title is up, so a long
  sayIntro is narration over near-empty screen. Put the substance on the item beats, where the
  matching visual is actually revealing.
- CONCRETE BEFORE ABSTRACT, always. Show the thing happening, THEN name it. "Two functions built in
  the same loop both report the last value — because they share one environment, not one each. That
  shared environment is the closure." Not the reverse.
- NEVER OPEN ON A DEFINITION. The first spoken beat may not be "X is a …" / "X refers to …" /
  "X means …". A definition is where an explanation ends, not where it starts, and a viewer who
  wanted a definition would have read the docs. Open on the concrete moment instead: the thing going
  wrong, the number that stings, the exact line of code that betrays them. Second person beats third:
  "Your div-button is a trap — a keyboard user just hit Tab and your whole UI broke" is a hook;
  "A div-button is an element that lacks native semantics" is a textbook.
- ONE RUNNING EXAMPLE, NAMED IN EVERY SCENE. Choose a single concrete case in the hook — one chess
  match, one ₹40,000 salary, one specific failing request — and carry it BY NAME through every scene
  to the end. Do not introduce a second example to explain the first, and never switch cases
  mid-video: the viewer is holding one thread and each new one drops it.
- EVERY TECHNICAL TERM GETS A SIX-WORD TRANSLATION at first use, in that beat or the next. "The
  event loop — the queue that decides what runs next — …". A term used before it is anchored is the
  exact moment a viewer decides this video is not for them.
- BANNED OPENERS, no exceptions: "Let's", "Let us", "Here's", "Here is", and any beat starting
  "Now,", "Next,", "So,". These are what a narrator says when a slide has just appeared and there is
  nothing to say about it yet — start on the thing itself.`;

const TTS_RULES = `
Narration is read by a neural TTS voice AND shown as on-screen captions from the SAME text, so write
each spoken beat to be correct on screen — the engine auto-converts it for the voice:
- WRITE THE CLEAN ON-SCREEN FORM, don't pre-mangle for the voice. Keep "₹10Cr", "99.9%", "100ms",
  "API", "SQL", "Lok Sabha" spelled normally — the engine already expands symbols (₹, %, +, =), units
  (Cr, ms, GB, km) and acronyms (API→"A P I", SQL→"Sequel") to spoken words for the voice while the
  caption keeps your text. Do NOT space out acronyms yourself ("A P I") or write "ten crore rupees" in
  place of "₹10Cr" — that corrupts the caption. Just write it the way it should look on screen.
- NEVER put raw code or syntax in a spoken beat: no "array[0]", "() => {}", "console.log". Say the
  concept — "the first item", "we print the result" — code belongs only in a "code"/"terminal" scene.
- AVOID HOMOGRAPHS in the spoken line: a word that changes sound by context (record/record,
  read/read, lead/lead) reads wrong. Swap in an unambiguous synonym ("log the data", not "record the
  data"; "guides", not "leads").
- EMPHASIS: to make one pivotal contrast land, wrap the single crucial word in asterisks
  ("the *client* asks, not the server"). The engine strips the asterisks from the caption and turns
  them into a spoken pause, so the screen never shouts. One or two per video at most, one word each.
  NEVER use ALL CAPS for emphasis: capitals reach the caption unchanged, and a capitalised short word
  that is also an acronym ("the OS decides") gets spelled out letter by letter by the voice.
- BREATHING: TTS runs sentences together. Use "..." for a short pause and " — " for a beat of
  emphasis, and keep clauses short so the voice can breathe.
- QUESTIONS: start a spoken question with the interrogative word (Why / How / What / When) so the
  voice lifts into a real question tone, not a flat statement.
- QUOTES: wrap a quotation in ellipses for a clear vocal boundary ("As Gandhi said... be the
  change...") — never write the words "quote"/"unquote".`;

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
WHEN TO USE CODE (read first): a coding video does NOT need a "code"/"terminal" scene just because
the subject is coding. Use code ONLY when seeing the actual code is what teaches the point — a syntax
feature, a concrete algorithm, a real API call, or a specific bug/fix. For CONCEPTUAL or THEORY
topics — how the event loop works, what a process/thread is, CAP theorem, how DNS resolves, memory vs
disk, why TCP has a handshake, what a hash table IS — teach the MECHANISM VISUALLY (diagram, lifeline,
cycle, statemachine, trace, memgrid, compare, steps), NOT a code listing. A theory explanation buried
in code teaches less and looks generic. Rule of thumb: at most 1-2 code scenes in a video, and none
at all when the topic is a concept rather than "how to write X". Prefer the visual kind that shows the
idea moving over a static code block.

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
export const SUBJECT_PLAYBOOKS: Record<string, string> = {
  coding: `Coding playbook: teach the MECHANISM. Use a "code" scene as minimal runnable proof and a
"terminal" scene for the real output. Use "diagram" for architecture/data-flow, "compare" for
approach-vs-approach (e.g. array vs linked list), "steps" for an algorithm walk-through, "chart" for
benchmark/complexity numbers, "mythfact" for a widespread wrong belief. Prove it, do not just assert it.
For algorithms where something MOVES (sliding window, two pointers, queue head, swap), use diagram
"move" so the pointer/window nodes physically glide across the array — move EVERY node that travels
in that step (both the window box AND its pointers together, never leaving one behind).
For SQL / databases, use a "table" scene to SHOW real rows: a sample table, a JOIN's output, or a
query result — set highlight:true on the rows a WHERE clause keeps, and highlightCol on the join/key
column, so the query's effect is visible, not just described. Pair a "code" SQL query with the
"table" result right after it.
The runtime kinds are your unfair advantage — use them over static diagrams whenever something
EXECUTES: "trace" for any algorithm over an array (sorting, two pointers, binary search — the code
and the cells animate in lockstep), "callstack" for recursion and function calls, "memgrid" for
arrays vs linked lists / hashing / stack-vs-heap, "bits" for bit manipulation and masks, "lifeline"
for anything where two systems talk (TCP/TLS handshakes, OAuth, DNS, replication, Kafka),
"statemachine" for connection/process lifecycles, "browserframe" for rendering and web performance,
"pipeline" for build/deploy/compilation stages, and "cycle" for the event loop and GC cycles.
Batch of runtime kinds for CS: "graphwalk" for BFS/DFS/Dijkstra/shortest-path over a real graph,
"matrix" for DP tables and grid/flood-fill, "threads" for concurrency and race conditions, "queueflow"
for queues/load-balancing/rate-limiting/backpressure, "cipher" for hashing and Caesar/encryption,
"circuit" for logic gates and how hardware switches, "formula" for complexity/cost equations built
term by term.`,
  history: `History playbook: make it a thriller. Use a "timeline" for the sequence of events, a
"diagram" for cause->effect chains or who-fought-whom, a "stat" for the number that stuns (army
sizes, death tolls, distances), a "chart" to compare empires/armies/economies, and a real "quote"
from the era when one exists. "mythfact" for popular history myths. End with a "quiz" or "question"
that makes people argue. Dates and figures must be accurate.
Causality is history's engine: use "chain" for cause-and-effect dominoes (crash → protectionism →
war), "race" to watch empires/economies overtake each other across centuries, "zoomladder" for
deep-time scale shocks, and "dialogue" for a real exchange of arguments (assembly debates, famous
correspondences) — clearly framed, never invented quotes.
"skyline" grows a city/empire era by era, "storyboard" tells a scene as comic panels, "dayclock"
compresses an age into a day, "constellation" connects scattered clues into a pattern.`,
  geography: `Geography playbook: explain WHY the place is the way it is. Use a "diagram" for physical
processes (monsoon, plate tectonics, river systems) and maps-as-boxes, a "chart" for rankings
(longest rivers, rainfall, populations), a "stat" for one jaw-dropping scale number, "compare" for
two regions, "steps" for a process (how a delta forms), "mythfact" for geo-myths.
"terrain" is your signature kind — a living side-view landscape for river journeys (glacier to
delta), monsoon winds hitting a mountain wall, plate collisions and dams; prefer it over a box
diagram whenever the land's SHAPE is the explanation. "cycle" for the water cycle and monsoon loop,
"zoomladder" for scale journeys (village→India→Earth), "race" for city/population growth races.
"curves" for climate/rainfall trends, "skyline" for a city's growth, "calendar" for the monsoon
calendar and crop seasons, "constellation" for connecting geographic features into a system.`,
  math: `Math & Aptitude playbook: trick-first. Use a "steps" scene to show the slow way then the fast
way, a "code" scene with lang "text" for the worked calculation, a "stat" for the punchline
number/time saved, and a "chart" when comparing methods or growth rates. ALWAYS end with a "quiz"
or "question" giving one practice problem.
"trace" turns a method into a watchable walk: put the worked numbers in the cells and step the
calculation line by line (long division, percentage tricks, digit sums). "race" for growth-rate
comparisons (simple vs compound interest overtaking).
"formula" builds an equation term by term with plain-words glosses then computes it; "curves" plots
continuous functions and their intersections (linear vs exponential, break-even); "probability" spins
a wheel and converges to the expected value (odds, gambler's fallacy); "matrix" walks a grid/table;
"buckets" pours liquid that overflows tier to tier — perfect for slabs and cascading sums.`,
  science: `Science playbook: everyday-phenomenon first. Open with a "stat", "mythfact" or bold
"bigtext" wow-fact, use a "diagram" for the mechanism, "steps" for a process (how vision works),
"chart" for scale comparisons (speeds, sizes, energies), "compare" for misconception-vs-reality.
One vivid real-world anchor per video.
"zoomladder" for scale journeys (atom→cell→you, Earth→solar system), "cycle" for natural loops
(rock cycle, blood circulation), "terrain" for volcanoes/glaciers/weather on a living landscape,
"gauge" for magnitudes with danger zones (Richter, decibels), "chain" for reaction cascades.
"bodymap" is your anatomy stage — organs glow, or a signal/food travels a path (digestion,
circulation, reflexes); "circuit" for electricity and logic; "curves" for growth/decay and
distributions; "formula" to assemble F=ma or a gas law with plain-words glosses; "constellation" for
connecting stars or data points into a pattern; "dayclock" for circadian rhythm and deep time.`,
  finance: `Money & Finance playbook: make rupees visceral. Use a "stat" for the big compounding
number (₹), a "chart" to compare returns/costs across options or years, a "steps" scene for the
how-to (start an SIP), a "code" scene with lang "text" for the compounding math, "mythfact" for
money myths (e.g. "renting is wasted money"), "compare" for two instruments. Concepts only, never
stock tips.
Money MOVES — show it: "ledger" for any flow between parties with live balances (SIP → fund →
returns, EMI anatomy, where a ₹100 note goes), "sankey" for how one total splits (a salary, a
budget), "gauge" for rates with healthy/danger zones, "race" for investment options compounding
against each other over the years.
"buckets" for tax slabs and how a salary fills fixed costs then savings; "basket" for what inflation
does to a real shopping cart year by year; "curves" for compound vs simple growth and break-even;
"formula" to build the compound-interest or EMI formula term by term before plugging numbers in.`,
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
- Correct common Indian-English mistakes warmly, and use Indian names, ₹ and contexts in examples.
- "dialogue" is your spoken-practice stage: play the real conversation (interview, phone call,
  ordering, disagreeing politely) as chat messages the viewer hears line by line — first the plain
  version, then the upgraded native-sounding turn, with a reaction emoji marking the win.
- "storyboard" for a situational dialogue as scenes; "bracket" for a fun "best word" knockout;
  "radar" to profile formal vs casual register across situations.`,
  gk: `GK & Amazing Facts playbook: hook with the unbelievable "stat" or bigtext fact, then a "diagram"
or "timeline" explaining the mechanism behind it. Use "chart" for rankings and records, "mythfact"
for widely believed nonsense. ALWAYS end with a "quiz".
"race" for rankings that CHANGED over time (tallest buildings, most-spoken languages), "zoomladder"
for magnitude shocks, "pictogram" for 1-in-N human statistics, "gauge" for record measurements.
"bracket" runs a knockout of contenders (greatest X), "showdown" scores a head-to-head round by
round, "dayclock" and "constellation" and "skyline" turn facts into striking visuals.`,
  psychology: `Psychology playbook: name the bias/effect, then make the viewer FEEL it with a relatable
scenario. Use "mythfact" for pop-psychology myths (10% of the brain, learning styles), "steps" for
the mechanism or the fix, "stat"/"chart" for the striking experimental numbers, "quiz" to let viewers
test themselves mid-video, "diagram" for loops (habit loop, feedback). One practical takeaway at the
end; never preachy, never clinical advice.
Prefer "cycle" over diagram for any loop (habit loop, anxiety spiral, dopamine loop) — it visibly
repeats. "dialogue" to dramatise the inner voice or a real conversation pattern (the two chairs),
"chain" for how one small trigger cascades.
"probability" makes the gambler's fallacy and base rates visceral, "showdown"/"bracket" pit biases or
coping strategies against each other, "storyboard" dramatises a relatable scenario as panels.`,
  business: `Business & Startups playbook: case-first. Open with a company and a stunning "stat"
(revenue, users, valuation), dissect the model with a "diagram" (who pays whom), use "chart" for
scale comparisons and growth, "timeline" for rise/fall stories, "compare" for two strategies, a
"quote" from a founder when real. Mix Indian (Jio, UPI, Zomato) and global (Apple, Netflix) cases.
Explain incentives and moats, not buzzwords.
"ledger" for who-pays-whom with live balances (the take-rate, the burn), "race" for market-share
battles across years, "pipeline" for supply chains and how the product gets made, "sankey" for
revenue splitting into costs and profit, "dialogue" for a negotiation or pitch exchange.
"skyline" for a company's rise, "bracket"/"showdown" for market-share knockouts and strategy
face-offs, "radar" to compare products across dimensions.`,
  health: `Health & Body playbook: mechanism-first — show what actually happens inside the body with a
"diagram" or "steps". Bust one popular myth per video with "mythfact" (detox, spot reduction,
8-glasses). Use "stat"/"chart" for evidence numbers with "about/around" hedging. "compare" for
this-vs-that (whey vs food protein). Educational tone only — explain evidence, never prescribe;
no miracle claims ever.
"bodymap" is your core kind — organs light up or a signal/nutrient travels a path (digestion,
circulation, immune response); "dayclock" for circadian rhythm and sleep; "buckets" for calorie/
hydration balance; "curves" for dose-response and growth curves.`,
  philosophy: `Philosophy playbook: start from a modern, concrete dilemma, then bring in the thinker or
school that cracks it. Use a "quote" (real and correctly attributed) as an anchor, "compare" for two
schools answering the same question, "diagram" for thought experiments (trolley tracks as boxes),
"steps" for an argument laid out premise by premise, "mythfact" for misread ideas ("Stoicism = no
emotions"). ALWAYS end with a "question" people will argue about.
"dialogue" stages a Socratic exchange or the two sides of a dilemma; "showdown" scores two schools
round by round; "storyboard" walks a thought experiment as panels.`,
  lifeskills: `Life Skills playbook: one skill per video with a concrete method. Show the failure mode
first (bigtext or mythfact), then the fix as a "steps" scene the viewer can copy today. Use "stat"
for the cost of doing it wrong, "chart" to compare methods, "quiz" to check understanding, and end
with a 24-hour challenge in the "question" scene. Practical over motivational — no platitudes.
"cycle" for habit/productivity loops, "showdown" for good-habit-vs-bad-habit, "calendar" for a weekly
or monthly plan, "storyboard" for a before/after day-in-the-life.`,
  polity: `Polity & Governance playbook (UPSC-grade): precision IS the product — cite the exact
Article, Amendment and landmark case (Article 21, Kesavananda Bharati 1973, 73rd Amendment); one
wrong number destroys aspirant trust, so if unsure of a figure, say "around" or restructure. Use
"diagram" for structures and processes (how a bill becomes law, judicial hierarchy, election
machinery), "compare" for classic exam confusions (FR vs DPSP, Lok Sabha vs Rajya Sabha, censure vs
no-confidence), "timeline" for constitutional history, "stat" for the memorable number (545 seats,
6 freedoms, 22 languages), "mythfact" for misconceptions (the President is NOT the head of
government). ALWAYS include a "quiz" — aspirants crave self-testing — and end with a mains-style
"question" that demands an opinion with reasoning. Explain the WHY behind every provision (why
bicameral, why a collegium, why Article 356 exists), never just the fact.
Machinery kinds: "statemachine" for how a bill becomes an act (with the returned-once loop) or
emergency proclamation flows, "decision" for eligibility/qualification walks (who can vote, who can
be President), "pictogram" mode "arc" with majorityAt for Lok Sabha seat arithmetic (272!, special
majorities), "chain" for constitutional cause-and-effect, and "dialogue" for landmark-case
arguments (framed as the two sides' contentions, never invented verbatim quotes).
"showdown" scores a classic exam confusion round by round (FR vs DPSP), "bracket" for a knockout of
options, "pictogram" arc for seat arithmetic (already), "chain" for constitutional cause-and-effect.`,
  economy: `Economy playbook (UPSC-grade): decode the jargon. First anchor the term in one plain
sentence ("inflation is your money buying less each year"), then the mechanism with a REAL Indian
number and the body that controls it (RBI repo rate, SEBI, the Union Budget, FRBM Act). Use
"diagram" for flows (how repo rate cools inflation, how a budget deficit is financed), "compare" for
exam confusions (fiscal vs monetary policy, CRR vs SLR, direct vs indirect tax), "chart" for real
figures (GDP growth, inflation prints), "stat" for the striking number, "mythfact" for economic
myths ("printing money makes a country rich"). ALWAYS a "quiz". Figures must be real — hedge with
"around" if unsure. End with a mains-style "question".
The economy's flows are literal now: "ledger" for repo-rate transmission / taxes / subsidies moving
between RBI, banks, government and you (live balances tick), "sankey" for the Union Budget or GDP
composition splitting proportionally, "gauge" for repo rate / inflation / fiscal deficit against
target zones, "race" for GDP or sector races across decades, "pictogram" for employment and poverty
shares as people, "cycle" for the business cycle.
"buckets" is THE kind for marginal tax slabs (money overflows slab to slab — kills the "higher slab
taxes all my income" myth); "basket" prices the same cart across years for inflation/CPI; "curves"
draws supply-demand equilibrium and growth curves; "showdown" for policy-vs-policy face-offs.`,
  environment: `Environment & Ecology playbook (UPSC-grade): mechanism then policy. Explain the
ecological process with a "diagram" or "steps" (how a food chain concentrates toxins, how the carbon
cycle warms the planet), then name the exact Indian law, institution or global convention (Wildlife
Protection Act 1972, NGT, CITES, Ramsar, Montreal vs Kyoto vs Paris). "compare" for confusions
(national park vs sanctuary vs biosphere reserve), "stat"/"chart" for real figures (forest cover %,
tiger numbers) hedged with "around", "mythfact" for green myths. ALWAYS a "quiz"; end with a
mains-style "question". Species, dates and figures must be accurate.
Nature's mechanisms are loops and places: "cycle" is THE kind for carbon/nitrogen/water cycles and
food-chain loops, "terrain" for habitats, dams, deforestation on a living landscape, "gauge" for
AQI/temperature-rise against danger zones, "pictogram" for species counts and population shares,
"chain" for ecological cascade effects (remove the wolf → the river changes), "sankey" for energy
mix or where emissions come from.
"calendar" for seasonal cycles and migration/breeding windows, "bodymap"-style is not for animals but
"curves" fits population and temperature trends, "constellation" links species in a food web.`,
  artculture: `Art & Culture playbook: vivid and precise, like a great museum guide. Name the
dynasty/period/patron, the 2-3 defining features, and ONE iconic surviving example (Kailasa temple
at Ellora, the Nataraja bronze). Use "compare" for style contrasts (Nagara vs Dravida temples,
Bharatanatyam vs Odissi), "timeline" for how a form evolved, "diagram" for the parts of a structure
(shikhara, gopuram, mandapa), "mythfact" for common mix-ups, a "quiz" for the exam. Distinguish
styles crisply; dates, dynasties and names must be accurate. End with a "question".
"schematic" is your signature kind — compose a stupa (mound + ring + umbrella + gateway), a temple
(platform + wall + cone/spire + finial), a mosque (block + onion-dome + spire) from named parts and
highlight each part as you narrate it, exactly like a museum guide pointing at the object. Use it
for EVERY anatomy topic before falling back to "diagram".
"storyboard" narrates a performance or legend as comic panels, "dayclock" for ritual/festival timing,
"calendar" for the festival year, "skyline" for a city's architectural evolution.`,
  mindset: `Mindset & Self-Growth playbook: transformation-first, zero platitudes. Open with the
painful, hyper-specific moment (your mind going blank on stage, the 2 AM scroll-envy spiral), then
name the real psychological mechanism behind it — never say "just be confident". Use "mythfact" to
kill one piece of toxic advice per video, "steps" for a drill the viewer can literally do TODAY
with rep counts ("record yourself for 60 seconds, three takes"), "compare" for the fixed vs growth
response to the SAME event, "stat" for research numbers with "about" hedging, and a "quote" only if
real and correctly attributed. Show the rep count, not the pep talk. End with a 24-hour challenge
"question" the viewer can report back on in the comments.
"cycle" for self-sabotage or growth loops, "showdown" for fixed-vs-growth mindset on the same event,
"storyboard" for a transformation arc, "calendar" for a 30-day plan.`,
  mythology: `Mythology & Epics playbook: storytelling-first, like a gripping narrator. Use "timeline"
for the arc of an episode, "diagram" for family trees and who-cursed-whom chains, a "quote" for a
famous verse or line (translated, attributed), "compare" for parallel myths across cultures,
"mythfact" to separate later additions from the original texts. Respect the tradition; clearly
separate story, symbolism and history. End with the lesson or an open question.
"chain" for curse-and-boon causality (one vow topples kingdoms), "dialogue" for the great exchanges
(Krishna-Arjuna, Yaksha's questions) clearly framed as retelling, "cycle" for cosmic cycles (yugas).
"storyboard" tells an episode as comic panels, "constellation" for celestial myths and star lore,
"bracket" for a fun "who would win" among gods/heroes, "dayclock" for a single fateful day.`,
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

/** Directives learned from prior low ratings of THIS submodule — injected so each
 *  regeneration is a smarter fresh attempt, not a blind re-roll. */
function buildDirectivesBlock(directives?: string[]): string {
  if (!directives?.length) return "";
  return `
LEARNED DIRECTIVES FOR THIS SUB-MODULE (a previous draft scored below bar; these are the fixes —
follow every one of them strictly, they override generic guidance where they conflict):
${directives.map((d, i) => `${i + 1}. ${d}`).join("\n")}
`;
}

/**
 * Turn a low rating into DURABLE generation directives for this submodule. Not
 * per-script patches — reusable rules that make the next fresh generation clear
 * the weak sections. Used by the content factory's improve loop.
 */
export function buildTunePrompt(opts: {
  subject: Subject;
  format: "short" | "long";
  topic: string;
  sections: { name: string; score: number; issues: { where: string; problem: string; fix: string }[] }[];
  existingDirectives: string[];
}): string {
  const { subject, format, topic, sections, existingDirectives } = opts;
  const weak = sections
    .filter((s) => s.score < 9)
    .map((s) => `- ${s.name} scored ${s.score}. Problems: ${s.issues.map((i) => i.problem).join(" | ") || "(none given)"}`)
    .join("\n");
  return `You are the prompt engineer for a ${subject.label} YouTube channel. A ${format} script on
"${topic}" was generated and graded. It fell short on these sections:
${weak}

${existingDirectives.length ? `Directives already in force for this sub-module (do NOT repeat, ADD to them):\n${existingDirectives.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n` : ""}
Write 1-3 NEW directives to add to the GENERATION prompt for this sub-module so the NEXT fresh
script scores 9+ on the weak sections. Rules:
- Each directive is a short, imperative, REUSABLE rule ("Open on a concrete number, never a definition";
  "Use at least 4 distinct scene kinds"; "Every teaching beat must name the running example") — NOT a
  fix to this one script ("change scene 3").
- Target the specific weak sections above; be concrete about what to do differently.
- No more than 3. Return STRICT JSON only: {"directives": ["...", "..."]}`;
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
  lang?: "en" | "hi";
  directives?: string[];
  exemplarScript?: string;
}): string {
  const { subject, moduleLabel, submoduleLabel, moduleStyle, submoduleStyle, format, topic, angle, recentTopics, lang, directives, exemplarScript } = opts;
  const isCoding = subject.id === "coding";
  const playbook = SUBJECT_PLAYBOOKS[subject.id] ?? "";
  const directivesBlock = buildDirectivesBlock(directives);
  const exemplarBlock = exemplarScript
    ? `
GOLD EXAMPLE — a ${format} script for this subject that scored top marks. STUDY IT, then match its
level on your OWN topic: the specificity of its hook, how each beat carries one concrete image, the
depth of its explanations, its scene-kind variety, and how its ending question lands. Do NOT reuse
its topic, facts, phrasing, or structure verbatim — your script is about "${topic}".
<gold_example>
${exemplarScript}
</gold_example>
`
    : "";
  const structure =
    format === "short"
      ? `Structure for a SHORT (45-90s, 9:16 vertical, 4-8 scenes):
1. a hook that fits this subject — a bold "bigtext" claim, a "stat" wow-number, or a sharp question
2-3. the core idea told visually, using 2+ of the scene kinds your playbook recommends
4. a concrete example or proof${isCoding ? " (code -> terminal output)" : ""}, or a quick "quiz"
5. a "question" scene — a challenge worth arguing about in the comments
DENSITY BUDGET (9:16): the YouTube UI covers the bottom quarter and right edge of a Short, so keep
every scene sparse — a diagram, table or chart at most 5 items/nodes, a tree or mindmap at most 6.
If you have more to show, split it across two scenes; a crowded Short is unreadable behind the UI.
PACING BUDGET (the video runs exactly as long as the narration): total spoken words across ALL
beats must be 130-220. Count them. Over 220 words the Short overruns 90 seconds and dies.`
      : `Structure for a LONG video (6-12 min, 16:9 landscape, 14-32 scenes — aim for 18-26):
- open with a hook ("bigtext" claim, a "stat", or a "mythfact"), then a "bullets" of "what you'll walk away knowing"
- then 4-6 SECTIONS of 3-5 teaching scenes each, drawn from your playbook's kinds
  (diagram / timeline / steps / compare / stat / chart / mythfact / quote${isCoding ? " / code -> terminal" : " / vocab"} as fits the point)
- A SECTION HAS NO TITLE CARD. Do NOT put a "bigtext" in front of a section. A section is announced
  two ways, both of which keep teaching while they do it:
  (a) its FIRST teaching scene's own "title" states what the section covers, and
  (b) the LAST beat of the previous section ends on a one-sentence forward hook that makes the next
      section feel necessary ("…which is exactly why the index stops helping past four columns.").
  Chapters come from the "sections" array, NOT from title cards — list one entry per section, each
  pointing at the id of the teaching scene that opens it, with a crisp 2-5 word title.
- "bigtext" is allowed EXACTLY TWICE in the whole video: the opening hook, and the closing recap.
  A third bigtext is a bug. A title slide with no content under it teaches nothing, and a viewer
  reads it in two seconds and then stares at it for ten.
- escalate difficulty: fundamentals early, nuance/tradeoffs/consequences later
- near the end: a "bullets" of common mistakes and a "quiz" to test the idea
- close with the "bigtext" recap then a "question" scene as the FINAL scene (that recap is the ONE
  allowed bigtext not followed by a content scene). NOTHING comes after the question — no "see you
  next time", no sign-off card, no "pro tip" outro. The question is the finale.
PACING BUDGET (the video runs exactly as long as the narration): total spoken words across ALL
beats must be 950-1700 (≈7-11 minutes at teaching pace). This is a hard floor: a "long" with
one-sentence beats becomes a thin 3-minute video that underdelivers versus the real YouTube
tutorials it competes with. Spread those words across MORE, SHORTER beats rather than fewer long
ones: no single beat may exceed ~24 spoken words, because a beat is one visual step and the picture
cannot change while it is still being read. Narrate the WHY and the mechanism, not a caption. Count
your words; if you are under 950 you have skipped depth the topic deserves — add the missing
mechanism step, not filler.`;

  const avoid = recentTopics.length
    ? `Recently covered in this sub-module (do NOT repeat): ${recentTopics.join("; ")}`
    : "";

  const langBlock =
    lang === "hi"
      ? `
LANGUAGE — HINDI (this whole video is in Hindi for an Indian audience):
- Write EVERY spoken beat (narration/say/sayIntro/sayMyth/sayFact/sayQuestion/sayReveal/sayVerdict)
  and EVERY on-screen text (text/sub/title/label/items/steps/events/meaning/examples/options/verdict)
  in natural, conversational Hindi in Devanagari script — the way an Indian teacher actually speaks,
  NOT stiff literary Hindi.
- Keep established technical, legal and constitutional terms in their standard recognised form:
  proper nouns, Article numbers, and English terms with no natural Hindi equivalent stay as-is
  ("Article 21", "GDP", "RBI") but are written so a Hindi TTS voice reads them correctly.
- PRONOUNCING ENGLISH TERMS: in the SPOKEN beats, write a common English technical word in Devanagari
  so the Hindi voice says it smoothly instead of stuttering over Latin letters ("Database" → "डेटाबेस",
  "Server" → "सर्वर", "Function" → "फंक्शन"). Keep the on-screen text/title/label in its normal English
  spelling — only the say/narration track gets the Devanagari form.
- Hinglish is natural for this audience — a common English word mid-sentence is fine when that is
  how people really say it; do not force an obscure Sanskrit word where nobody uses one.
- The "meta" (title/description/tags/hashtags) stays in a search-friendly mix: title in Hindi (may
  keep the key English term), tags/hashtags include both Hindi and English phrases people search.
- Numbers may use Indian words (सौ, हज़ार, लाख, करोड़) or digits, whichever a speaker would say.
`
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
${langBlock}
${structure}

${buildSceneShape(subject.id)}
${NARRATION_RULES}
${TTS_RULES}
${TEACHING_METHOD}
${VARIETY_RULE}
${isCoding ? CODING_RULES : NON_CODING_RULES}

Your subject playbook — favour these scene kinds and this teaching pattern:
${playbook}
${exemplarBlock}${directivesBlock}
Teaching quality bar (viewers range from beginners to experts — beginners must follow, experts must not be bored):
- The FIRST beat is the retention decision: at most 2 short sentences that open a loop the scene does
  not close. Never open with a definition, a greeting, or background. Ban the tired crutches:
  "Have you ever wondered…", "Did you know…", and the rhetorical-negation formula "Think you need X?
  / You think X? Wrong." — the model overuses these until every video sounds identical. Instead pick a
  DIFFERENT archetype each time from: (a) a shocking specific number ("₹150 a day becomes ₹10 lakh"),
  (b) a concrete mini-scene ("Your salary just rose ₹5,000. You're already poorer."), (c) a blunt
  myth-strike ("Saving whatever's left never works."), (d) a stakes question naming a real thing
  ("Which costs you more — the SIP you skipped or the EMI you took?"). Rotate archetypes; never lean
  on one opener shape.
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
- The ending question must be answerable from what was taught, and it must be CLEAN: pose a genuine
  puzzle, but never introduce a brand-new claim, a fabricated "scientists argue about this"
  controversy, or a physics/logic statement that is itself wrong or muddled. (E.g. in a collision
  both bodies feel EQUAL force by Newton's third law — don't imply the heavier one feels more.) If
  the puzzle needs a fact, that fact must be true and ideally already shown in the video.

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
{"format":"${format}","lang":"${lang ?? "en"}","subject":"${subject.label}","module":"${moduleLabel}","submodule":"${submoduleLabel}","topic":"${topic}","scenes":[...],${format === "long" ? '"sections":[{"atSceneId":"id of the teaching scene that OPENS this section","title":"2-5 words"}, 4-6 entries],' : ""}"meta":{"title":"...","description":"...","tags":[...],"hashtags":["#..."]}}

${avoid}

HARD LIMITS — validated mechanically, the script is REJECTED on any violation, so re-check every scene:
- code: max 22 lines, EVERY line max 46 characters (count them; break long lines)
- code segments: contiguous from line 1, cover every line exactly once
- terminal lines: max 60 characters each
- every "say"/beat: max 320 chars; scene "narration": max 150 chars (terminal 210)
- bigtext.text 80 / bullets item text 110 / node label 28 / compare item 70 / question.text 180
- timeline: when 18, label 52 / stat: value 14, label 60 / steps: text 80, detail 90
- quiz: question 120, option 52, EXACTLY one correct / vocab: word 28, meaning 90, example 90
- chart: label 24, unit 8, value is a plain number / quote: text 200, author 40 / mythfact: myth 140, fact 160
- trace: code line 44 (2-12 lines), cell 8, pointer label 6, all indexes within the cells
- memgrid: addr 6, value 10 / callstack: frame 24 (required on push), note 40, ret 12, never pop empty
- lifeline: actor label 16, message label 28, from≠to / bits: width 4-12, value EXACTLY width 0/1 chars for set-and-or-xor
- browserframe: url 48, badge 24, steps reference real block ids / cycle: node label 22, detail 40
- statemachine + decision: every step "go" must have an edge FROM the previous position (walk starts at the first state/node)
- chain: link text 60 / pipeline: item+out 16, station 20 / ledger: party label 16, transfer label 24, unit 4
- sankey: branch values never sum above total / gauge: min<max, zones ascend, readings within range
- pictogram: total 10-100, group counts never sum above total / race: when 12, racer 16, one value per racer per checkpoint
- schematic: only listed shapes, part label 24, steps reference real part ids / terrain: profile 4-12 samples of 0-10, feature label 20
- zoomladder: rung label 24, scale 14 / dialogue: name 14, message text 110
- graphwalk: node label 16, edges+steps reference real nodes / matrix: rows 2-8, cols 2-10, cells within grid, labels empty or full length
- threads: 2-4 lanes, task label 14, tasks/steps reference real tasks / queueflow: servers 1-4, arrive+serve 0-6
- cipher: text UPPERCASE A-Z+spaces <=12, shift 1-25 required for shift mode / circuit: only listed part kinds, wires+steps reference real parts
- formula: symbol 10, gloss 30, 1-6 terms / curves: 1-3 curves of listed shapes, mark.x 0-100
- buckets: 2-5 buckets, capacity+amounts are plain numbers / probability: segment weight 1-10, spins land on real segment index
- basket: prices array length MUST equal number of years / radar: 3-6 axes, each entity has one 0-100 value per axis
- bodymap: only listed regions, label 20 / constellation: 4-12 points, connects reference real point ids
- dayclock: pins "HH:MM" 24-hour / storyboard: 2-6 panels, 1-4 icons each, caption 60
- bracket: 4-8 contenders, EXACTLY contenders-1 matches, winner 0 or 1 / showdown: 2-6 rounds, winner left|right|tie
- skyline: only listed building kinds, h 1-10 / calendar: months 1-12, from <= to (split wrap-arounds)

Return ONLY the JSON object.`;
}

/**
 * The compact HARD LIMITS block, rendered into BOTH the regen-scene prompt and
 * the refine prompt.
 *
 * It is one constant because the two copies had already drifted: the refine copy
 * named 43 scene kinds where the other named 54, silently dropping browserframe,
 * buckets, chain, cycle, ledger, pipeline, probability, queueflow, storyboard,
 * terrain and zoomladder. A refined script was therefore held to a SMALLER rule
 * set than the one that generated it, so a refine round could introduce a
 * violation the generate round would have rejected.
 *
 * (improvement_plan.md Phase 8 predicted 8 dropped kinds and named memgrid among
 * them; measured, it is 11 and memgrid is not one of them.)
 *
 * The bulleted copy inside the main generation prompt is a different
 * presentation of the same rules and is left as its own text; it currently names
 * the same 54 kinds, which `scripts/limits-drift.mjs` checks.
 */
const HARD_LIMITS_COMPACT = `HARD LIMITS (mechanically validated): code max 22 lines, every line max 46 chars, segments contiguous
from line 1 covering all lines; terminal lines max 60 chars; say max 320; narration max 150 (terminal 210);
bigtext.text 80; bullets item 110; node label 28; compare item 70; question.text 180; timeline when
18/label 52; stat value 14/label 60; steps text 80/detail 90; quiz question 120/option 52, exactly one
correct; vocab word 28/meaning 90/example 90; chart label 24/unit 8, value plain number; quote text
200/author 40; mythfact myth 140/fact 160; trace code line 44/cell 8; memgrid addr 6/value 10;
callstack frame 24 (required on push); lifeline actor 16/message 28; bits value exactly width 0/1
chars; browserframe url 48; cycle label 22/detail 40; statemachine and decision walks need a real
edge from the previous position; chain text 60; pipeline labels 16-20; ledger party 16; sankey
branches never sum above total; gauge readings within min-max; pictogram counts never sum above
total; race one value per racer per checkpoint; schematic listed shapes only; terrain profile 4-12
samples 0-10; zoomladder scale 14; dialogue text 110; graphwalk node label 16; matrix cells within
rows x cols; threads 2-4 lanes; queueflow servers 1-4/arrive+serve 0-6; cipher text UPPERCASE <=12,
shift required for shift mode; circuit listed parts only; formula 1-6 terms; curves 1-3 listed shapes;
buckets 2-5; probability spins land on real segments; basket prices length == years; radar 3-6 axes,
values 0-100 per axis; bodymap listed regions; constellation 4-12 points; dayclock pins HH:MM;
storyboard 2-6 panels; bracket 4-8 contenders/matches == contenders-1; showdown 2-6 rounds; skyline
listed buildings h 1-10; calendar months 1-12 from<=to.`;

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

${buildSceneShape()}
${NARRATION_RULES}
${TTS_RULES}
${TEACHING_METHOD}

${HARD_LIMITS_COMPACT}

Return ONLY the JSON object of the ONE rewritten scene.`;
}

export function buildRepairPrompt(originalJson: string, errors: string): string {
  return `The JSON video script below failed schema validation. Fix ONLY the listed problems and return the corrected complete JSON object (no prose, no markdown fences). Keep everything that was valid unchanged.

If an error says the scene count is too LOW (e.g. "needs 14-32 scenes, got 13"), ADD new teaching
scenes to reach the range — expand a thin section with another diagram/compare/steps/stat scene, do
not just renumber. If it is too HIGH, merge or drop the weakest scenes. Every new scene needs a
unique id and full per-beat "say" narration like the others.

Validation errors:
${errors}

Script:
${originalJson}`;
}

/**
 * Subjects that run the full creator pipeline (blueprint → script → critique → refine)
 * instead of single-shot generation. Keyed by subject.id. Other subjects are
 * deliberately untouched — expanding this set is a content-quality decision.
 */
export const ENHANCED_SUBJECTS = new Set<string>([
  "coding",
  "history",
  "geography",
  "polity",
  "economy",
  "environment",
  "artculture",
  "english",
]);

/**
 * How a dedicated channel in this subject structures an episode — the arc the
 * blueprint stage designs around. Keyed by subject.id (ENHANCED_SUBJECTS only).
 */
const CHANNEL_ARCS: Record<string, string> = {
  coding: `Episode arc (think Fireship / ByteByteGo): open on the PAIN — the bug, the 3 AM outage, the
interview question that filters out 80% of candidates, the code that works on 10 rows and dies on 10
million. Then ground it: what IS this thing in one plain sentence and what problem does it exist to
solve. Middle: the mechanism as it really executes — real code, the actual flow of a request/byte/
pointer, with one practitioner detail per act (a port, a latency, a flag, a config line). Payoff: the
production consequence or trade-off that separates juniors from seniors. End: a challenge the viewer
can reason through with what was just taught.`,
  history: `Episode arc (think a documentary thriller): cold-open IN the moment — a specific dawn, a
specific person, a decision about to be made ("On 10 May 1857, in Meerut, 85 sepoys chose prison over
the cartridge"). Then the stakes: what hangs on this moment. Middle: the chronology as a story with
turning points — every act anchored in who/when/where and a real number (army sizes, distances,
prices, death tolls). Include the messy causes historians actually cite, not the one-line school
version. Payoff: the aftermath — what changed permanently, and the trace of it the viewer can still
see today. End: a question people will genuinely argue about in the comments.`,
  geography: `Episode arc (think RealLifeLore / Atlas Pro): open on the ANOMALY — the place that
shouldn't exist, the river that flows the "wrong" way, the border that makes no sense. Then ground
it: the physical/human process behind it in one plain sentence. Middle: build the mechanism cause by
cause (plates, monsoon physics, trade routes), each act tied to the named real place and a scale
number that stuns. Payoff: the human consequence — who lives differently because of this. End: a
question applying the mechanism to a second place.`,
  english: `Episode arc (think a charismatic communication coach): open on the MOMENT the language
fails or wins — the interview answer that fell flat, the email that read as rude, the one word that
changed the sentence. Then the rule/phrase/word ONCE, in plain words. Middle: real spoken sentences a
viewer can copy today — office, family, WhatsApp — then the edge case or nuance that trips even good
speakers, then a memory hook (root, mnemonic, vivid image). Payoff: the upgraded, natural-sounding
version. End: a challenge sentence for the comments ("rewrite this / use this word about your day").`,
  polity: `Episode arc (think a constitutional-law storyteller): open on the CLASH — the real case,
crisis or standoff where this provision got tested (a dismissed government, a struck-down law, a
midnight hearing). Then the provision in one plain sentence: what it says and why the framers put it
there. Middle: how the machinery actually moves, step by step, with exact Articles, Amendments and
case names; then the classic exam confusion untangled. Payoff: the WHY — the constitutional design
logic, and what the provision prevents. End: a mains-style question demanding an opinion with
reasoning.`,
  economy: `Episode arc (think a sharp economics explainer for India): open in the viewer's POCKET —
what this does to their prices, salary, EMI, or the country's bill ("your ₹100 note buys ₹94 worth
next year"). Then the term in one plain sentence. Middle: the mechanism as a chain of real Indian
numbers — who does what (RBI, NSO, the Budget), the actual figure, the actual date — each act one
link of the chain. Payoff: the counterintuitive consequence or the exam-grade distinction hidden
inside. End: a question that makes aspirants debate the trade-off.`,
  environment: `Episode arc (think a nature-documentary narrator with a scientist's spine): open on
one REAL scene — a species, a place, a number moving the wrong (or right) way. Then the ecological
mechanism in one plain sentence. Middle: how the system actually works (the cycle, the chain, the
feedback loop), then the human fingerprint on it, then the exact law/convention/institution that
answers it (with year). Payoff: what measurably changes if this continues or is fixed. End: a
question connecting the mechanism to the viewer's own state or city.`,
  artculture: `Episode arc (think a great museum guide): open on ONE object or moment — a single
bronze, one carved gateway, the first beat of a performance — described so vividly the viewer can
see it. Then place it: the dynasty, the century, the patron, in one plain sentence. Middle: read the
object — the 2-3 defining features visible ON it, what each one means, and the contrast with the
sibling style people confuse it with. Payoff: where it survives today and what to look for when you
stand in front of it. End: a question comparing two styles or asking what the viewer would preserve.`,
};

const BLUEPRINT_SHAPE = `Return STRICT JSON only (no markdown fences):
{
 "title": "sharpened final title, <=95 chars — keep the topic's exact search phrase",
 "hook": {"archetype": "shocking-number | mini-scene | myth-strike | stakes-question", "line": "the exact opening line(s), <=2 short sentences, ready to speak"},
 "intro": {"what_it_is": "the core thing defined in ONE plain-words sentence a newcomer gets instantly", "why_care": "one sentence: what this costs/gives the viewer or the world"},
 "running_example": "the ONE concrete example (real name/place/number/year) that threads every act",
 "acts": [{"name": "2-4 word act name", "goal": "what the viewer understands after this act", "beats": ["2-4 story beats, each one concrete idea in one sentence"], "facts": [{"claim": "the fact as it will be stated", "confidence": "exact | approx"}]}],
 "payoff": "the one insight that makes an expert nod — a consequence, trade-off or 'that's why'",
 "misconception": {"myth": "a genuinely widespread false belief about this topic", "fact": "the correction"} or null,
 "ending": {"recap": "one sentence takeaway worth remembering", "question": "the comment-bait challenge — answerable from the video, genuinely argue-worthy", "hint": "optional nudge, or null"}
}`;

export function buildBlueprintPrompt(opts: {
  subject: Subject;
  moduleLabel: string;
  submoduleLabel: string;
  moduleStyle?: string;
  submoduleStyle?: string;
  exemplar?: string;
  format: "short" | "long";
  topic: string;
  angle?: string;
  recentTopics: string[];
  lang?: "en" | "hi";
}): string {
  const { subject, moduleLabel, submoduleLabel, moduleStyle, submoduleStyle, exemplar, format, topic, angle, recentTopics, lang } = opts;
  const arc = CHANNEL_ARCS[subject.id] ?? "";
  const actBudget = format === "short" ? "1-2 acts (this is a 60-90 second Short — one idea, told perfectly)" : "3-5 acts";
  const avoid = recentTopics.length
    ? `\nRecent videos on this channel (design DIFFERENT ground, do not re-teach these): ${recentTopics.join("; ")}`
    : "";
  const northStar = exemplar
    ? `\nNORTH-STAR EPISODE — a ${format} from this track that hit the channel's quality bar. Match its
craft: the specificity of its facts, how its hook opens a loop, how its acts escalate, how its
question lands. NEVER reuse its topic, facts or phrasing — your episode is about ${topic}.
${exemplar}\n`
    : "";
  return `You are the showrunner of a dedicated YouTube channel about ${submoduleLabel} (part of the
${subject.label} → ${moduleLabel} track). Every episode gets real research and a designed narrative
before a word of script is written. Plan this episode.

Audience: ${subject.audience}.
Channel voice: ${subject.style}.${moduleStyle ? `\nTrack brief: ${moduleStyle}` : ""}${submoduleStyle ? `\nChannel brief: ${submoduleStyle}` : ""}
${arc}

Episode topic: ${topic}${angle ? `\nAngle: ${angle}` : ""}
Format: ${format} — plan ${actBudget}.${lang === "hi" ? "\nThe episode will be narrated in Hindi for an Indian audience — choose examples and facts that land in that context (the blueprint itself stays in English)." : ""}
${northStar}

RESEARCH FIRST (this is the step everyone skips — do not): recall the strongest VERIFIABLE specifics
for this exact topic — the who/what/when/where, the real figures, dates, names, Article/section
numbers, commands, prices, latencies. Then:
- Use only facts you are confident are true. Mark each fact "exact" (you'd bet on the precise figure)
  or "approx" (right ballpark — the script must hedge it with "around").
- Prefer the specific over the general: "85 sepoys of the 3rd Bengal Light Cavalry" beats "some
  soldiers"; "repo rate 6.5%" beats "the interest rate".
- If the honest answer is "the figure is disputed/unknown", design the act without that figure.

DESIGN RULES:
- The hook and the intro are DIFFERENT jobs: the hook opens a loop (pick the archetype that fits THIS
  story); the intro then grounds the newcomer — what the thing IS in plain words and why they should
  care — before any mechanism. Both must exist. Never spend the hook on a definition.
- Every act advances the story; no act may restate a previous one in new words. Escalate:
  fundamentals early, nuance and consequences later.
- The running example threads ALL acts — pick one with real texture (a name, a year, a rupee amount).
- The ending question must be answerable from what the episode teaches and spark genuine argument or
  sharing — never a quiz-trivia repeat of a fact just stated.
${avoid}

${BLUEPRINT_SHAPE}`;
}

export function buildScriptFromBlueprintPrompt(blueprintJson: string, opts: {
  subject: Subject;
  moduleLabel: string;
  submoduleLabel: string;
  moduleStyle?: string;
  submoduleStyle?: string;
  format: "short" | "long";
  topic: string;
  angle?: string;
  recentTopics: string[];
  lang?: "en" | "hi";
  directives?: string[];
  exemplarScript?: string;
}): string {
  return `${buildScriptPrompt(opts)}

EPISODE BLUEPRINT — the showrunner already researched and designed this episode. Follow it:
${blueprintJson}

How to use the blueprint:
- The hook "line" is your opening beat (adapt wording to flow, keep its idea and archetype).
- Deliver intro.what_it_is and intro.why_care as spoken beats within the first two scenes — the
  newcomer must be grounded before any mechanism${opts.format === "long" ? "" : " (in a Short this is one tight beat, not a detour)"}.
- Realise each act in order with the scene kinds that fit it best; the acts are the story spine.
- Thread the running_example through every act's scenes.
- State "exact" facts plainly; hedge every "approx" fact with "around"/"about" — never upgrade an
  approx fact to false precision.
- Include the misconception as a "mythfact" scene if it fits naturally.
- Land the payoff insight before the ending; close with ending.recap then the ending.question as the
  final "question" scene.
- The blueprint is the plan, not the script: write every beat in the narration voice defined above,
  never copy blueprint prose verbatim into captions.

Return ONLY the complete script JSON object.`;
}

/** Shape of the critique stage's verdict (parsed leniently in the route). */
export type ScriptCritique = {
  verdict: "ship" | "revise";
  issues: { where: string; problem: string; fix: string }[];
};

export function buildCritiquePrompt(scriptJson: string, opts: {
  subject: Subject;
  format: "short" | "long";
  topic: string;
  lang?: "en" | "hi";
}): string {
  const { subject, format, topic, lang } = opts;
  const playbook = SUBJECT_PLAYBOOKS[subject.id] ?? "";
  return `You are the channel's harshest editor reviewing a ${format} script on "${topic}" before it
goes to production. The bar: would a dedicated ${subject.label} channel with 1M subscribers ship this?
${lang === "hi" ? "The script is in Hindi — judge the Hindi narration on the same bars (natural spoken Hindi, not stiff literary register)." : ""}
Subject playbook the script should honour:
${playbook}

Check, in order of importance:
1. INTRO: within the first two scenes, does a spoken beat say what the core thing IS in one plain
   sentence AND why the viewer should care? A video that jumps from hook straight into mechanism
   fails this check.
2. HOOK: is the first beat a fresh, specific loop-opener — not a definition, not a greeting, not a
   tired formula ("Have you ever", "Did you know", "Imagine", "What if I told you")?
3. STORY: does every scene ADVANCE the story? Flag any scene that restates a previous scene's point
   in a new format, and any section card followed by content that doesn't deliver what it promises.
4. FACTS: are the specifics real and subject-grade (dates, ₹ figures, Article numbers, commands,
   latencies — whatever this subject demands)? Flag invented precision, a figure you believe is
   wrong, and any estimate stated without "around". Flag vague hand-waving where a real specific
   belongs ("many soldiers", "a lot of money").
5. VOICE: is the narration a creator talking, or a textbook? Flag academic register ("possesses",
   "utilize", "furthermore", "profound", "significant implications"), formulaic transitions, and any
   beat with zero concrete image.
6. ENDING: is there a payoff/recap beat before the final question? Is the question answerable from
   the video and genuinely argue-worthy? Does ANYTHING come after the question scene (nothing may)?

Verdict rules: "ship" only if every check passes — be strict, most first drafts are "revise". List at
most 6 issues, the most damaging first. Each fix must be concrete enough to apply directly ("replace
scene intro-1's beat with the ₹94 purchasing-power line"), not generic advice ("make it engaging").

Return STRICT JSON only:
{"verdict": "ship" | "revise", "issues": [{"where": "scene id or 'meta'", "problem": "what is wrong", "fix": "exactly what to change"}]}

Script to review:
${scriptJson}`;
}

export function buildRefinePrompt(scriptJson: string, critiqueJson: string, opts: {
  subject: Subject;
  format: "short" | "long";
  topic: string;
}): string {
  const { subject, format, topic } = opts;
  return `You are the lead scriptwriter of a ${subject.label} YouTube channel. The editor reviewed
your ${format} script on "${topic}" and demands fixes. Apply EVERY fix, touching only what the
issues require — scenes the editor did not flag stay exactly as they are (same ids, same content).

Editor's issues:
${critiqueJson}

${buildSceneShape(subject.id)}
${NARRATION_RULES}
${TTS_RULES}

${HARD_LIMITS_COMPACT}
${scriptJson}

Return ONLY the complete corrected JSON object (no prose, no markdown fences).`;
}
