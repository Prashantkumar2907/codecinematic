import type { SceneScript } from "./schema";

/**
 * Publish metadata shared by every fixture that has no hand-written copy of its own.
 * These scripts are never uploaded, but `metaSchema` is not optional, so the defaults
 * still have to satisfy its length and hashtag rules.
 */
const DEMO_META: SceneScript["meta"] = {
  title: "DevStudio probe fixture — single scene smoke test",
  description:
    "Hardcoded fixture used by the probe and filmstrip to exercise one scene painter without a Gemini call. Not for publishing.",
  tags: ["devstudio", "probe", "fixture", "render test"],
  hashtags: ["#DevStudio", "#Probe", "#RenderTest"],
};

/** Hardcoded script for the render spike and manual smoke-testing (no Gemini call). */
export const DEMO_CHART: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing 3D Chart",
  scenes: [
    {
      kind: "chart",
      id: "cht",
      title: "Latency after caching",
      mode: "column",
      items: [
        { label: "Mon", value: 120, unit: "ms", say: "Monday we start at a heavy 120 milliseconds." },
        { label: "Tue", value: 90, unit: "ms", say: "Tuesday the cache warms up." },
        { label: "Wed", value: 62, unit: "ms", say: "Wednesday keeps falling." },
        { label: "Thu", value: 40, unit: "ms", say: "Thursday we're well under target." },
        { label: "Fri", value: 28, unit: "ms", say: "Friday it settles near 28." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_TREE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing 3D Tree",
  scenes: [
    {
      kind: "tree",
      id: "memtree",
      title: "Types of Memory and Storage",
      nodes: [
        { id: "root", label: "Memory & Storage", parent: null },
        { id: "mem", label: "Memory", parent: "root", icon: "cpu" },
        { id: "stor", label: "Storage", parent: "root", icon: "harddrive" },
        { id: "ram", label: "RAM", parent: "mem" },
        { id: "rom", label: "ROM", parent: "mem" },
        { id: "ssd", label: "SSD", parent: "stor" },
        { id: "hdd", label: "HDD", parent: "stor" },
      ],
      steps: [
        { reveal: ["root"], say: "At the top sit the two families: memory and storage." },
        { reveal: ["mem", "stor"], say: "Memory is fast and temporary; storage is slower but permanent." },
        { reveal: ["ram", "rom", "ssd", "hdd"], say: "Each splits again into the types you actually buy." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BULLETS: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Bullets",
  scenes: [
    {
      kind: "bullets",
      id: "bul",
      title: "Why caching helps",
      items: [
        { text: "Cuts repeated database work", say: "It cuts repeated work against the database." },
        { text: "Serves hot data from memory", say: "Hot data is served straight from memory." },
        { text: "Absorbs traffic spikes", say: "It absorbs sudden traffic spikes." },
        { text: "Lowers tail latency", say: "And it lowers your tail latency." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_QUOTE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Quote",
  scenes: [
    {
      kind: "quote",
      id: "qt",
      narration: "Alan Kay on why your first programming language is the hardest thing to unlearn.",
      text: "The most disastrous thing that you can ever learn is your first programming language.",
      author: "Alan Kay",
    }
  ],
  meta: DEMO_META,
};

export const DEMO_MEMGRID: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Memgrid",
  scenes: [
    {
      kind: "memgrid",
      id: "mg",
      title: "Memory Allocation",
      cells: [
        { addr: "0x1000", value: "A" },
        { addr: "0x1004" },
        { addr: "0x1008", value: "C" },
        { addr: "0x100C" }
      ],
      steps: [
        { write: [{ index: 1, value: "B" }], free: [], highlight: [1], say: "Allocated B." },
        { write: [], free: [0], highlight: [0], say: "Freed A." },
        { write: [], free: [], highlight: [], pointer: { label: "ptr", index: 2 }, say: "Pointer points to C." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_STATEMACHINE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Statemachine",
  scenes: [
    {
      kind: "statemachine",
      id: "s-statemachine",
      title: "TCP connection",
      states: [
        { id: "closed", label: "CLOSED", x: 1, y: 5, accent: true },
        { id: "syn", label: "SYN-SENT", x: 5, y: 5, accent: false },
        { id: "estab", label: "ESTABLISHED", x: 9, y: 5, accent: false },
      ],
      edges: [
        { from: "closed", to: "syn", label: "connect" },
        { from: "syn", to: "estab", label: "ack" },
        { from: "estab", to: "closed", label: "close" },
      ],
      steps: [
        { go: "syn", say: "Opening a connection sends a SYN and moves to SYN-SENT." },
        { go: "estab", say: "The handshake completes and the link is established." },
        { go: "closed", say: "Closing tears it back down to CLOSED." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_DIAGRAM: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Diagram",
  scenes: [
    {
      kind: "diagram",
      id: "diag",
      title: "The lookup walk",
      nodes: [
        { id: "obj", label: "p1", x: 4, y: 0, w: 4, h: 2, accent: true, icon: "📦" },
        { id: "lookup", label: "lookup", x: 0, y: 0, w: 2, h: 2, accent: false, icon: "🔍" },
        { id: "proto", label: "Person.prototype", x: 3, y: 4, w: 6, h: 2, accent: false },
        { id: "objproto", label: "Object.prototype", x: 3, y: 8, w: 6, h: 2, accent: false },
      ],
      arrows: [
        { from: "obj", to: "proto", label: "not found? go up" },
        { from: "proto", to: "objproto", label: "still not found?" },
      ],
      steps: [
        {
          reveal: ["obj", "lookup"],
          highlight: ["obj"],
          move: [],
          say: "JavaScript checks the object itself first.",
        },
        {
          reveal: ["proto"],
          highlight: ["proto"],
          move: [{ node: "lookup", x: 0, y: 4 }],
          say: "Not there? It walks up to the prototype and looks again.",
        },
        {
          reveal: ["objproto"],
          highlight: ["objproto"],
          move: [{ node: "lookup", x: 0, y: 8 }],
          say: "Still nothing? It keeps climbing until Object dot prototype, then gives up with undefined.",
        },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_TABLE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Table",
  scenes: [
    {
      kind: "table",
      id: "tbl",
      title: "Own vs Inherited",
      columns: ["Method", "Location"],
      highlightCol: 0,
      rows: [
        { cells: ["p1.name", "Object itself"], highlight: false, say: "name is set in the constructor" },
        { cells: ["p1.greet()", "Person.prototype"], highlight: true, say: "greet is not on p1" },
        { cells: ["p1.toString()", "Object.prototype"], highlight: false, say: "toString comes from two hops up" },
      ],
      sayIntro: "Notice where each method actually lives.",
    }
  ],
  meta: DEMO_META,
};

export const DEMO_CALLSTACK: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Callstack",
  scenes: [
    {
      kind: "callstack",
      id: "s-callstack",
      title: "Recursive factorial",
      steps: [
        { op: "push", frame: "fact(3)", note: "3 * fact(2)", say: "The outer call waits on a smaller subproblem." },
        { op: "push", frame: "fact(2)", note: "2 * fact(1)", say: "Each call stacks a new frame on top." },
        { op: "push", frame: "fact(1)", note: "1 * fact(0)", say: "We go deeper." },
        { op: "push", frame: "fact(0)", note: "return 1", say: "Until we hit the base case." },
        { op: "pop", say: "Then it pops." },
        { op: "pop", say: "And pops." },
        { op: "pop", say: "And pops." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_MATRIX: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Matrix",
  scenes: [
    {
      kind: "matrix",
      id: "s2-matrix",
      title: "Dynamic programming grid",
      rows: 3,
      cols: 4,
      rowLabels: ["", "a", "b"],
      colLabels: ["", "", "a", "c"],
      steps: [
        {
          set: [
            { r: 0, c: 0, value: "0", tone: "dim" },
          ],
          say: "The empty prefixes give a base value of zero.",
        },
        {
          set: [
            { r: 1, c: 1, value: "1", tone: "good" },
          ],
          say: "First match is good.",
        },
        {
          set: [
            { r: 2, c: 2, value: "2", tone: "warn" },
          ],
          say: "Next is a mismatch.",
        },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_COMPARE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Compare",
  scenes: [
    {
      kind: "compare",
      id: "sqlnosql",
      title: "SQL vs NoSQL",
      left: {
        title: "SQL",
        items: ["Fixed schema", "Strong consistency", "Powerful joins"],
        say: "SQL databases use a fixed schema with strong consistency.",
        icon: "database",
      },
      right: {
        title: "NoSQL",
        items: ["Flexible schema", "Horizontal scale", "Denormalized reads"],
        say: "NoSQL trades a rigid schema for horizontal scale.",
        icon: "server",
      },
      verdict: "Pick by access pattern, not by hype.",
      sayVerdict: "Choose based on how you actually read and write.",
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BROWSERFRAME: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Browser",
  scenes: [
    {
      kind: "browserframe",
      id: "s-browserframe",
      url: "example.com",
      blocks: [
        { id: "hdr", role: "header", x: 0, y: 0, w: 12, h: 1 },
        { id: "hero", role: "hero", x: 0, y: 1, w: 12, h: 3 },
        { id: "txt", role: "text", x: 0, y: 4, w: 8, h: 2 },
        { id: "btn", role: "button", x: 8, y: 4, w: 3, h: 1 },
      ],
      steps: [
        {
          show: ["hdr", "hero"],
          paint: [],
          badge: "HTML parsed",
          say: "The browser lays out the header and hero first.",
        },
        {
          show: ["hdr", "hero", "txt", "btn"],
          paint: ["btn"],
          badge: "CSS applied",
          say: "Then CSS paints the button.",
        },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BUCKETS: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Buckets",
  scenes: [
    {
      kind: "buckets",
      id: "bkt",
      title: "Rate Limiting",
      unit: "req/s",
      buckets: [
        { label: "App", capacity: 100 },
        { label: "DB", capacity: 50 },
      ],
      pours: [
        { amount: 40, say: "We receive 40 requests." },
        { amount: 80, say: "Then a spike of 80." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BASKET: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Basket",
  scenes: [
    {
      kind: "basket",
      id: "bskt",
      title: "Inflation Basket",
      unit: "$",
      years: [
        { when: "1990", say: "In 1990, things were cheap." },
        { when: "2020", say: "By 2020, they rose." }
      ],
      items: [
        { label: "House", icon: "🏠", prices: [100000, 300000] },
        { label: "Car", icon: "🚗", prices: [15000, 35000] },
        { label: "Bread", icon: "🍞", prices: [1.2, 2.5] },
        { label: "College", icon: "🎓", prices: [10000, 40000] },
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BITS: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Bits",
  scenes: [
    {
      kind: "bits",
      id: "b1",
      title: "BITWISE",
      width: 8,
      steps: [
        { op: "set", value: "10101010", say: "Start with the alternating pattern one zero one zero." },
        { op: "and", value: "11110000", say: "AND against the top nibble keeps only the high four bits." },
        { op: "shl", say: "Shift left once and every bit walks one place up." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_THREADS: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Threads",
  scenes: [
    {
      kind: "threads",
      id: "t1",
      title: "CONCURRENCY",
      lanes: [{ label: "Thread 1" }, { label: "Thread 2" }],
      tasks: [
        { id: "tk1", lane: 0, label: "Fetch", start: 0, len: 4, kind: "run" },
        { id: "tk2", lane: 1, label: "Parse", start: 1, len: 3, kind: "wait" }
      ],
      steps: [
        { reveal: ["tk1"], clash: [], say: "Thread one starts fetching and holds the lane for four ticks." },
        { reveal: ["tk2"], clash: ["tk1", "tk2"], say: "Thread two wakes up mid-fetch and now both want the same resource." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_CIPHER: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Cipher",
  scenes: [
    {
      kind: "cipher",
      id: "c1",
      title: "HASHING",
      mode: "hash",
      text: "HELLO",
      steps: [
        { op: "input", say: "Input" },
        { op: "mix", say: "Mix" },
        { op: "digest", say: "Digest" }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_CIRCUIT: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Circuit",
  scenes: [
    {
      kind: "circuit",
      id: "circ1",
      title: "Simple Circuit",
      parts: [
        { id: "bat", kind: "battery", x: 1, y: 5, label: "9V" },
        { id: "sw", kind: "switch", x: 5, y: 2, label: "S1" },
        { id: "bulb", kind: "bulb", x: 9, y: 5, label: "L1" },
      ],
      wires: [
        { from: "bat", to: "sw" },
        { from: "sw", to: "bulb" },
        { from: "bulb", to: "bat" },
      ],
      steps: [
        {
          close: [],
          on: [],
          signal: false,
          highlight: ["sw"],
          say: "With the switch open, no current can flow.",
        },
        {
          close: ["sw"],
          on: ["bulb"],
          signal: true,
          highlight: [],
          say: "Close the switch and the loop completes — the bulb lights.",
        },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_SCRIPT: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Coding",
  module: "Frontend",
  submodule: "JavaScript",
  topic: "The prototype chain: how objects find their methods",
  scenes: [
    {
      kind: "bigtext",
      id: "hook",
      narration: "Your object doesn't have that method. So why does calling it still work?",
      text: "Don't sound like a **temp** in your __interview__",
      sub: "Using 'I am doing' instead of 'I do' shrinks your **authority**.",
    },
    {
      kind: "diagram",
      id: "chain",
      title: "The lookup walk",
      nodes: [
        { id: "obj", label: "p1", x: 4, y: 0, w: 4, h: 2, accent: true, icon: "📦" },
        { id: "lookup", label: "lookup", x: 0, y: 0, w: 2, h: 2, accent: false, icon: "🔍" },
        { id: "proto", label: "Person.prototype", x: 3, y: 4, w: 6, h: 2, accent: false },
        { id: "objproto", label: "Object.prototype", x: 3, y: 8, w: 6, h: 2, accent: false },
      ],
      arrows: [
        { from: "obj", to: "proto", label: "not found? go up" },
        { from: "proto", to: "objproto", label: "still not found?" },
      ],
      steps: [
        {
          reveal: ["obj", "lookup"],
          highlight: ["obj"],
          move: [],
          say: "JavaScript checks the object itself first.",
        },
        {
          reveal: ["proto"],
          highlight: ["proto"],
          move: [{ node: "lookup", x: 0, y: 4 }],
          say: "Not there? It walks up to the prototype and looks again.",
        },
        {
          reveal: ["objproto"],
          highlight: ["objproto"],
          move: [{ node: "lookup", x: 0, y: 8 }],
          say: "Still nothing? It keeps climbing until Object dot prototype, then gives up with undefined.",
        },
      ],
    },
    {
      kind: "code",
      id: "example",
      lang: "js",
      title: "prototype.js",
      code: 'function Person(name) {\n  this.name = name;\n}\n\nPerson.prototype.greet = function () {\n  return "Hello, " + this.name;\n};\n\nconst p1 = new Person("Aman");\nconsole.log(p1.greet());\nconsole.log(p1.hasOwnProperty("greet"));',
      segments: [
        { fromLine: 1, toLine: 4, say: "A plain constructor. Every instance gets its own name." },
        {
          fromLine: 5,
          toLine: 8,
          say: "But greet lives on the prototype. One shared copy for every Person ever created.",
        },
        {
          fromLine: 9,
          toLine: 11,
          say: "Now watch: p one can call greet, yet has own property says it was never on the object.",
        },
      ],
      focusLines: [5, 6, 7],
      expectedOutput: "Hello, Aman\nfalse",
    },
    {
      kind: "terminal",
      id: "output",
      narration: "There it is — the method works, but hasOwnProperty says false. The lookup found it one level up.",
      lines: ["$ node prototype.js", "Hello, Aman", "false"],
    },
    {
      kind: "table",
      id: "props",
      sayIntro: "Here is what actually lives where, side by side.",
      title: "Own vs inherited",
      columns: ["Property", "On p1?", "Found via"],
      highlightCol: 2,
      rows: [
        { cells: ["name", "yes", "the object"], highlight: false, say: "name is set in the constructor, so it lives on p1 itself." },
        { cells: ["greet", "no", "the prototype"], highlight: true, say: "But greet is not on p1 — it is found one hop up, on the prototype." },
        { cells: ["toString", "no", "Object.prototype"], highlight: false, say: "And toString comes from two hops up, on Object dot prototype." },
      ],
    },
    {
      kind: "mythfact",
      id: "myth",
      myth: "Every object carries its own copy of every method.",
      fact: "Methods live once on the prototype — a thousand objects share one function.",
      sayMyth: "Most beginners assume every object carries its own copy of every method.",
      sayFact: "Wrong. Methods live once on the prototype, and a thousand objects share that single function.",
    },
    {
      kind: "quiz",
      id: "check",
      question: "Where does greet actually live?",
      options: [
        { text: "Copied onto every Person object", correct: false },
        { text: "Once, on Person.prototype", correct: true },
        { text: "Recreated on every call", correct: false },
      ],
      sayQuestion: "Quick check — where does greet actually live? Lock in your guess.",
      sayReveal: "It lives once on Person dot prototype. Every object just borrows it through the chain.",
    },
    {
      kind: "question",
      id: "challenge",
      narration:
        "If you add sayBye to the prototype after p one was created, does p one dot sayBye work? Comment your answer.",
      text: "Add sayBye to the prototype AFTER p1 exists. Does p1.sayBye() work?",
      hint: "Think about WHEN the lookup happens.",
    },
  ],
  meta: {
    title: "Your object doesn't own its methods — JS prototypes #Shorts",
    description:
      "That method you call every day? Your object doesn't have it.\nHow the prototype chain lookup actually works — in 60 seconds.",
    tags: ["javascript", "prototype", "prototype chain", "js interview", "web development"],
    hashtags: ["#JavaScript", "#WebDev", "#Shorts"],
  },
};

/** QA/probe fixture: Scene-kind tour: all twenty new animations */
export const DEMO_KINDS_LONG: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Engine",
  module: "Scene kinds",
  submodule: "Tour",
  topic: "Scene-kind tour: all twenty new animations",
  scenes: [
    {
      kind: "bigtext",
      id: "intro",
      narration: "Twenty animated scene kinds, one tour. Watch each teaching visual in action.",
      text: "Scene-kind tour",
      sub: "All twenty new animations",
    },
    {
      kind: "trace",
      id: "s-trace",
      title: "Two-pointer reverse",
      code: [
        "function reverse(a) {",
        "  let i = 0, j = a.length-1;",
        "  while (i < j) {",
        "    swap(a, i, j);",
        "    i++; j--;",
        "  }",
        "}",
      ],
      cells: ["3", "1", "4", "1", "5"],
      steps: [
        {
          line: 2,
          pointers: [
            { label: "i", index: 0 },
            { label: "j", index: 4 },
          ],
          mark: [],
          say: "Two pointers start at the ends of the array.",
        },
        {
          line: 4,
          pointers: [
            { label: "i", index: 0 },
            { label: "j", index: 4 },
          ],
          mark: [],
          swap: { a: 0, b: 4 },
          say: "We swap the two ends, then step inward.",
        },
        {
          line: 5,
          pointers: [
            { label: "i", index: 1 },
            { label: "j", index: 3 },
          ],
          mark: [
            { index: 0, state: "done" },
            { index: 4, state: "done" },
          ],
          say: "i moves right, j moves left, and we repeat.",
        },
      ],
    },
    {
      kind: "memgrid",
      id: "s-memgrid",
      title: "Heap allocation",
      cells: [
        { addr: "0x00" },
        { addr: "0x08" },
        { addr: "0x10" },
        { addr: "0x18" },
        { addr: "0x20" },
        { addr: "0x28" },
      ],
      steps: [
        {
          write: [
            { index: 0, value: "42" },
            { index: 1, value: "7" },
          ],
          free: [],
          highlight: [0, 1],
          say: "malloc hands back two adjacent slots and writes our values.",
        },
        {
          write: [
            { index: 2, value: "99" },
          ],
          free: [],
          pointer: { label: "ptr", index: 2 },
          highlight: [2],
          say: "A third allocation lands in the next free cell.",
        },
        {
          write: [],
          free: [0, 1],
          highlight: [],
          say: "Calling free releases the first block back to the allocator.",
        },
      ],
    },
    {
      kind: "callstack",
      id: "s-callstack",
      title: "Recursive factorial",
      steps: [
        {
          op: "push",
          frame: "fact(3)",
          note: "3 * fact(2)",
          say: "The outer call waits on a smaller subproblem.",
        },
        {
          op: "push",
          frame: "fact(2)",
          note: "2 * fact(1)",
          say: "Each call stacks a new frame on top.",
        },
        {
          op: "push",
          frame: "fact(1)",
          note: "base case",
          say: "The base case finally returns a concrete value.",
        },
        { op: "pop", ret: "1", say: "Frames unwind, each multiplying as it returns." },
        { op: "pop", ret: "2", say: "The stack collapses back down toward the first call." },
        { op: "pop", ret: "6", say: "The original call resolves to six." },
      ],
    },
    {
      kind: "bits",
      id: "s-bits",
      title: "Bit masking",
      width: 8,
      steps: [
        { op: "set", value: "10110100", say: "Start with an eight-bit register holding some flags." },
        {
          op: "and",
          value: "00001111",
          note: "low nibble",
          say: "AND with a mask keeps only the low four bits.",
        },
        {
          op: "shr",
          note: "divide by 2",
          say: "A right shift drops the lowest bit, halving the value.",
        },
      ],
    },
    {
      kind: "lifeline",
      id: "s-lifeline",
      title: "OAuth handshake",
      actors: [
        { id: "app", label: "App", icon: "📱" },
        { id: "auth", label: "Auth server", icon: "🔐" },
        { id: "api", label: "API", icon: "🗄️" },
      ],
      messages: [
        {
          from: "app",
          to: "auth",
          label: "login request",
          style: "call",
          say: "The app asks the auth server for a token.",
        },
        {
          from: "auth",
          to: "app",
          label: "access token",
          style: "return",
          say: "The server verifies and returns a signed token.",
        },
        {
          from: "app",
          to: "api",
          label: "GET /data + token",
          style: "data",
          say: "The app calls the API carrying that token.",
        },
      ],
    },
    {
      kind: "browserframe",
      id: "s-browserframe",
      url: "example.com",
      blocks: [
        { id: "hdr", role: "header", x: 0, y: 0, w: 12, h: 1 },
        { id: "hero", role: "hero", x: 0, y: 1, w: 12, h: 3 },
        { id: "txt", role: "text", x: 0, y: 4, w: 8, h: 2 },
        { id: "btn", role: "button", x: 8, y: 4, w: 3, h: 1 },
      ],
      steps: [
        {
          show: ["hdr", "hero"],
          paint: [],
          badge: "HTML parsed",
          say: "The browser lays out the header and hero first.",
        },
        {
          show: ["txt", "btn"],
          paint: ["hero"],
          badge: "paint",
          say: "Text and buttons stream in, then pixels get painted.",
        },
        {
          show: [],
          paint: ["btn"],
          shift: { block: "btn", y: 5 },
          badge: "layout shift",
          say: "A late image nudges the button down — a layout shift.",
        },
      ],
    },
    {
      kind: "statemachine",
      id: "s-statemachine",
      title: "TCP connection",
      states: [
        { id: "closed", label: "CLOSED", x: 1, y: 5, accent: true },
        { id: "syn", label: "SYN-SENT", x: 5, y: 5, accent: false },
        { id: "estab", label: "ESTABLISHED", x: 9, y: 5, accent: false },
      ],
      edges: [
        { from: "closed", to: "syn", label: "connect" },
        { from: "syn", to: "estab", label: "ack" },
        { from: "estab", to: "closed", label: "close" },
      ],
      steps: [
        { go: "syn", say: "Opening a connection sends a SYN and moves to SYN-SENT." },
        { go: "estab", say: "The handshake completes and the link is established." },
        { go: "closed", say: "Closing tears it back down to CLOSED." },
      ],
    },
    {
      kind: "decision",
      id: "s-decision",
      title: "Should you cache it?",
      nodes: [
        { id: "q", shape: "question", label: "Does the data change often?", x: 4, y: 0 },
        { id: "no", shape: "outcome", label: "Cache it aggressively", x: 1, y: 6 },
        { id: "yes", shape: "outcome", label: "Skip the cache", x: 8, y: 6 },
      ],
      edges: [
        { from: "q", to: "no", label: "no" },
        { from: "q", to: "yes", label: "yes" },
      ],
      steps: [
        { go: "q", say: "Start by asking how volatile the data really is." },
        { go: "no", say: "Rarely changes? Cache it and serve reads instantly." },
      ],
    },
    {
      kind: "cycle",
      id: "s-cycle",
      title: "The request lifecycle",
      nodes: [
        { label: "Request", icon: "📨", detail: "client sends", say: "A client fires off a request." },
        {
          label: "Route",
          icon: "🧭",
          detail: "match handler",
          say: "The router matches it to a handler.",
        },
        {
          label: "Respond",
          icon: "📤",
          detail: "send back",
          say: "The handler builds and returns a response.",
        },
        {
          label: "Log",
          icon: "📝",
          detail: "record it",
          say: "The result is logged, and the loop begins again.",
        },
      ],
    },
    {
      kind: "chain",
      id: "s-chain",
      title: "How a commit ships",
      links: [
        { text: "Write code", icon: "⌨️", say: "It all starts with a change on your machine." },
        { text: "Commit", icon: "💾", say: "You snapshot that change into a commit." },
        { text: "CI runs tests", icon: "🧪", say: "Continuous integration proves it still works." },
        { text: "Deploy", icon: "🚀", say: "A green build ships to production." },
      ],
    },
    {
      kind: "pipeline",
      id: "s-pipeline",
      title: "Compiler stages",
      item: { label: "source.c", icon: "📄" },
      stations: [
        { label: "Lexer", icon: "🔤", out: "tokens", say: "The lexer breaks text into tokens." },
        { label: "Parser", icon: "🌳", out: "AST", say: "The parser builds a syntax tree." },
        { label: "Codegen", icon: "⚙️", out: "binary", say: "Codegen emits the final machine code." },
      ],
    },
    {
      kind: "ledger",
      id: "s-ledger",
      title: "Splitting the bill",
      unit: "₹",
      parties: [
        { id: "a", label: "Asha", icon: "🧑", start: 500 },
        { id: "b", label: "Bilal", icon: "🧑", start: 500 },
        { id: "c", label: "Chetan", icon: "🧑", start: 500 },
      ],
      transfers: [
        {
          from: "a",
          to: "c",
          amount: 200,
          label: "dinner",
          say: "Asha owes Chetan for covering dinner.",
        },
        { from: "b", to: "c", amount: 150, label: "cab", say: "Bilal pays Chetan back for the cab." },
      ],
    },
    {
      kind: "sankey",
      id: "s-sankey",
      title: "Where the salary goes",
      source: { label: "Take-home pay", total: 100, unit: "%" },
      branches: [
        { label: "Rent", value: 35, say: "Rent takes the biggest single slice." },
        { label: "Food", value: 25, say: "Food and groceries are next." },
        { label: "Savings", value: 20, say: "A fifth is set aside as savings." },
        { label: "Everything else", value: 20, say: "The rest covers everything else." },
      ],
    },
    {
      kind: "gauge",
      id: "s-gauge",
      title: "CPU temperature",
      min: 0,
      max: 100,
      unit: "°C",
      zones: [
        { upTo: 60, label: "safe", tone: "good" },
        { upTo: 80, label: "warm", tone: "warn" },
        { upTo: 100, label: "hot", tone: "danger" },
      ],
      readings: [
        { label: "Idle", value: 40, say: "At idle the chip sits comfortably cool." },
        { label: "Under load", value: 78, say: "Under heavy load it climbs into the warm zone." },
      ],
    },
    {
      kind: "pictogram",
      id: "s-pictogram",
      title: "Who has internet?",
      mode: "grid",
      total: 100,
      groups: [
        { label: "Online", count: 65, say: "About sixty-five in a hundred people are online." },
        { label: "Offline", count: 35, say: "The remaining third are still unconnected." },
      ],
    },
    {
      kind: "race",
      id: "s-race",
      title: "Sorting algorithms",
      unit: "ops",
      racers: [
        { label: "Bubble", icon: "🫧" },
        { label: "Quicksort", icon: "⚡" },
      ],
      checkpoints: [
        {
          when: "n=10",
          values: [100, 33],
          say: "On tiny inputs the gap is small.",
        },
        {
          when: "n=100",
          values: [10000, 664],
          say: "By a hundred items quicksort pulls far ahead.",
        },
        {
          when: "n=1000",
          values: [1000000, 9966],
          say: "At scale the quadratic sort is hopelessly behind.",
        },
      ],
    },
    {
      kind: "schematic",
      id: "s-schematic",
      title: "A simple arch bridge",
      parts: [
        { id: "l", shape: "pillar", x: 1, y: 6, w: 2, h: 4, label: "pier" },
        { id: "r", shape: "pillar", x: 9, y: 6, w: 2, h: 4, label: "pier" },
        { id: "arch", shape: "arch", x: 2, y: 4, w: 8, h: 3, label: "span" },
        { id: "deck", shape: "platform", x: 1, y: 3, w: 10, h: 1, label: "deck" },
      ],
      steps: [
        {
          reveal: ["l", "r"],
          highlight: [],
          say: "Two piers are sunk into the ground first.",
        },
        {
          reveal: ["arch"],
          highlight: ["arch"],
          say: "The arch spans between them, carrying the load.",
        },
        {
          reveal: ["deck"],
          highlight: [],
          say: "Finally the deck lays flat across the top.",
        },
      ],
    },
    {
      kind: "terrain",
      id: "s-terrain",
      title: "A river's journey",
      profile: [9, 8, 6, 5, 3, 2, 1, 0],
      river: true,
      features: [
        { at: 0, kind: "peak", label: "Source", say: "The river is born high in the mountains." },
        { at: 4, kind: "city", label: "Riverside town", say: "Midway it feeds a town on its banks." },
        { at: 7, kind: "delta", label: "Delta", say: "It fans out into a delta at the sea." },
      ],
    },
    {
      kind: "zoomladder",
      id: "s-zoomladder",
      title: "Scales of the universe",
      direction: "out",
      rungs: [
        { label: "You", scale: "1 m", icon: "🧍", say: "Start at human scale, about a metre tall." },
        { label: "City", scale: "10 km", icon: "🏙️", say: "Zoom out and a whole city fits in view." },
        {
          label: "Earth",
          scale: "10⁷ m",
          icon: "🌍",
          say: "Further out, the entire planet is a marble.",
        },
      ],
    },
    {
      kind: "dialogue",
      id: "s-dialogue",
      title: "Code review",
      left: { name: "Reviewer", icon: "🧐" },
      right: { name: "Author", icon: "👩‍💻" },
      messages: [
        {
          from: "left",
          text: "This function is doing three things at once.",
          say: "The reviewer flags a function with too many jobs.",
        },
        {
          from: "right",
          text: "Fair — I'll split it into smaller helpers.",
          reaction: "👍",
          say: "The author agrees to break it apart.",
        },
      ],
    },
    {
      kind: "question",
      id: "outro",
      narration: "Which of these twenty scene kinds would fit the topic you want to teach next?",
      text: "Which scene kind fits your next topic?",
      hint: "Match the visual to the idea.",
    },
  ],
  meta: {
    title: "Scene-kind tour: all twenty new animations",
    description: "Scene-kind tour: all twenty new animations. A QA fixture touring the studio's animated scene kinds so /probe can render each one by id.",
    tags: ["tour", "scene kinds", "animation", "demo", "fixture"],
    hashtags: ["#Demo", "#Animation", "#Studio"],
  },
};

/** QA/probe fixture: Scene-kind tour: five animations in sixty seconds */
export const DEMO_KINDS_SHORT: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Engine",
  module: "Scene kinds",
  submodule: "Tour",
  topic: "Scene-kind tour: five animations in sixty seconds",
  scenes: [
    {
      kind: "bigtext",
      id: "intro",
      narration: "Twenty animated scene kinds, one tour. Watch each teaching visual in action.",
      text: "Scene-kind tour",
      sub: "All twenty new animations",
    },
    {
      kind: "trace",
      id: "s-trace",
      title: "Two-pointer reverse",
      code: [
        "function reverse(a) {",
        "  let i = 0, j = a.length-1;",
        "  while (i < j) {",
        "    swap(a, i, j);",
        "    i++; j--;",
        "  }",
        "}",
      ],
      cells: ["3", "1", "4", "1", "5"],
      steps: [
        {
          line: 2,
          pointers: [
            { label: "i", index: 0 },
            { label: "j", index: 4 },
          ],
          mark: [],
          say: "Two pointers start at the ends of the array.",
        },
        {
          line: 4,
          pointers: [
            { label: "i", index: 0 },
            { label: "j", index: 4 },
          ],
          mark: [],
          swap: { a: 0, b: 4 },
          say: "We swap the two ends, then step inward.",
        },
        {
          line: 5,
          pointers: [
            { label: "i", index: 1 },
            { label: "j", index: 3 },
          ],
          mark: [
            { index: 0, state: "done" },
            { index: 4, state: "done" },
          ],
          say: "i moves right, j moves left, and we repeat.",
        },
      ],
    },
    {
      kind: "callstack",
      id: "s-callstack",
      title: "Recursive factorial",
      steps: [
        {
          op: "push",
          frame: "fact(3)",
          note: "3 * fact(2)",
          say: "The outer call waits on a smaller subproblem.",
        },
        {
          op: "push",
          frame: "fact(2)",
          note: "2 * fact(1)",
          say: "Each call stacks a new frame on top.",
        },
        {
          op: "push",
          frame: "fact(1)",
          note: "base case",
          say: "The base case finally returns a concrete value.",
        },
        { op: "pop", ret: "1", say: "Frames unwind, each multiplying as it returns." },
        { op: "pop", ret: "2", say: "The stack collapses back down toward the first call." },
        { op: "pop", ret: "6", say: "The original call resolves to six." },
      ],
    },
    {
      kind: "cycle",
      id: "s-cycle",
      title: "The request lifecycle",
      nodes: [
        { label: "Request", icon: "📨", detail: "client sends", say: "A client fires off a request." },
        {
          label: "Route",
          icon: "🧭",
          detail: "match handler",
          say: "The router matches it to a handler.",
        },
        {
          label: "Respond",
          icon: "📤",
          detail: "send back",
          say: "The handler builds and returns a response.",
        },
        {
          label: "Log",
          icon: "📝",
          detail: "record it",
          say: "The result is logged, and the loop begins again.",
        },
      ],
    },
    {
      kind: "gauge",
      id: "s-gauge",
      title: "CPU temperature",
      min: 0,
      max: 100,
      unit: "°C",
      zones: [
        { upTo: 60, label: "safe", tone: "good" },
        { upTo: 80, label: "warm", tone: "warn" },
        { upTo: 100, label: "hot", tone: "danger" },
      ],
      readings: [
        { label: "Idle", value: 40, say: "At idle the chip sits comfortably cool." },
        { label: "Under load", value: 78, say: "Under heavy load it climbs into the warm zone." },
      ],
    },
    {
      kind: "dialogue",
      id: "s-dialogue",
      title: "Code review",
      left: { name: "Reviewer", icon: "🧐" },
      right: { name: "Author", icon: "👩‍💻" },
      messages: [
        {
          from: "left",
          text: "This function is doing three things at once.",
          say: "The reviewer flags a function with too many jobs.",
        },
        {
          from: "right",
          text: "Fair — I'll split it into smaller helpers.",
          reaction: "👍",
          say: "The author agrees to break it apart.",
        },
      ],
    },
  ],
  meta: {
    title: "Scene-kind tour: five animations in sixty seconds",
    description: "Scene-kind tour: five animations in sixty seconds. A QA fixture touring the studio's animated scene kinds so /probe can render each one by id.",
    tags: ["tour", "scene kinds", "animation", "demo", "fixture"],
    hashtags: ["#Demo", "#Animation", "#Studio"],
  },
};

/** QA/probe fixture: Scene-kind tour part two: twenty more animations */
export const DEMO_KINDS2_LONG: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Engine",
  module: "Scene kinds",
  submodule: "Tour 2",
  topic: "Scene-kind tour part two: twenty more animations",
  scenes: [
    {
      kind: "bigtext",
      id: "intro",
      narration: "Twenty more animated scene kinds, from graphs to skylines. Here is the second tour.",
      text: "Scene-kind tour, part two",
      sub: "Twenty more animations",
    },
    {
      kind: "graphwalk",
      id: "s2-graphwalk",
      title: "Dijkstra shortest path",
      nodes: [
        { id: "a", label: "A", x: 1, y: 5 },
        { id: "b", label: "B", x: 5, y: 2 },
        { id: "c", label: "C", x: 5, y: 8 },
        { id: "d", label: "D", x: 9, y: 5 },
      ],
      edges: [
        { from: "a", to: "b", weight: 4 },
        { from: "a", to: "c", weight: 1 },
        { from: "c", to: "d", weight: 5 },
        { from: "b", to: "d", weight: 1 },
      ],
      steps: [
        {
          visit: ["a"],
          frontier: ["b", "c"],
          dist: [
            { node: "a", value: "0" },
          ],
          path: [],
          say: "We start at A with distance zero.",
        },
        {
          visit: ["a", "c"],
          frontier: ["b", "d"],
          dist: [
            { node: "c", value: "1" },
          ],
          path: [],
          say: "The cheapest edge reaches C at cost one.",
        },
        {
          visit: ["a", "c", "b", "d"],
          frontier: [],
          dist: [
            { node: "d", value: "5" },
          ],
          path: ["a", "b", "d"],
          say: "The shortest route to D goes through B, total five.",
        },
      ],
    },
    {
      kind: "matrix",
      id: "s2-matrix",
      title: "Dynamic programming grid",
      rows: 3,
      cols: 4,
      rowLabels: ["", "a", "b"],
      colLabels: ["", "", "a", "c"],
      steps: [
        {
          set: [
            { r: 0, c: 0, value: "0", tone: "dim" },
          ],
          say: "The empty prefixes give a base value of zero.",
        },
        {
          set: [
            { r: 1, c: 2, value: "1", tone: "good" },
          ],
          sweep: { kind: "row", index: 1 },
          say: "A matching character bumps the count diagonally.",
        },
        {
          set: [
            { r: 2, c: 3, value: "2", tone: "accent" },
          ],
          say: "The bottom-right cell holds the final answer.",
        },
      ],
    },
    {
      kind: "threads",
      id: "s2-threads",
      title: "Two threads, one lock",
      lanes: [
        { label: "Thread A" },
        { label: "Thread B" },
      ],
      tasks: [
        { id: "a1", lane: 0, label: "read", start: 0, len: 2, kind: "run" },
        { id: "a2", lane: 0, label: "lock", start: 2, len: 3, kind: "crit" },
        { id: "b1", lane: 1, label: "wait", start: 1, len: 4, kind: "wait" },
        { id: "b2", lane: 1, label: "lock", start: 5, len: 2, kind: "crit" },
      ],
      steps: [
        {
          reveal: ["a1", "b1"],
          marker: { at: 1, label: "B blocks" },
          clash: [],
          say: "Thread B reaches the lock while A still holds it.",
        },
        {
          reveal: ["a2"],
          clash: ["a2", "b1"],
          say: "B waits in the critical section until A is done.",
        },
        {
          reveal: ["b2"],
          marker: { at: 5, label: "B proceeds" },
          clash: [],
          say: "Once A releases, B finally enters and runs.",
        },
      ],
    },
    {
      kind: "queueflow",
      id: "s2-queueflow",
      title: "Requests hit a server",
      servers: 1,
      steps: [
        { arrive: 3, serve: 1, note: "burst in", say: "Three requests arrive but only one is served." },
        {
          arrive: 2,
          serve: 1,
          note: "backlog grows",
          say: "The queue keeps growing faster than we drain it.",
        },
        {
          arrive: 0,
          serve: 2,
          note: "catching up",
          say: "When arrivals stop, the server finally catches up.",
        },
      ],
    },
    {
      kind: "cipher",
      id: "s2-cipher",
      title: "Caesar shift cipher",
      mode: "shift",
      text: "HELLO",
      shift: 3,
      steps: [
        { op: "map", say: "Each letter maps to one three places later in the alphabet." },
        { op: "input", upTo: 5, say: "We push the plaintext through, letter by letter." },
        { op: "mix", say: "The output looks scrambled, but the shift is fully reversible." },
      ],
    },
    {
      kind: "circuit",
      id: "s2-circuit",
      title: "A switch and a bulb",
      parts: [
        { id: "bat", kind: "battery", x: 1, y: 5, label: "9V" },
        { id: "sw", kind: "switch", x: 5, y: 2, label: "S1" },
        { id: "bulb", kind: "bulb", x: 9, y: 5, label: "L1" },
      ],
      wires: [
        { from: "bat", to: "sw" },
        { from: "sw", to: "bulb" },
        { from: "bulb", to: "bat" },
      ],
      steps: [
        {
          close: [],
          on: [],
          signal: false,
          highlight: ["sw"],
          say: "With the switch open, no current can flow.",
        },
        {
          close: ["sw"],
          on: ["bulb"],
          signal: true,
          highlight: [],
          say: "Close the switch and the loop completes — the bulb lights.",
        },
      ],
    },
    {
      kind: "formula",
      id: "s2-formula",
      title: "Compound interest",
      lhs: { symbol: "A", gloss: "final amount" },
      terms: [
        {
          op: "",
          symbol: "P",
          gloss: "principal",
          value: "1000",
          say: "Start with the principal you invest.",
        },
        {
          op: "×",
          symbol: "(1+r)ⁿ",
          gloss: "growth factor",
          value: "1.61",
          say: "Multiply by the growth factor over n years.",
        },
      ],
      resultValue: "1610",
      sayResult: "After the years compound, the balance grows to sixteen-ten.",
    },
    {
      kind: "curves",
      id: "s2-curves",
      title: "Supply meets demand",
      xLabel: "Quantity",
      yLabel: "Price",
      curves: [
        { label: "Supply", shape: "supply", say: "Suppliers offer more as prices rise." },
        { label: "Demand", shape: "demand", say: "Buyers want less as prices rise." },
      ],
      mark: { x: 50, label: "Equilibrium", say: "Where they cross sets the market price." },
    },
    {
      kind: "buckets",
      id: "s2-buckets",
      title: "The 50-30-20 budget",
      unit: "₹",
      buckets: [
        { label: "Needs", capacity: 50000, rate: "50%" },
        { label: "Wants", capacity: 30000, rate: "30%" },
        { label: "Savings", capacity: 20000, rate: "20%" },
      ],
      pours: [
        { amount: 50000, say: "Fill essential needs like rent and food first." },
        { amount: 30000, say: "Then the wants bucket for the fun stuff." },
        { amount: 20000, say: "Whatever is left overflows into savings." },
      ],
    },
    {
      kind: "probability",
      id: "s2-probability",
      title: "Rolling for a six",
      segments: [
        { label: "Six", weight: 1, win: true },
        { label: "Not six", weight: 5, win: false },
      ],
      spins: [
        { land: 1, say: "The first roll misses — five of six faces lose." },
        { land: 0, say: "Eventually the one winning face comes up." },
      ],
      verdict: "One in six chance each roll",
      sayVerdict: "Over many rolls it settles near one in six.",
    },
    {
      kind: "basket",
      id: "s2-basket",
      title: "Inflation over a decade",
      unit: "₹",
      items: [
        {
          label: "Milk",
          icon: "🥛",
          prices: [40, 60],
        },
        {
          label: "Petrol",
          icon: "⛽",
          prices: [70, 105],
        },
        {
          label: "Bread",
          icon: "🍞",
          prices: [25, 45],
        },
      ],
      years: [
        { when: "2014", say: "Here is what a basket of staples cost a decade ago." },
        { when: "2024", say: "The same basket costs far more today." },
      ],
    },
    {
      kind: "radar",
      id: "s2-radar",
      title: "Comparing two laptops",
      axes: ["Speed", "Battery", "Screen", "Price", "Weight"],
      entities: [
        {
          label: "UltraBook",
          values: [90, 70, 85, 40, 80],
          say: "The ultrabook wins on speed and screen.",
        },
        {
          label: "BudgetBook",
          values: [55, 90, 60, 85, 65],
          say: "The budget pick trades power for battery and value.",
        },
      ],
    },
    {
      kind: "bodymap",
      id: "s2-bodymap",
      title: "Where caffeine acts",
      path: true,
      marks: [
        {
          region: "brain",
          label: "Blocks sleep signals",
          say: "Caffeine blocks the brain's tiredness signal.",
        },
        {
          region: "heart",
          label: "Raises heart rate",
          say: "It nudges the heart to beat a little faster.",
        },
        { region: "kidneys", label: "Mild diuretic", say: "And it makes the kidneys flush more fluid." },
      ],
    },
    {
      kind: "constellation",
      id: "s2-constellation",
      title: "Drawing Orion",
      points: [
        { id: "p1", x: 2, y: 1, label: "Betelgeuse" },
        { id: "p2", x: 8, y: 1 },
        { id: "p3", x: 4, y: 5 },
        { id: "p4", x: 5, y: 5 },
        { id: "p5", x: 6, y: 5 },
        { id: "p6", x: 3, y: 9 },
        { id: "p7", x: 9, y: 9 },
      ],
      steps: [
        {
          connect: [
            { a: "p1", b: "p2" },
          ],
          say: "Two bright shoulders mark the top.",
        },
        {
          connect: [
            { a: "p3", b: "p4" },
            { a: "p4", b: "p5" },
          ],
          say: "Three stars in a row form the famous belt.",
        },
        {
          connect: [
            { a: "p6", b: "p7" },
          ],
          say: "Two more anchor the feet below.",
        },
      ],
      finale: { label: "Orion the Hunter", say: "Joined up, the stars trace the hunter." },
    },
    {
      kind: "dayclock",
      id: "s2-dayclock",
      title: "A productive day",
      face: "24h",
      pins: [
        { at: "07:00", label: "Wake and plan", icon: "☀️", say: "The day opens with a quick plan." },
        { at: "10:00", label: "Deep work", icon: "🧠", say: "Mornings are reserved for focused work." },
        { at: "18:00", label: "Wind down", icon: "🌙", say: "Evenings taper off toward rest." },
      ],
    },
    {
      kind: "storyboard",
      id: "s2-storyboard",
      title: "How a startup grows",
      panels: [
        {
          icons: ["💡"],
          caption: "An idea sparks in a garage.",
          say: "It begins with a single idea.",
        },
        {
          icons: ["🛠️", "👥"],
          caption: "A small team builds the first product.",
          say: "A tiny team ships the first version.",
        },
        {
          icons: ["📈", "🚀"],
          caption: "Users pour in and it scales.",
          say: "Growth takes off and it scales up.",
        },
      ],
    },
    {
      kind: "bracket",
      id: "s2-bracket",
      title: "Knockout tournament",
      contenders: [
        { label: "Lions", icon: "🦁" },
        { label: "Bears", icon: "🐻" },
        { label: "Hawks", icon: "🦅" },
        { label: "Sharks", icon: "🦈" },
      ],
      matches: [
        { winner: 0, say: "Lions edge out Bears in the first semifinal." },
        { winner: 0, say: "Hawks soar past Sharks in the second." },
        { winner: 1, say: "In the final, Hawks take the crown." },
      ],
    },
    {
      kind: "showdown",
      id: "s2-showdown",
      title: "SQL vs NoSQL",
      left: { label: "SQL", icon: "🗃️" },
      right: { label: "NoSQL", icon: "📦" },
      rounds: [
        {
          criterion: "Schema",
          winner: "left",
          note: "strict, consistent",
          say: "SQL wins on strict, reliable schemas.",
        },
        {
          criterion: "Scale-out",
          winner: "right",
          note: "horizontal ease",
          say: "NoSQL scales horizontally with less effort.",
        },
        {
          criterion: "Joins",
          winner: "left",
          note: "native support",
          say: "Complex joins are SQL's home turf.",
        },
      ],
      verdict: "Pick by workload, not hype",
      sayVerdict: "Neither wins outright — choose by your workload.",
    },
    {
      kind: "skyline",
      id: "s2-skyline",
      title: "A city grows up",
      eras: [
        {
          when: "1900",
          buildings: [
            { kind: "house", h: 1 },
            { kind: "mill", h: 2 },
          ],
          stat: "50k",
          say: "A century ago it was low mills and houses.",
        },
        {
          when: "1960",
          buildings: [
            { kind: "tower", h: 4 },
            { kind: "house", h: 1 },
            { kind: "tower", h: 5 },
          ],
          stat: "500k",
          say: "Mid-century, the first towers rose.",
        },
        {
          when: "2020",
          buildings: [
            { kind: "skyscraper", h: 9 },
            { kind: "skyscraper", h: 7 },
            { kind: "landmark", h: 8 },
          ],
          stat: "5M",
          say: "Today skyscrapers dominate the skyline.",
        },
      ],
    },
    {
      kind: "calendar",
      id: "s2-calendar",
      title: "India's monsoon year",
      marks: [
        {
          from: 6,
          to: 9,
          label: "SW monsoon",
          tone: "accent",
          say: "The southwest monsoon soaks most of the country.",
        },
        {
          from: 10,
          to: 11,
          label: "Retreat",
          tone: "secondary",
          say: "By autumn the rains retreat southward.",
        },
        {
          from: 3,
          to: 5,
          label: "Dry summer",
          tone: "warn",
          say: "Before that, summer is hot and dry.",
        },
      ],
    },
    {
      kind: "question",
      id: "outro",
      narration: "Across both tours, which visual best matches how you think about your subject?",
      text: "Which visual matches your subject?",
      hint: "There is a kind for almost every idea.",
    },
  ],
  meta: {
    title: "Scene-kind tour part two: twenty more animations",
    description: "Scene-kind tour part two: twenty more animations. A QA fixture touring the studio's animated scene kinds so /probe can render each one by id.",
    tags: ["tour", "scene kinds", "animation", "demo", "fixture"],
    hashtags: ["#Demo", "#Animation", "#Studio"],
  },
};

/** QA/probe fixture: Scene-kind tour part two: five more animations */
export const DEMO_KINDS2_SHORT: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Engine",
  module: "Scene kinds",
  submodule: "Tour 2",
  topic: "Scene-kind tour part two: five more animations",
  scenes: [
    {
      kind: "bigtext",
      id: "intro",
      narration: "Twenty more animated scene kinds, from graphs to skylines. Here is the second tour.",
      text: "Scene-kind tour, part two",
      sub: "Twenty more animations",
    },
    {
      kind: "graphwalk",
      id: "s2-graphwalk",
      title: "Dijkstra shortest path",
      nodes: [
        { id: "a", label: "A", x: 1, y: 5 },
        { id: "b", label: "B", x: 5, y: 2 },
        { id: "c", label: "C", x: 5, y: 8 },
        { id: "d", label: "D", x: 9, y: 5 },
      ],
      edges: [
        { from: "a", to: "b", weight: 4 },
        { from: "a", to: "c", weight: 1 },
        { from: "c", to: "d", weight: 5 },
        { from: "b", to: "d", weight: 1 },
      ],
      steps: [
        {
          visit: ["a"],
          frontier: ["b", "c"],
          dist: [
            { node: "a", value: "0" },
          ],
          path: [],
          say: "We start at A with distance zero.",
        },
        {
          visit: ["a", "c"],
          frontier: ["b", "d"],
          dist: [
            { node: "c", value: "1" },
          ],
          path: [],
          say: "The cheapest edge reaches C at cost one.",
        },
        {
          visit: ["a", "c", "b", "d"],
          frontier: [],
          dist: [
            { node: "d", value: "5" },
          ],
          path: ["a", "b", "d"],
          say: "The shortest route to D goes through B, total five.",
        },
      ],
    },
    {
      kind: "formula",
      id: "s2-formula",
      title: "Compound interest",
      lhs: { symbol: "A", gloss: "final amount" },
      terms: [
        {
          op: "",
          symbol: "P",
          gloss: "principal",
          value: "1000",
          say: "Start with the principal you invest.",
        },
        {
          op: "×",
          symbol: "(1+r)ⁿ",
          gloss: "growth factor",
          value: "1.61",
          say: "Multiply by the growth factor over n years.",
        },
      ],
      resultValue: "1610",
      sayResult: "After the years compound, the balance grows to sixteen-ten.",
    },
    {
      kind: "curves",
      id: "s2-curves",
      title: "Supply meets demand",
      xLabel: "Quantity",
      yLabel: "Price",
      curves: [
        { label: "Supply", shape: "supply", say: "Suppliers offer more as prices rise." },
        { label: "Demand", shape: "demand", say: "Buyers want less as prices rise." },
      ],
      mark: { x: 50, label: "Equilibrium", say: "Where they cross sets the market price." },
    },
    {
      kind: "radar",
      id: "s2-radar",
      title: "Comparing two laptops",
      axes: ["Speed", "Battery", "Screen", "Price", "Weight"],
      entities: [
        {
          label: "UltraBook",
          values: [90, 70, 85, 40, 80],
          say: "The ultrabook wins on speed and screen.",
        },
        {
          label: "BudgetBook",
          values: [55, 90, 60, 85, 65],
          say: "The budget pick trades power for battery and value.",
        },
      ],
    },
    {
      kind: "storyboard",
      id: "s2-storyboard",
      title: "How a startup grows",
      panels: [
        {
          icons: ["💡"],
          caption: "An idea sparks in a garage.",
          say: "It begins with a single idea.",
        },
        {
          icons: ["🛠️", "👥"],
          caption: "A small team builds the first product.",
          say: "A tiny team ships the first version.",
        },
        {
          icons: ["📈", "🚀"],
          caption: "Users pour in and it scales.",
          say: "Growth takes off and it scales up.",
        },
      ],
    },
  ],
  meta: {
    title: "Scene-kind tour part two: five more animations",
    description: "Scene-kind tour part two: five more animations. A QA fixture touring the studio's animated scene kinds so /probe can render each one by id.",
    tags: ["tour", "scene kinds", "animation", "demo", "fixture"],
    hashtags: ["#Demo", "#Animation", "#Studio"],
  },
};

/** Wave-1 QA fixture: exercises vector icons + the fixed compare border + the
 *  enriched flagship painters with realistic (stress) content. /probe?demo=6. */
export const DEMO_TERRAIN: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Terrain",
  scenes: [
    {
      kind: "terrain",
      id: "s-terrain",
      title: "A river's journey",
      profile: [9, 8, 6, 5, 3, 2, 1, 0],
      river: true,
      features: [
        { at: 0, kind: "peak", label: "Source", say: "The river is born high in the mountains." },
        { at: 4, kind: "city", label: "Riverside town", say: "Midway it feeds a town on its banks." },
        { at: 7, kind: "delta", label: "Delta", say: "It fans out into a delta at the sea." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_MOLECULE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Molecule",
  scenes: [
    {
      kind: "molecule",
      id: "mol",
      title: "Water Molecule",
      mode: "structure",
      structure: {
        atoms: [
          { el: "O", x: 5, y: 3 },
          { el: "H", x: 2, y: 7 },
          { el: "H", x: 8, y: 7 },
        ],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 0, b: 2, order: 1 },
        ],
        steps: [
          { reveal: [0], say: "Oxygen atom." },
          { reveal: [0, 1, 2], say: "Bonds with two Hydrogen atoms." },
        ],
      },
    }
  ],
  meta: DEMO_META,
};

export const DEMO_ORBIT: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Orbit",
  scenes: [
    {
      kind: "orbit",
      id: "orb",
      title: "Solar System",
      center: "Sun",
      bodies: [
        { label: "Mercury", say: "Mercury rides the innermost ring, closest to the Sun." },
        { label: "Venus", say: "Venus sits one ring out, hotter than Mercury despite that." },
        { label: "Earth", say: "Earth is the third ring, and the only one with liquid water." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_WAVE1: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Web Architecture",
  topic: "How a request flows through a web system",
  scenes: [
    {
      kind: "diagram",
      id: "arch",
      title: "A request's journey",
      nodes: [
        { id: "client", label: "Client", x: 0, y: 5, w: 2, h: 2, accent: false, icon: "client" },
        { id: "lb", label: "Load Balancer", x: 3, y: 5, w: 3, h: 2, accent: true, icon: "loadbalancer" },
        { id: "api", label: "API Server", x: 7, y: 5, w: 3, h: 2, accent: false, icon: "server" },
        { id: "cache", label: "Cache", x: 10, y: 2, w: 2, h: 2, accent: false, icon: "cache" },
        { id: "db", label: "Database", x: 10, y: 8, w: 2, h: 2, accent: false, icon: "database" },
      ],
      arrows: [
        { from: "client", to: "lb", label: "request" },
        { from: "lb", to: "api" },
        { from: "api", to: "cache", label: "read" },
        { from: "api", to: "db", label: "query" },
      ],
      steps: [
        { reveal: ["client", "lb"], highlight: ["lb"], move: [], say: "A client sends its request to the load balancer." },
        { reveal: ["api"], highlight: ["api"], move: [], say: "It routes the request to an available API server." },
        { reveal: ["cache", "db"], highlight: ["cache"], move: [], say: "The server checks the cache first, then the database." },
      ],
    },
    {
      kind: "compare",
      id: "sqlnosql",
      title: "SQL vs NoSQL",
      left: {
        title: "SQL",
        items: ["Fixed schema", "Strong consistency", "Powerful joins"],
        say: "SQL databases use a fixed schema with strong consistency.",
        icon: "database",
      },
      right: {
        title: "NoSQL",
        items: ["Flexible schema", "Horizontal scale", "Denormalized reads"],
        say: "NoSQL trades a rigid schema for horizontal scale.",
        icon: "server",
      },
      verdict: "Pick by access pattern, not by hype.",
      sayVerdict: "Choose based on how you actually read and write.",
    },
    {
      kind: "terminal",
      id: "term",
      narration: "Spin it up and watch the health check pass.",
      lines: ["$ docker compose up --build", "api  | listening on :8080", "db   | ready to accept connections", "$ curl localhost:8080/health", "ok"],
    },
    {
      kind: "tree",
      id: "memtree",
      title: "Types of Memory and Storage",
      nodes: [
        { id: "root", label: "Memory & Storage", parent: null },
        { id: "mem", label: "Memory", parent: "root", icon: "cpu" },
        { id: "stor", label: "Storage", parent: "root", icon: "harddrive" },
        { id: "ram", label: "RAM", parent: "mem" },
        { id: "rom", label: "ROM", parent: "mem" },
        { id: "ssd", label: "SSD", parent: "stor" },
        { id: "hdd", label: "HDD", parent: "stor" },
      ],
      steps: [
        { reveal: ["root"], say: "At the top sit the two families: memory and storage." },
        { reveal: ["mem", "stor"], say: "Memory is fast and temporary; storage is slower but permanent." },
        { reveal: ["ram", "rom", "ssd", "hdd"], say: "Each splits again into the types you actually buy." },
      ],
    },
    {
      kind: "bullets",
      id: "bul",
      title: "Why caching helps",
      items: [
        { text: "Cuts repeated database work", say: "It cuts repeated work against the database." },
        { text: "Serves hot data from memory", say: "Hot data is served straight from memory." },
        { text: "Absorbs traffic spikes", say: "It absorbs sudden traffic spikes." },
        { text: "Lowers tail latency", say: "And it lowers your tail latency." },
      ],
    },
    {
      kind: "chart",
      id: "cht",
      title: "Latency after caching",
      mode: "column",
      items: [
        { label: "Mon", value: 120, unit: "ms", say: "Monday we start at a heavy 120 milliseconds." },
        { label: "Tue", value: 90, unit: "ms", say: "Tuesday the cache warms up." },
        { label: "Wed", value: 62, unit: "ms", say: "Wednesday keeps falling." },
        { label: "Thu", value: 40, unit: "ms", say: "Thursday we're well under target." },
        { label: "Fri", value: 28, unit: "ms", say: "Friday it settles near 28." },
      ],
    },
    {
      kind: "steps",
      id: "stp",
      title: "How a read hits the cache",
      steps: [
        { text: "Request arrives at the server", say: "A request arrives at the server." },
        { text: "Check the cache first", say: "It checks the cache first." },
        { text: "On a miss, query the database", say: "On a miss, it queries the database." },
        { text: "Store the result, then return", say: "It stores the result, then returns it." },
      ],
    },
    {
      kind: "timeline",
      id: "tl",
      title: "Evolution of storage",
      events: [
        { when: "1956", label: "First hard disk drive", say: "The first hard disk drive arrives in 1956." },
        { when: "1991", label: "Solid-state drives", say: "Solid-state drives appear in the 1990s." },
        { when: "2007", label: "Cloud object storage", say: "Cloud object storage changes the game in 2007." },
        { when: "2020s", label: "NVMe everywhere", say: "And NVMe is everywhere today." },
      ],
    },
    {
      kind: "orbit",
      id: "orb",
      title: "The inner solar system",
      center: "Sun",
      bodies: [
        { label: "Mercury", say: "Closest to the Sun is tiny Mercury." },
        { label: "Venus", say: "Then Venus, wrapped in thick cloud." },
        { label: "Earth", say: "Our own Earth rides the third ring." },
        { label: "Mars", say: "And rusty Mars orbits farther out." },
      ],
    },
    {
      kind: "mindmap",
      id: "mm",
      title: "What makes a system scalable",
      nodes: [
        { id: "root", label: "Scalability" },
        { id: "cache", label: "Caching", parent: "root" },
        { id: "shard", label: "Sharding", parent: "root" },
        { id: "queue", label: "Queues", parent: "root" },
        { id: "lb", label: "Load balancing", parent: "root" },
        { id: "cdn", label: "CDN", parent: "cache" },
        { id: "redis", label: "Redis", parent: "cache" },
        { id: "async", label: "Async work", parent: "queue" },
      ],
      steps: [
        { reveal: ["root"], say: "At the center sits the goal: scalability." },
        { reveal: ["cache", "shard", "queue", "lb"], say: "Four big levers branch out from it." },
        { reveal: ["cdn", "redis", "async"], say: "Each lever has its own concrete tools." },
      ],
    },
    {
      kind: "iso3d",
      id: "reqflow",
      title: "A request's path in 3D",
      stages: [
        { shape: "client", label: "Client", say: "The client opens a connection and sends its request." },
        { shape: "loadbalancer", label: "Balancer", say: "A load balancer picks a healthy server." },
        { shape: "server", label: "Server", say: "The server handles the request." },
        { shape: "database", label: "Database", say: "It reads and writes the database, then replies." },
      ],
    },
    {
      kind: "geomap",
      id: "demo-geomap",
      title: "Monsoon & Major Trade Ports",
      base: "india",
      markers: [
        { id: "mumbai", label: "Mumbai Port", lon: 72.87, lat: 19.07, kind: "port" },
        { id: "chennai", label: "Chennai Port", lon: 80.27, lat: 13.08, kind: "port" },
      ],
      routes: [
        {
          id: "monsoon",
          style: "wind",
          label: "SW Monsoon",
          points: [
            { lon: 70.0, lat: 8.0 },
            { lon: 73.0, lat: 15.0 },
            { lon: 77.0, lat: 22.0 },
          ],
        },
      ],
      steps: [
        { reveal: ["mumbai", "chennai"], say: "India's coastlines host major trade ports." },
        { reveal: ["monsoon"], say: "Southwest monsoon winds carry vital moisture across the peninsula." },
      ],
    },
    {
      kind: "numberline",
      id: "demo-numberline",
      title: "Compounding Growth Hops",
      mode: "line",
      min: 0,
      max: 100,
      tickUnit: "%",
      marks: [
        { value: 10, label: "Initial", kind: "point", say: "Start with initial investment." },
        { value: 10, to: 40, label: "Doubling Hop", kind: "jump", say: "Compound interest hops the return higher." },
        { value: 40, to: 90, label: "Target Band", kind: "range", say: "Sweeps into the long-term wealth target band." },
      ],
    },
    {
      kind: "geometry",
      id: "demo-geometry",
      title: "Pythagorean Proof (a² + b² = c²)",
      points: [
        { id: "A", x: 20, y: 70, label: "A" },
        { id: "B", x: 60, y: 70, label: "B" },
        { id: "C", x: 60, y: 30, label: "C" },
      ],
      segments: [
        { a: "A", b: "B", label: "a = 4", style: "side" },
        { a: "B", b: "C", label: "b = 3", style: "side" },
        { a: "A", b: "C", label: "c = 5", style: "ray" },
      ],
      angles: [{ at: "B", from: "A", to: "C", right: true, label: "90°" }],
      fills: [{ pts: ["A", "B", "C"], label: "Area", value: "6 sq units" }],
      steps: [
        { reveal: ["A", "B", "C"], say: "Form a right-angled triangle with side lengths 3, 4, and 5." },
        { highlight: ["B"], say: "The square of the hypotenuse equals the sum of squares of both sides." },
      ],
    },
    {
      kind: "molecule",
      id: "demo-molecule",
      title: "Water Synthesis (2H₂ + O₂ ➔ 2H₂O)",
      mode: "equation",
      equation: {
        left: [
          { formula: "H₂", count: 2 },
          { formula: "O₂", count: 1 },
        ],
        right: [{ formula: "H₂O", count: 2 }],
        sayLeft: "Hydrogen and oxygen gas start on the reactant side.",
        sayReact: "Under a spark, chemical bonds break and recombine.",
        sayRight: "Forming two molecules of liquid water.",
      },
    },
    {
      kind: "layers",
      id: "demo-layers",
      title: "OSI 7 Layer Networking Stack",
      shape: "stack",
      layers: [
        { label: "Application Layer", detail: "HTTP / DNS", say: "Application layer handles high-level protocols." },
        { label: "Transport Layer", detail: "TCP / UDP", say: "Transport layer manages end-to-end connections." },
        { label: "Network Layer", detail: "IP Routing", say: "Network layer routes packets across networks." },
        { label: "Physical Layer", detail: "Ethernet / Fiber", say: "Physical layer transmits raw binary bits." },
      ],
    },
  ],
  meta: {
    title: "How a request flows through a web system — Wave-1 Demo",
    description: "A comprehensive visual walkthrough of how web systems handle requests — from load balancers and caching to geographic maps, math number lines, geometric proofs, chemical equations, and layered cross-sections. Showcasing DevStudio Wave-1 animation upgrades including five new scene kinds: geomap, numberline, geometry, molecule, and layers.",
    tags: ["system-design", "web-architecture", "animations", "geomap", "numberline", "geometry", "molecule", "layers", "demo", "wave1", "devstudio", "education"],
    hashtags: ["#SystemDesign", "#WebDev", "#Education", "#Animation"],
  },
};

/** Wave-2 QA fixture: showcases trafficflow and eventbus scene kinds. */
export const DEMO_WAVE2: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Distributed Systems",
  topic: "Load balancing and event-driven architecture",
  scenes: [
    {
      kind: "bigtext",
      id: "hook",
      narration: "How do modern systems handle millions of requests without falling over?",
      text: "One server can't handle everything.",
      sub: "That's where load balancers & event buses shine.",
    },
    {
      kind: "trafficflow",
      id: "lb-round-robin",
      title: "Round-Robin Load Balancing",
      algorithm: "round-robin",
      clients: 3,
      servers: [
        { id: "s1", label: "Server 1", load: 32, status: "healthy" },
        { id: "s2", label: "Server 2", load: 28, status: "healthy" },
        { id: "s3", label: "Server 3", load: 41, status: "healthy" },
      ],
      steps: [
        { targetServer: "s1", say: "First request routes to Server 1 — load jumps to 32%." },
        { targetServer: "s2", say: "Second request goes to Server 2. Traffic spreads evenly." },
        { targetServer: "s3", say: "Third request hits Server 3. Round-robin completes one cycle." },
        { targetServer: "s1", say: "The cycle repeats — no single server gets overloaded." },
      ],
    },
    {
      kind: "trafficflow",
      id: "lb-overload",
      title: "What Happens When Servers Overload",
      algorithm: "least-connections",
      clients: 5,
      servers: [
        { id: "s1", label: "Server 1", load: 95, status: "overloaded" },
        { id: "s2", label: "Server 2", load: 67, status: "healthy" },
        { id: "s3", label: "Server 3", load: 12, status: "healthy" },
        { id: "s4", label: "Server 4", load: 0, status: "drained" },
      ],
      steps: [
        { targetServer: "s1", say: "Server 1 is overloaded at 95% — requests queue up and latency spikes." },
        { targetServer: "s3", say: "Least-connections detects Server 3 is idle and shifts new traffic there." },
        { targetServer: "s2", say: "Server 2 absorbs medium load — the cluster self-balances." },
        { say: "Server 4 is drained — removed from rotation for maintenance without dropping requests." },
      ],
    },
    {
      kind: "eventbus",
      id: "kafka-pubsub",
      title: "Pub/Sub with Kafka",
      busName: "Kafka Cluster",
      producers: [
        { id: "web", label: "Web App" },
        { id: "mobile", label: "Mobile App" },
      ],
      topics: [
        { id: "orders", name: "orders", partitions: 3 },
        { id: "analytics", name: "analytics", partitions: 2 },
      ],
      consumers: [
        { id: "billing", label: "Billing Service", topicId: "orders" },
        { id: "inventory", label: "Inventory Service", topicId: "orders" },
        { id: "dashboard", label: "Analytics Dashboard", topicId: "analytics" },
      ],
      steps: [
        { say: "Producers publish events to Kafka topics — they don't care who reads them." },
        { publish: { producerId: "web", topicId: "orders", event: "order.placed" }, say: "Web App publishes order.placed to the orders topic." },
        { consume: { consumerId: "billing", topicId: "orders" }, say: "Billing Service reads the event — charges the customer." },
        { consume: { consumerId: "inventory", topicId: "orders" }, say: "Inventory Service reads the same event — reserves stock." },
        { publish: { producerId: "mobile", topicId: "analytics", event: "page.view" }, say: "Mobile App publishes a page.view event to analytics independently." },
        { consume: { consumerId: "dashboard", topicId: "analytics" }, say: "Dashboard consumes it — real-time metrics update instantly." },
      ],
    },
    {
      kind: "diagram",
      id: "combined-arch",
      title: "Complete Distributed Architecture",
      nodes: [
        { id: "clients", label: "Clients", x: 0, y: 5, w: 2, h: 2, accent: false, icon: "client" },
        { id: "lb", label: "Load Balancer", x: 3, y: 5, w: 3, h: 2, accent: true, icon: "loadbalancer" },
        { id: "api1", label: "API Server 1", x: 7, y: 3, w: 3, h: 2, accent: false, icon: "server" },
        { id: "api2", label: "API Server 2", x: 7, y: 7, w: 3, h: 2, accent: false, icon: "server" },
        { id: "kafka", label: "Kafka Bus", x: 11, y: 5, w: 3, h: 2, accent: true, icon: "queue" },
        { id: "db", label: "Database", x: 10, y: 1, w: 3, h: 2, accent: false, icon: "database" },
      ],
      arrows: [
        { from: "clients", to: "lb", label: "requests", style: "solid", curve: false },
        { from: "lb", to: "api1", label: "", style: "solid", curve: true },
        { from: "lb", to: "api2", label: "", style: "solid", curve: true },
        { from: "api1", to: "kafka", label: "events", style: "dashed", curve: false },
        { from: "api1", to: "db", label: "writes", style: "solid", curve: true },
      ],
      steps: [
        { reveal: ["clients", "lb"], highlight: [], move: [], say: "Traffic enters from millions of clients and hits the load balancer." },
        { reveal: ["api1", "api2"], highlight: ["lb", "api1", "api2"], move: [], say: "The load balancer distributes requests across API server replicas." },
        { reveal: ["kafka", "db"], highlight: ["kafka"], move: [], say: "API servers publish events to Kafka — decoupling producers from consumers." },
      ],
    },
    {
      kind: "question",
      id: "recap",
      text: "Round-robin vs least-connections vs consistent hashing — what's the difference?",
      narration: "Can you explain the difference between load balancing algorithms — round-robin, least connections, and consistent hashing?",
    },
  ],
  meta: {
    title: "Load Balancing & Event-Driven Architecture — Wave-2 Demo",
    description: "A visual walkthrough of how modern distributed systems handle high traffic using load balancers (round-robin, least-connections) and event-driven pub/sub messaging (Kafka). Showcasing DevStudio Wave-2 animation upgrades: trafficflow and eventbus scene kinds with live particle flows, animated load meters, and real-time pub/sub event routing.",
    tags: ["load-balancing", "kafka", "event-driven", "distributed-systems", "pub-sub", "microservices", "trafficflow", "eventbus", "demo", "wave2", "devstudio", "education"],
    hashtags: ["#SystemDesign", "#Kafka", "#DistributedSystems", "#WebDev"],
  },
};


export const DEMO_WAVE3: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Foundations",
  topic: "Wave-3 animation kinds: globe3d, dp_table_fill, sysarch",
  scenes: [
    {
      kind: "globe3d",
      id: "jets",
      sayIntro: "The winds that decide India's seasons live seven kilometres up.",
      title: "Jet streams: the upper-air winds",
      markers: [
        { id: "india", label: "India", lon: 78, lat: 22, kind: "zone" },
        { id: "sub", label: "Subtropical jet", lon: 60, lat: 30, kind: "wind" },
        { id: "polar", label: "Polar jet", lon: 40, lat: 55, kind: "wind" },
        { id: "tibet", label: "Tibetan plateau", lon: 88, lat: 32, kind: "peak" },
      ],
      arcs: [
        { fromLon: 20, fromLat: 30, toLon: 110, toLat: 28, label: "Subtropical", style: "jet" },
        { fromLon: 10, fromLat: 55, toLon: 100, toLat: 58, label: "Polar", style: "current" },
      ],
      steps: [
        { reveal: ["india"], highlight: ["india"], arcs: [], focus: { lon: 78, lat: 22 }, say: "Here is India, the region these winds govern." },
        { reveal: ["sub"], highlight: ["sub"], arcs: [0], focus: { lon: 60, lat: 30 }, say: "The subtropical jet snakes across at thirty degrees north." },
        { reveal: ["polar"], highlight: ["polar"], arcs: [1], focus: { lon: 40, lat: 55 }, say: "Far to the north, the faster polar jet circles the pole." },
        { reveal: ["tibet"], highlight: ["tibet"], arcs: [0, 1], focus: { lon: 88, lat: 32 }, say: "The Tibetan plateau splits the subtropical jet and flips the monsoon." },
      ],
    },
    {
      kind: "dp_table_fill",
      id: "lcs",
      sayIntro: "Every diff tool you use is really filling in this one table.",
      title: "Longest Common Subsequence",
      rows: 4,
      cols: 4,
      rowLabels: ["", "A", "B", "C"],
      colLabels: ["", "A", "C", "B"],
      steps: [
        { cells: [{ r: 0, c: 0, value: "0" }, { r: 0, c: 1, value: "0" }, { r: 0, c: 2, value: "0" }, { r: 0, c: 3, value: "0" }, { r: 1, c: 0, value: "0" }, { r: 2, c: 0, value: "0" }, { r: 3, c: 0, value: "0" }], deps: [], say: "The empty row and column are all zero — the base case." },
        { cells: [{ r: 1, c: 1, value: "1" }], focus: { r: 1, c: 1 }, deps: [{ r: 0, c: 0 }], say: "A matches A, so we take the diagonal and add one." },
        { cells: [{ r: 1, c: 2, value: "1" }], focus: { r: 1, c: 2 }, deps: [{ r: 1, c: 1 }, { r: 0, c: 2 }], say: "No match here, so we carry the best of top and left." },
        { cells: [{ r: 2, c: 3, value: "2" }], focus: { r: 2, c: 3 }, deps: [{ r: 1, c: 2 }], say: "B matches B — the diagonal two carries forward." },
        { cells: [{ r: 3, c: 3, value: "2" }], focus: { r: 3, c: 3 }, deps: [{ r: 2, c: 3 }, { r: 3, c: 2 }], say: "The bottom-right cell holds the answer: length two." },
      ],
    },
    {
      kind: "sysarch",
      id: "scale",
      sayIntro: "One server can't take a million users. Here's how the load spreads.",
      title: "Horizontal scaling with replication",
      tiers: [
        { id: "client", label: "Clients", kind: "client", count: 1, say: "Millions of clients send requests." },
        { id: "cdn", label: "CDN", kind: "cdn", count: 1, say: "A CDN serves cached static assets at the edge." },
        { id: "lb", label: "Load balancer", kind: "lb", count: 1, say: "The load balancer spreads traffic across replicas." },
        { id: "app", label: "App servers", kind: "app", count: 4, say: "Four identical app servers scale out horizontally." },
        { id: "db", label: "Primary DB", kind: "db", count: 3, say: "Writes hit the primary; two replicas serve reads." },
      ],
      flows: [
        { from: "client", to: "cdn", label: "GET", style: "solid" },
        { from: "cdn", to: "lb", label: "miss", style: "dashed" },
        { from: "lb", to: "app", style: "solid" },
        { from: "app", to: "db", label: "query", style: "solid" },
      ],
    },
    {
      kind: "question",
      id: "recap",
      text: "When does horizontal scaling beat vertical scaling?",
      narration: "So — when does adding more machines beat buying one bigger machine?",
    },
  ],
  meta: {
    title: "Wave-3 Animation Kinds — globe3d, dp_table_fill, sysarch",
    description: "Reference demo for the DevStudio Wave-3 scene kinds: a real 3-D rotating globe for jet streams, a 2-D dynamic-programming table for LCS, and a cloud-native tiered architecture with horizontal scaling.",
    tags: ["globe3d", "dp-table", "sysarch", "system-design", "algorithms", "geography", "demo", "wave3", "devstudio"],
    hashtags: ["#SystemDesign", "#Algorithms", "#Geography"],
  },
};

export const DEMO_WAVE3B: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Foundations",
  topic: "Wave-3b animation kinds: batch 1 of the fan-out",
  scenes: [
    {
  kind: "slidingwindow",
  id: "tcp-window",
  sayIntro: "TCP sends only as much as the receiver can hold.",
  title: "TCP Flow Control: The Sliding Window",
  metric: "in flight",
  values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  steps: [
    { left: 0, right: 3, value: "4 KB", note: "receiver advertises a window of 4", tone: "accent", say: "The receiver advertises a window of four segments." },
    { left: 2, right: 5, value: "4 KB", note: "ACKs arrive, window slides right", tone: "good", say: "As ACKs come back, the window slides forward." },
    { left: 4, right: 5, value: "2 KB", note: "buffer filling — window shrinks", tone: "warn", say: "A filling buffer shrinks the window, throttling the sender." },
    { left: 4, right: 8, value: "5 KB", note: "app drains buffer — window grows", tone: "good", say: "Once the app drains the buffer, the window opens back up." },
  ],
},
    {
  kind: "trendgraph",
  id: "output-gap",
  sayIntro: "Every economy has a speed limit — its potential GDP.",
  title: "Output Gap: Actual minus Potential GDP",
  band: true,
  series: [
    { label: "Actual GDP", values: [99, 103, 92, 108, 115], role: "accent" },
    { label: "Potential GDP", values: [100, 104, 108, 112, 116], role: "muted" }
  ],
  steps: [
    { x: "FY19", say: "In a normal year output tracks its potential closely." },
    { x: "FY20", say: "Growth stays near the trend line — a tiny positive gap." },
    { x: "FY21", say: "The shock hits: actual output collapses far below potential." },
    { x: "FY22", say: "Recovery narrows the gap as demand rebounds." },
    { x: "FY23", say: "Actual catches up to potential and the gap closes." }
  ]
},
    {
  kind: "topology",
  id: "hub-vs-switch",
  sayIntro: "A hub and a switch look identical from the outside — the difference is where your frame actually goes.",
  title: "Hub vs Switch: Who Hears Your Frame?",
  nodes: [
    { id: "dev", label: "Hub", kind: "hub", x: 6, y: 5 },
    { id: "a", label: "PC A", kind: "host", x: 1, y: 1 },
    { id: "b", label: "PC B", kind: "host", x: 11, y: 1 },
    { id: "c", label: "PC C", kind: "host", x: 1, y: 9 },
    { id: "d", label: "PC D", kind: "host", x: 11, y: 9 },
  ],
  links: [
    { from: "dev", to: "a" },
    { from: "dev", to: "b" },
    { from: "dev", to: "c" },
    { from: "dev", to: "d" },
  ],
  steps: [
    { focus: "a", emit: "one", target: "dev", say: "PC A sends a single frame addressed only to PC D." },
    { focus: "dev", emit: "all", say: "But a hub is dumb — it repeats that frame out of every port at once." },
    { focus: "dev", emit: "all", say: "So B and C read your traffic too; a real switch would have forwarded it to D alone." },
  ],
},
    {
  kind: "scroll",
  id: "art81",
  sayIntro: "The size of the Lok Sabha isn't arbitrary — one article fixes it.",
  title: "Article 81: Composition of the Lok Sabha",
  heading: "Article 81 — The House of the People",
  seal: "⚖️",
  lines: [
    { text: "The House shall consist of not more than 550 members.", label: "81(1)", say: "The ceiling is 550 elected members — no more." },
    { text: "Up to 530 chosen by direct election from the States.", label: "81(1)(a)", say: "Most seats go to the States by direct election." },
    { text: "Up to 20 members to represent the Union Territories.", label: "81(1)(b)", say: "A smaller share is reserved for the Union Territories." },
    { text: "Seats allotted so each State's ratio stays uniform.", label: "81(2)", say: "Seats track population so representation stays fair." },
    { text: "Frozen on the last census until 2026 by the 84th Amendment.", label: "84th Amdt", say: "The numbers are frozen on an old census until 2026." },
  ],
},
    {
  kind: "tactical_map",
  id: "panipat1761",
  sayIntro: "January 1761. On the plains of Panipat, two great armies face off for control of India.",
  title: "The Third Battle of Panipat",
  sideALabel: "Marathas",
  sideBLabel: "Durrani Afghans",
  terrain: "plain",
  units: [
    { id: "m-center", side: "a", label: "Bhau", x: 3, y: 6, strength: 6 },
    { id: "m-left", side: "a", label: "Left Wing", x: 3, y: 3, strength: 4 },
    { id: "m-right", side: "a", label: "Right Wing", x: 3, y: 9, strength: 4 },
    { id: "a-center", side: "b", label: "Abdali", x: 9, y: 6, strength: 6 },
    { id: "a-reserve", side: "b", label: "Reserve", x: 11, y: 6, strength: 5 },
  ],
  steps: [
    { kind: "move", moves: [{ unit: "m-center", toX: 6, toY: 6 }], say: "At dawn the Maratha centre advances hard, driving straight at the Afghan line." },
    { kind: "move", moves: [{ unit: "m-left", toX: 6, toY: 3 }, { unit: "m-right", toX: 6, toY: 9 }], say: "Both wings sweep forward to flank the enemy and pin them in place." },
    { kind: "clash", clashAt: { x: 7, y: 6 }, moves: [], say: "The lines collide in the centre — hours of brutal, close-quarters fighting." },
    { kind: "move", moves: [{ unit: "a-reserve", toX: 8, toY: 6 }], say: "Abdali commits his fresh reserve of cavalry at the decisive moment." },
    { kind: "clash", clashAt: { x: 6, y: 6 }, moves: [], say: "The exhausted Maratha centre breaks, and the counter-charge shatters their army." },
  ],
},
    {
  kind: "architecture_blueprint",
  id: "s-kalibangan",
  sayIntro: "How do you plan a city 4,500 years ago with no palace — just pure geometry?",
  title: "The Grid Roads of Kalibangan",
  parts: [
    { id: "main-st", shape: "road", x: 5, y: 0, w: 2, h: 12, label: "main street" },
    { id: "cross-st", shape: "road", x: 0, y: 5, w: 12, h: 2, label: "cross street" },
    { id: "block-nw", shape: "room", x: 0, y: 0, w: 5, h: 5 },
    { id: "block-ne", shape: "room", x: 7, y: 0, w: 5, h: 5 },
    { id: "block-sw", shape: "room", x: 0, y: 7, w: 5, h: 5 },
    { id: "block-se", shape: "room", x: 7, y: 7, w: 5, h: 5 },
    { id: "court", shape: "court", x: 1, y: 8, w: 3, h: 3, label: "ritual court" },
    { id: "gate", shape: "gate", x: 5, y: 0, w: 2, h: 2, label: "north gate" }
  ],
  steps: [
    { reveal: ["main-st", "cross-st"], highlight: ["main-st"], say: "Streets run dead straight north-south and east-west, cutting the town into a strict grid." },
    { reveal: ["block-nw", "block-ne", "block-sw", "block-se"], highlight: [], say: "Between them sit rectangular blocks, each a walled cluster of mud-brick homes." },
    { reveal: ["court"], highlight: ["court"], say: "One block opens into a courtyard lined with fire altars for ritual use." },
    { reveal: ["gate"], highlight: ["gate"], say: "A single fortified gateway controls who enters the citadel from the north." }
  ]
},
    {
  kind: "packet_delivery",
  id: "tcploss",
  sayIntro: "TCP has no delivery guarantee from the wire — it infers loss itself. Watch a segment go missing.",
  title: "How TCP Knows a Packet Got Lost",
  hops: [
    { id: "a", label: "Sender", kind: "host" },
    { id: "r", label: "Router", kind: "router" },
    { id: "b", label: "Receiver", kind: "host" },
  ],
  steps: [
    { action: "send", from: "a", to: "b", payload: "SEQ 1024", say: "The sender ships a segment; the receiver takes it and acknowledges." },
    { action: "drop", from: "a", to: "b", at: "r", payload: "SEQ 2048", say: "The next segment is dropped at a congested router — no ACK ever comes back." },
    { action: "retransmit", from: "a", to: "b", payload: "SEQ 2048", say: "The retransmission timer fires, so TCP resends the very same bytes." },
    { action: "ack", from: "b", to: "a", payload: "ACK 2049", say: "This time it arrives, the receiver ACKs, and the window slides on." },
  ],
},
    {
  kind: "codediff",
  id: "let-vs-var-333",
  sayIntro: "Here's the classic loop that logs three 3s.",
  title: "let vs var: the 3,3,3 loop bug",
  filename: "loop.js",
  lang: "js",
  lines: [
    { text: "for (var i = 0; i < 3; i++) {", kind: "del" },
    { text: "for (let i = 0; i < 3; i++) {", kind: "add" },
    { text: "  setTimeout(() => {", kind: "same" },
    { text: "    console.log(i);", kind: "same" },
    { text: "  }, 100);", kind: "same" },
    { text: "}", kind: "same" },
    { text: "// var -> logs 3, 3, 3", kind: "del" },
    { text: "// let -> logs 0, 1, 2", kind: "add" },
  ],
  steps: [
    { focus: [0, 1], say: "var shares one binding across every iteration — swap it for let." },
    { focus: [6, 7], say: "Now each pass gets its own i, so the timeouts log 0, 1, 2." },
  ],
},
    {
  kind: "parliament_arc",
  id: "s-parliament-arc",
  sayIntro: "Amending the Constitution under Article 368 needs a special majority, not a simple one.",
  title: "44th Amendment: Crossing the Two-Thirds Line",
  total: 545,
  majorityAt: 363,
  factions: [
    { label: "In favour", seats: 384, tone: "for", say: "The ayes sweep well past the two-thirds mark, so the amendment carries." },
    { label: "Against", seats: 24, tone: "against", say: "The handful of nays comes nowhere near enough to block it." },
  ],
},
    {
      kind: "question",
      id: "recap",
      text: "Sliding window, trend graph, topology, scroll, tactical map, blueprint, packet delivery, codediff, parliament arc — nine new kinds.",
      narration: "That is nine new scene kinds — which one would explain YOUR concept best?",
    },
  ],
  meta: {
    title: "Wave-3b Animation Kinds",
    description: "Reference demo for nine new DevStudio scene kinds from the Wave-3 fan-out: slidingwindow, trendgraph, topology, scroll, tactical_map, architecture_blueprint, packet_delivery, codediff, parliament_arc.",
    tags: ["wave3b", "devstudio", "demo"],
    hashtags: ["#SystemDesign", "#Algorithms"],
  },
};

export const DEMO_WAVE3C: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Foundations",
  topic: "Wave-3c animation kinds: batch 2 of the fan-out",
  scenes: [
    {
  kind: "server_rack",
  id: "phi-accrual-demo",
  sayIntro: "Picture two racks in the same network, each blade sending out a heartbeat.",
  title: "How a Failure Detector Catches a Crash",
  racks: [
    { id: "rack-a", label: "Rack A", slots: 4, active: 3, group: "us-east-1" },
    { id: "rack-b", label: "Rack B", slots: 4, active: 2, group: "us-east-1" },
  ],
  steps: [
    { op: "lead", rack: "rack-a", slot: 0, note: "leader", say: "Blade 0 in Rack A is elected leader, pulsing a heartbeat every second." },
    { op: "probe", rack: "rack-a", slot: 0, note: "sampling...", say: "A monitor on Rack B keeps sampling how long each heartbeat takes to arrive." },
    { op: "crash", rack: "rack-a", slot: 0, note: "no heartbeat", say: "The leader's blade crashes -- no packet arrives, and the gap since the last one keeps growing." },
    { op: "failover", rack: "rack-a", slot: 0, to: { rack: "rack-b", slot: 0 }, note: "new leader", say: "Once the suspicion score crosses its threshold, leadership fails over to a healthy blade in Rack B." },
  ],
},
    {
      kind: "jigsaw_puzzle",
      id: "oauth-oidc",
      sayIntro: "OAuth and OpenID Connect get used interchangeably — but they're two different halves of one login.",
      title: "OAuth vs OIDC: Two Halves of Login",
      pieces: [
        { label: "OAuth 2.0", icon: "shield", sub: "authorization", fits: true, say: "OAuth 2.0 hands an app a scoped access token — proof of what it's ALLOWED to do on your behalf." },
        { label: "OpenID Connect", icon: "shield", sub: "authentication", fits: true, say: "OpenID Connect layers an ID token on top — proof of WHO you are. Together they cover login end to end." },
        { label: "Access token as login", icon: "🔑", sub: "no identity claim", fits: false, say: "Treat a bare OAuth access token as proof of identity and the pieces never lock — that's the classic OAuth-as-login bug." },
      ],
    },
    {
  kind: "domino_cascade",
  id: "wage-price-spiral",
  sayIntro: "One price shock can spiral into the whole economy chasing itself.",
  title: "The Wage-Price Spiral",
  dominoes: [
    { label: "Prices Jump", icon: "📈", say: "Prices rise sharply, say from an oil shock or a supply crunch." },
    { label: "Workers Demand Raises", icon: "👷", say: "Workers can't afford the same basket anymore, so they demand higher wages." },
    { label: "Wages Climb", icon: "💰", say: "Employers relent and wages climb to keep staff from quitting." },
    { label: "Costs Rise Again", icon: "🏭", say: "Higher wages raise the cost of producing everything else in the economy." },
    { label: "Prices Jump Again", icon: "📈", say: "Businesses pass those costs on as even higher prices, and the spiral repeats." },
  ],
},
    {
  kind: "sheet_music",
  id: "sitar-vs-sarod-1",
  sayIntro: "Two of India's great plucked strings, sitar and sarod, can play the very same raga very differently.",
  title: "Sitar vs Sarod: Same Raga, Different Voice",
  keyLabel: "Raga Yaman",
  legend: [
    { voice: "a", label: "Sitar" },
    { voice: "b", label: "Sarod" },
  ],
  tala: { beats: 16, sam: 1, label: "Teentaal" },
  steps: [
    {
      notes: [
        { pos: -2, dur: "quarter", label: "Sa", voice: "a", slideToNext: true },
        { pos: 0, dur: "quarter", label: "Re", voice: "a", slideToNext: false },
      ],
      matra: 1,
      say: "The sitar's movable frets let a note bend and slide into the next — that's meend.",
    },
    {
      notes: [
        { pos: -2, dur: "eighth", label: "Sa", voice: "b", slideToNext: false },
        { pos: 1, dur: "eighth", label: "Ga", voice: "b", slideToNext: false },
        { pos: 3, dur: "quarter", label: "Pa", voice: "b", slideToNext: false },
      ],
      matra: 5,
      say: "The sarod's metal fingerboard gives every note a sharper, more percussive attack instead.",
    },
    {
      notes: [
        { pos: -4, dur: "half", label: "Sa", voice: "a", slideToNext: true },
        { pos: -4, dur: "eighth", label: "Sa", voice: "b", slideToNext: false },
        { pos: -1, dur: "quarter", label: "Ga", voice: "a", slideToNext: false },
      ],
      matra: 9,
      say: "Same raga, same swara — but you can hear the difference in how each string speaks.",
    },
  ],
},
    {
  kind: "canvas_reveal",
  id: "warli",
  sayIntro: "Warli art almost always looks the same — white figures scratched onto a deep red wall. That's not an accident.",
  title: "Why Warli Art Is Always White on Red",
  artLabel: "Warli painting, Maharashtra",
  canvasColor: "#8a3323",
  regions: [
    { id: "ground", x: 1, y: 1, w: 4, h: 3, label: "Mud-wall wash", color: "#96432c", shape: "rect" },
    { id: "dancers", x: 3, y: 5, w: 5, h: 6, label: "Circle of dancers", color: "#f4ecd8", shape: "triangle" },
    { id: "tree", x: 8, y: 2, w: 3, h: 6, label: "Sacred tree", color: "#f4ecd8", shape: "blob" },
  ],
  swatches: [
    { hex: "#8a3323", label: "Geru red" },
    { hex: "#f4ecd8", label: "Tandul white" },
    { hex: "#2b211b", label: "Rice-husk black" },
  ],
  steps: [
    { focus: "ground", swatchIndex: 0, say: "The base is geru — sun-baked mud and cow-dung wash that every Warli home's wall is plastered with." },
    { focus: "dancers", swatchIndex: 1, say: "Dancers are painted in tandul, a rice-paste white ground fine enough for a single bamboo-twig stroke." },
    { focus: "tree", say: "The same white traces the sacred tree at the centre of every ritual scene." },
    { swatchIndex: 2, say: "A last whisper of black rice-husk charcoal outlines every figure so the white never smudges into the red." },
  ],
},
    {
  kind: "scalecompare",
  id: "falls-height",
  sayIntro: "Niagara Falls is the famous one, but is it actually the biggest waterfall?",
  title: "Victoria Falls vs Niagara Falls: Which Is Bigger?",
  axis: "height",
  scale: "linear",
  unit: "m",
  items: [
    { id: "niagara", label: "Niagara Falls", value: 51, icon: "🌊", say: "Niagara Falls drops about 51 meters — roughly the height of a 17-story building." },
    { id: "victoria", label: "Victoria Falls", value: 108, icon: "💦", say: "Victoria Falls plunges 108 meters, more than double Niagara's drop in a single unbroken curtain." }
  ],
  verdict: "Victoria Falls is over 2x taller than Niagara.",
  sayVerdict: "So by height, Victoria Falls wins by more than double — Niagara just moves far more water."
},
    {
  kind: "fluidflow",
  id: "godavari-flow",
  sayIntro: "The Godavari begins as a trickle in the Western Ghats near Nashik.",
  title: "Godavari: The Dakshin Ganga",
  sources: [
    { id: "trimbak", label: "Trimbakeshwar", x: 2, y: 2, flowDeg: 120, icon: "🏔️" },
    { id: "manjra", label: "Manjra", x: 3, y: 4, flowDeg: 100, icon: "💧" },
    { id: "pranhita", label: "Pranhita", x: 5, y: 3, flowDeg: 140, icon: "💧" },
  ],
  sinks: [
    { id: "bay", label: "Bay of Bengal", x: 11, y: 11 },
  ],
  steps: [
    { reveal: ["trimbak"], highlight: ["trimbak"], revealSinks: [], say: "It rises at Trimbakeshwar, barely a stream at first." },
    { reveal: ["manjra"], highlight: ["manjra"], revealSinks: [], say: "The Manjra joins from the Deccan plateau, swelling the current." },
    { reveal: ["pranhita"], highlight: ["pranhita"], revealSinks: ["bay"], say: "The Pranhita adds its flow before the river empties into the Bay of Bengal, earning its name Dakshin Ganga." },
  ],
},
    {
  kind: "ecosystem_web",
  id: "dugong-web",
  sayIntro: "An ecosystem isn't a straight line — it's a web, and pulling one thread moves the whole thing.",
  title: "The Dugong's Seagrass Web",
  nodes: [
    { id: "seagrass", label: "Seagrass meadow", kind: "producer", icon: "🌱" },
    { id: "dugong", label: "Dugong", kind: "consumer", icon: "🐋" },
    { id: "trawling", label: "Bottom trawling", kind: "factor", icon: "🚤" },
  ],
  links: [
    { id: "graze", from: "seagrass", to: "dugong", type: "eats", label: "grazes" },
    { id: "uproot", from: "trawling", to: "seagrass", type: "affects", label: "uproots" },
    { id: "entangle", from: "trawling", to: "dugong", type: "affects", label: "entangles" },
  ],
  steps: [
    { reveal: ["graze"], say: "In the Gulf of Mannar, dugongs graze almost entirely on seagrass meadows." },
    { reveal: ["uproot"], say: "But bottom trawling drags nets across the seabed, uprooting the very meadows they depend on." },
    { reveal: ["entangle"], say: "The same boat traffic entangles dugongs directly — squeezing them from both ends of the web." },
  ],
},
    {
  kind: "turing_tape",
  id: "xplusone-cpu",
  title: "x = x + 1: Three CPU Instructions",
  sayIntro: "x = x + 1 looks like one line of code, but the CPU actually runs three separate instructions.",
  initial: ["5", "·", "·"],
  headStart: 0,
  blank: "·",
  showIndex: false,
  steps: [
    { write: "5", move: "R", state: "LOAD x", say: "LOAD reads x from memory into a register: the value 5." },
    { write: "6", move: "R", state: "ADD 1", say: "ADD adds 1 to that register value, making it 6." },
    { write: "6", move: "none", state: "STORE x", say: "STORE writes the new value 6 back into memory as x." },
  ],
},
    {
  kind: "grid_flood",
  id: "islands",
  sayIntro: "Think of the grid as a graph: every land cell is a node connected to its four neighbors.",
  title: "Number of Islands: Flood Fill by BFS",
  mode: "bfs",
  rows: 4,
  cols: 4,
  walls: [
    { r: 0, c: 2 }, { r: 0, c: 3 },
    { r: 1, c: 1 }, { r: 1, c: 2 },
    { r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 },
    { r: 3, c: 0 }, { r: 3, c: 2 }, { r: 3, c: 3 },
  ],
  cells: [
    { r: 0, c: 0, value: "1" }, { r: 0, c: 1, value: "1" },
    { r: 1, c: 0, value: "1" }, { r: 1, c: 3, value: "1" },
    { r: 2, c: 3, value: "1" }, { r: 3, c: 1, value: "1" },
  ],
  groups: [{ label: "Island 1" }, { label: "Island 2" }, { label: "Island 3" }],
  starts: [
    { r: 0, c: 0, group: 0, label: "1" },
    { r: 1, c: 3, group: 1, label: "2" },
  ],
  steps: [
    { visit: [{ r: 0, c: 1, group: 0, from: { r: 0, c: 0 } }, { r: 1, c: 0, group: 0, from: { r: 0, c: 0 } }], say: "From that first land cell the flood spreads to every connected neighbor, painting one whole island." },
    { visit: [{ r: 2, c: 3, group: 1, from: { r: 1, c: 3 } }], say: "A second untouched land cell kicks off a brand new flood — island number two." },
    { visit: [{ r: 3, c: 1, group: 2 }], say: "The scan finds one more lone land cell with no flooded neighbor — island number three, all by itself." },
  ],
},
    {
      kind: "question",
      id: "recap",
      text: "Server rack, jigsaw puzzle, domino cascade, sheet music, canvas reveal, scale compare, fluid flow, ecosystem web, Turing tape, grid flood.",
      narration: "Ten more scene kinds down -- which one would you reach for first?",
    },
  ],
  meta: {
    title: "Wave-3c Animation Kinds",
    description: "Reference demo for ten more new DevStudio scene kinds from the Wave-3 fan-out: server_rack, jigsaw_puzzle, domino_cascade, sheet_music, canvas_reveal, scalecompare, fluidflow, ecosystem_web, turing_tape, grid_flood.",
    tags: ["wave3c", "devstudio", "demo"],
    hashtags: ["#SystemDesign", "#Algorithms"],
  },
};

export const DEMO_WAVE3D: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Foundations",
  topic: "Wave-3d animation kinds: batch 3 of the fan-out",
  scenes: [
    {
  kind: "hash_ring",
  id: "hashring-demo",
  sayIntro: "Consistent hashing puts both servers and keys on one giant clock face.",
  title: "Adding One Server Without Reshuffling Everything",
  nodes: [
    { id: "nodeA", label: "Server A", angle: 20, tokens: 1 },
    { id: "nodeB", label: "Server B", angle: 150, tokens: 1 },
    { id: "nodeC", label: "Server C", angle: 260, tokens: 1 },
    { id: "nodeD", label: "Server D", angle: 100, tokens: 1 },
  ],
  keys: [
    { id: "key1", label: "user:42", angle: 60 },
    { id: "key2", label: "user:91", angle: 190 },
    { id: "key3", label: "user:7", angle: 310 },
  ],
  steps: [
    { action: "addNode", nodeId: "nodeA", say: "Server A claims the first slice of the ring." },
    { action: "addNode", nodeId: "nodeB", say: "Server B joins further around the clock face." },
    { action: "addNode", nodeId: "nodeC", say: "Server C fills in the rest of the circle." },
    { action: "placeKey", keyId: "key1", say: "Key user:42 hashes here, then walks clockwise to Server B." },
    { action: "placeKey", keyId: "key2", say: "Key user:91 lands just before Server C." },
    { action: "placeKey", keyId: "key3", say: "Key user:7 wraps around past midnight to Server A." },
    { action: "addNode", nodeId: "nodeD", say: "Adding Server D only steals the keys between it and its old clockwise neighbour — everyone else stays put." },
  ],
},
    {
  kind: "recursion_tree",
  id: "recursion-demo-1",
  sayIntro: "Partition \"aab\" so every piece reads the same forwards and backwards — we backtrack over every possible cut.",
  title: "Palindrome Partitioning: Backtracking Over Cuts",
  nodes: [
    { id: "s0", label: "aab", parent: null },
    { id: "s1", label: "a · ab", parent: "s0" },
    { id: "s1a", label: "a · a · b", parent: "s1" },
    { id: "s1b", label: "a · ab", parent: "s1" },
    { id: "s2", label: "aa · b", parent: "s0" },
    { id: "s2a", label: "aa · b", parent: "s2" },
    { id: "s3", label: "aab", parent: "s0" },
  ],
  steps: [
    { expand: ["s0"], prune: [], accept: [], backtrack: [], say: "Call solve(\"aab\") — nothing chosen yet, the whole string remains." },
    { expand: ["s1"], prune: [], accept: [], backtrack: [], say: "First choice: cut after the leading \"a\" — it's a palindrome, so recurse on \"ab\"." },
    { expand: ["s1a"], prune: [], accept: ["s1a"], backtrack: [], say: "Inside that call, cut \"ab\" into \"a\" and \"b\" — both palindromes: a complete valid partition." },
    { expand: [], prune: [], accept: [], backtrack: ["s1a"], say: "That call returns a solution, so it pops off the stack and we try the other split of \"ab\"." },
    { expand: ["s1b"], prune: ["s1b"], accept: [], backtrack: [], note: "\"ab\" isn't a palindrome", say: "Try keeping \"ab\" as one whole piece instead — it isn't a palindrome, so this branch is pruned immediately." },
    { expand: [], prune: [], accept: [], backtrack: ["s1"], say: "Both options for \"ab\" are exhausted, so that call also returns — back up to the root's second choice." },
    { expand: ["s2"], prune: [], accept: [], backtrack: [], say: "Second choice at the root: cut after \"aa\" — also a palindrome, recurse on \"b\"." },
    { expand: ["s2a"], prune: [], accept: ["s2a"], backtrack: [], say: "\"b\" alone is a palindrome too — another complete valid partition found." },
    { expand: [], prune: [], accept: [], backtrack: ["s2a", "s2"], say: "That call returns as well, and pops all the way back up to the root." },
    { expand: ["s3"], prune: ["s3"], accept: [], backtrack: [], note: "\"aab\" isn't a palindrome", say: "Last choice: keep \"aab\" whole — it isn't a palindrome, so this branch is pruned on the spot." },
    { expand: [], prune: [], accept: [], backtrack: ["s0"], say: "Every choice from the root is exhausted, so the very first call unwinds — leaving two valid partitions found." },
  ],
},
    {
  kind: "token_exchange",
  id: "token-exchange-jwt-demo",
  sayIntro: "Every request needs proof of identity — that proof travels as a signed, tamper-proof token.",
  title: "How a JWT Proves Who You Are",
  tokenLabel: "JWT",
  actors: [
    { id: "client", label: "Client", role: "client" },
    { id: "gateway", label: "API Gateway", role: "gateway" },
    { id: "auth", label: "Auth Server", role: "auth" },
  ],
  steps: [
    { from: "auth", to: "client", action: "issue", valid: true, note: "exp: 15m", say: "The auth server signs a JWT: header, payload, and a signature glued together." },
    { from: "client", to: "gateway", action: "present", valid: true, note: "Authorization: Bearer", say: "The client presents that same token on every request — no server-side session lookup needed." },
    { from: "gateway", to: "gateway", action: "verify", valid: true, note: "signature OK", say: "The gateway checks the signature locally in microseconds, using the auth server's public key." },
    { from: "gateway", to: "gateway", action: "expire", valid: false, note: "exp passed", say: "Fifteen minutes later that same token is worthless — expired by design, forcing a refresh." },
  ],
},
    {
  kind: "coin_stack",
  id: "s-coinstack",
  title: "Zero-Based Budgeting",
  unit: "₹",
  sayIntro: "Zero-based budgeting means every rupee of income gets assigned a job — nothing sits idle.",
  stacks: [
    { id: "income", label: "Income", coins: 60000, tone: "good", icon: "💰" },
    { id: "rent", label: "Rent", coins: 0 },
    { id: "food", label: "Food", coins: 0 },
    { id: "savings", label: "Savings", coins: 0, tone: "good" },
  ],
  steps: [
    { from: "income", to: "rent", amount: 18000, label: "Rent", say: "First, ₹18,000 is assigned to rent — job number one." },
    { from: "income", to: "food", amount: 12000, label: "Food", say: "Next, ₹12,000 is justified for groceries and food." },
    { from: "income", to: "savings", amount: 30000, label: "Savings", say: "The remaining ₹30,000 goes to savings, leaving Income at zero." },
  ],
},
    {
  kind: "btree_index",
  id: "btree-lookup-1",
  sayIntro: "Every B-Tree lookup starts at the root and narrows the key range level by level until it lands on a leaf.",
  title: "Tracing a Lookup Through a B+Tree",
  nodes: [
    { id: "root", parent: null, keys: ["50"], leaf: false },
    { id: "nodeA", parent: "root", keys: ["20", "35"], leaf: false },
    { id: "nodeB", parent: "root", keys: ["70", "85"], leaf: false },
    { id: "leaf1", parent: "nodeA", keys: ["10", "15"], leaf: true },
    { id: "leaf2", parent: "nodeA", keys: ["20", "28"], leaf: true },
    { id: "leaf3", parent: "nodeA", keys: ["35", "40"], leaf: true },
    { id: "leaf4", parent: "nodeB", keys: ["50", "60"], leaf: true },
    { id: "leaf5", parent: "nodeB", keys: ["70", "78"], leaf: true },
    { id: "leaf6", parent: "nodeB", keys: ["85", "92"], leaf: true },
  ],
  leafChain: ["leaf1", "leaf2", "leaf3", "leaf4", "leaf5", "leaf6"],
  steps: [
    { mode: "descend", target: "nodeA", keyIndex: 0, scanCount: 1, say: "Searching for 24: at the root, 24 is less than 50, so we branch left into node A." },
    { mode: "descend", target: "leaf2", keyIndex: 0, scanCount: 1, say: "Node A shows 20 is at most key and key is less than 35, so we descend one more level into leaf 2 — found it." },
    { mode: "scan", target: "leaf2", keyIndex: 0, scanCount: 3, say: "A range scan for 20 to 60 skips repeating the descent — it just rides the leaf chain from leaf 2 through leaf 4." },
  ],
},
    {
  kind: "lsm_compaction",
  id: "lsm-write-path-1",
  sayIntro: "In Cassandra and RocksDB, every write hits memory first — the memtable — before anything touches disk.",
  title: "LSM Tree: Memtable, Flush & Compaction",
  levelCount: 2,
  memtableCapacity: 4,
  steps: [
    { op: "write", key: "user:12", tombstone: false, fileIds: [], keys: [], droppedTombstones: 0, say: "A write for user:12 is appended straight into the in-memory memtable." },
    { op: "write", key: "user:47", tombstone: false, fileIds: [], keys: [], droppedTombstones: 0, say: "More writes pile in — a memtable insert is just an in-memory append, no disk I/O." },
    { op: "write", key: "user:99", tombstone: true, fileIds: [], keys: [], droppedTombstones: 0, say: "A delete isn't erased in place — it's written as a tombstone, a marker that the key is gone." },
    { op: "flush", toLevel: 0, resultId: "L0-A", tombstone: false, fileIds: [], keys: [], droppedTombstones: 0, say: "Once the memtable fills up, it flushes as one immutable SSTable file into L0." },
    { op: "write", key: "user:81", tombstone: false, fileIds: [], keys: [], droppedTombstones: 0, say: "Writes resume into a fresh memtable while the flushed file sits untouched on disk." },
    { op: "flush", toLevel: 0, resultId: "L0-B", tombstone: false, fileIds: [], keys: [], droppedTombstones: 0, say: "A second flush drops another SSTable into L0 — L0 files are allowed to overlap in key range." },
    { op: "compact", fromLevel: 0, toLevel: 1, fileIds: ["L0-A", "L0-B"], resultId: "L1-A", keys: ["user:12", "user:47", "user:81"], droppedTombstones: 1, tombstone: false, say: "Background compaction merges the overlapping L0 files into one sorted L1 file, discarding the tombstone for good." },
  ],
},
    {
  kind: "vdom_diff",
  id: "vdom-demo",
  sayIntro: "React keeps a virtual copy of the DOM in memory, then diffs it before touching the real page.",
  title: "The Virtual DOM: Why React Diffs Objects",
  nodes: [
    { id: "app", label: "App", parent: null, icon: "gear" },
    { id: "header", label: "Header", parent: "app" },
    { id: "list", label: "TodoList", parent: "app" },
    { id: "item1", label: "Item: Milk", parent: "list" },
    { id: "item2", label: "Item: Eggs", parent: "list" },
    { id: "item3", label: "Item: Bread", parent: "list" },
    { id: "item4", label: "Item: Butter", parent: "list" },
  ],
  steps: [
    {
      render: ["app", "header", "list", "item1", "item2", "item3"],
      add: [],
      remove: [],
      update: [],
      say: "The first render builds the whole tree as plain JavaScript objects, not real DOM nodes yet.",
    },
    {
      render: [],
      add: ["item4"],
      remove: ["item2"],
      update: ["item3"],
      say: "State changes: Eggs is gone, Butter is new, and Bread's label changed — React diffs old tree against new.",
    },
    {
      render: [],
      add: [],
      remove: [],
      update: [],
      drill: { from: "app", to: "item1" },
      say: "Only those three real DOM nodes get touched, because the diff found every other node identical.",
    },
  ],
},
    {
  kind: "flamegraph",
  id: "req-waterfall",
  sayIntro: "Watch what happens when every API call waits for the last one to land.",
  title: "Sequential Fetches Create a Waterfall",
  mode: "waterfall",
  totalMs: 700,
  unitLabel: "ms",
  warnAtMs: 200,
  bars: [
    { id: "user", label: "GET /user", depth: 0, startMs: 0, durMs: 180, tone: "normal", say: "First we fetch the logged-in user — one hundred eighty milliseconds, and nothing else can start yet." },
    { id: "posts", label: "GET /user/posts", depth: 1, startMs: 180, durMs: 240, tone: "warn", say: "Posts can't start until the user request finishes, even though it never needed that result." },
    { id: "comments", label: "GET /posts/comments", depth: 2, startMs: 420, durMs: 260, tone: "warn", say: "Comments wait on posts the same way — three requests chained end to end, six hundred eighty milliseconds total." },
  ],
},
    {
  kind: "event_loop",
  id: "s-eventloop",
  sayIntro: "Python's asyncio runs everything on a single thread — here's how it juggles three tasks at once.",
  title: "The asyncio event loop",
  loopLabel: "event loop",
  tasks: [
    { id: "fetchUser", label: "fetch_user()", icon: "🌐" },
    { id: "fetchOrders", label: "fetch_orders()", icon: "📦" },
    { id: "sendEmail", label: "send_email()", icon: "✉️" },
  ],
  steps: [
    { taskId: "fetchUser", action: "run", blocking: false, detail: "running", say: "The loop hands control to fetch_user first." },
    { taskId: "fetchUser", action: "await", blocking: false, detail: "awaiting response", say: "It hits an `await` on the network call and suspends — control returns to the loop." },
    { taskId: "fetchOrders", action: "run", blocking: false, detail: "running", say: "Rather than sit idle, the loop immediately picks up fetch_orders instead." },
    { taskId: "fetchOrders", action: "await", blocking: false, detail: "awaiting response", say: "fetch_orders awaits its own request and suspends too — two tasks now parked." },
    { taskId: "sendEmail", action: "run", blocking: true, detail: "time.sleep(1) — blocking!", say: "But send_email calls time.sleep instead of asyncio.sleep — a blocking call, not a suspend." },
    { taskId: "sendEmail", action: "run", blocking: true, detail: "loop frozen for 1s", say: "Now nothing else can run at all: the one thread is stuck, so every other task freezes with it." },
    { taskId: "fetchUser", action: "resume", blocking: false, detail: "I/O ready", say: "Only once that second passes can fetch_user's finished response finally resume." },
    { taskId: "fetchUser", action: "done", blocking: false, detail: "completed", say: "fetch_user finishes and hands its result back to whoever awaited it." },
  ],
},
    {
      kind: "question",
      id: "recap",
      text: "Hash ring, recursion tree, token exchange, coin stack, B-tree index, LSM compaction, VDOM diff, flamegraph, event loop.",
      narration: "Nine more scene kinds -- which one maps to a concept you teach?",
    },
  ],
  meta: {
    title: "Wave-3d Animation Kinds",
    description: "Reference demo for nine more new DevStudio scene kinds from the Wave-3 fan-out: hash_ring, recursion_tree, token_exchange, coin_stack, btree_index, lsm_compaction, vdom_diff, flamegraph, event_loop.",
    tags: ["wave3d", "devstudio", "demo"],
    hashtags: ["#SystemDesign", "#Algorithms"],
  },
};

export const DEMO_TIMELINE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Timeline",
  scenes: [
    {
      kind: "timeline",
      id: "s1",
      title: "Project Evolution",
      orient: "vertical",
      events: [
        { when: "2021", label: "Initial idea and prototyping", say: "Twenty twenty-one is just an idea and a prototype." },
        { when: "2022", label: "Seed funding and core team", say: "Seed money lands and the core team comes together." },
        { when: "2023", label: "Beta launch, 10k users", say: "The beta ships and ten thousand people actually use it." },
        { when: "2024", label: "Global expansion", say: "By twenty twenty-four it goes global." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_SANKEY: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Sankey",
  scenes: [
    {
      kind: "sankey",
      id: "s1",
      title: "Traffic Sources",
      source: { label: "Total Visits", total: 10000 },
      branches: [
        { label: "Organic Search", value: 5000, say: "Half of all visits arrive from organic search." },
        { label: "Direct", value: 2500, say: "A quarter type the address in directly." },
        { label: "Social Media", value: 1500, say: "Social media brings fifteen percent." },
        { label: "Referral", value: 1000, say: "The last tenth comes from referrals." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_GAUGE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Gauge",
  scenes: [
    {
      kind: "gauge",
      id: "s-gauge",
      title: "CPU temperature",
      min: 0,
      max: 100,
      unit: "°C",
      zones: [
        { upTo: 60, label: "safe", tone: "good" },
        { upTo: 80, label: "warm", tone: "warn" },
        { upTo: 100, label: "hot", tone: "danger" },
      ],
      readings: [
        { label: "Idle", value: 40, say: "At idle the chip sits comfortably cool." },
        { label: "Under load", value: 78, say: "Under heavy load it climbs into the warm zone." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_PICTOGRAM: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Pictogram",
  scenes: [
    {
      kind: "pictogram",
      id: "s-pictogram",
      title: "Who has internet?",
      mode: "grid",
      total: 100,
      groups: [
        { label: "Online", count: 65, say: "About sixty-five in a hundred people are online." },
        { label: "Offline", count: 35, say: "The remaining third are still unconnected." },
      ],
    }
  ],
  meta: DEMO_META,
};

export const DEMO_TRAFFICFLOW: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Trafficflow",
  scenes: [
    {
      kind: "trafficflow",
      id: "tf1",
      title: "Load Balancing",
      algorithm: "round-robin",
      clients: 2,
      servers: [
        { id: "s1", label: "Server A", load: 20 },
        { id: "s2", label: "Server B", load: 30 }
      ],
      steps: [
        { targetServer: "s1", say: "First request goes to Server A" },
        { targetServer: "s2", say: "Second request goes to Server B" }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_EVENTBUS: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Eventbus",
  scenes: [
    {
      kind: "eventbus",
      id: "eb1",
      title: "Event Driven Architecture",
      busName: "Kafka",
      producers: [
        { id: "p1", label: "App" }
      ],
      topics: [
        { id: "t1", name: "events" }
      ],
      consumers: [
        { id: "c1", label: "Logger", topicId: "t1" },
        { id: "c2", label: "Analytics", topicId: "t1" }
      ],
      steps: [
        { publish: { producerId: "p1", topicId: "t1", event: "user_signup" }, say: "App publishes an event." },
        { consume: { consumerId: "c1", topicId: "t1" }, say: "Logger consumes it." },
        { consume: { consumerId: "c2", topicId: "t1" }, say: "Analytics also consumes it." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_CODE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Code",
  scenes: [
    {
      kind: "code",
      id: "cd",
      lang: "js",
      title: "hello.js",
      code: "function hello() {\n  console.log('hello world');\n}",
      segments: [
        { fromLine: 1, toLine: 3, say: "Here is a simple function." },
      ],
      focusLines: [],
      expectedOutput: "",
    }
  ],
  meta: DEMO_META,
};

export const DEMO_TRACE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Trace",
  scenes: [
    {
      kind: "trace",
      id: "trc",
      title: "Two-pointer",
      code: [
        "function reverse(a) {",
        "  let i = 0, j = a.length-1;",
        "  while (i < j) {",
        "    swap(a, i, j);",
        "    i++; j--;",
        "  }",
        "}"
      ],
      cells: ["3", "1", "4", "1", "5"],
      steps: [
        {
          line: 2,
          pointers: [
            { label: "i", index: 0 },
            { label: "j", index: 4 },
          ],
          mark: [],
          say: "Two pointers start at the ends of the array.",
        }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_GEOMAP: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Geomap",
  scenes: [
    {
      kind: "geomap",
      id: "geo",
      title: "Ancient Cities",
      base: "india",
      markers: [
        { id: "m1", label: "Delhi", lon: 77.2, lat: 28.6, kind: "capital" },
        { id: "m2", label: "Mumbai", lon: 72.8, lat: 19.0, kind: "city" },
      ],
      routes: [
        { id: "r1", points: [{lon: 77.2, lat: 28.6}, {lon: 72.8, lat: 19.0}], style: "route" }
      ],
      steps: [
        { reveal: ["m1", "r1", "m2"], say: "A route from Delhi to Mumbai." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_LAYERS: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Layers",
  scenes: [
    {
      kind: "layers",
      id: "lyr",
      title: "Network Stack",
      shape: "stack",
      layers: [
        { label: "Application", detail: "HTTP/SMTP", say: "Layer 7 handles the app." },
        { label: "Transport", detail: "TCP/UDP", say: "Layer 4 handles transport." },
        { label: "Network", detail: "IP", say: "Layer 3 routes packets." },
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BRACKET: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Bracket",
  scenes: [
    {
      kind: "bracket",
      id: "brk",
      title: "Tournament",
      contenders: [
        { label: "A", icon: "A" },
        { label: "B", icon: "B" },
        { label: "C", icon: "C" },
        { label: "D", icon: "D" }
      ],
      matches: [
        { winner: 0, say: "A beats B in the first semifinal." },
        { winner: 1, say: "D takes the second semifinal from C." },
        { winner: 0, say: "And A wins the final." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_SHOWDOWN: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Showdown",
  scenes: [
    {
      kind: "showdown",
      id: "shw",
      title: "SQL vs NoSQL",
      left: { label: "SQL", icon: "Q" },
      right: { label: "NoSQL", icon: "N" },
      rounds: [
        { criterion: "Scale", winner: "right", say: "On horizontal scale, NoSQL wins outright." },
        { criterion: "ACID", winner: "left", say: "On transactional guarantees, SQL takes it back." },
        { criterion: "Flexibility", winner: "right", say: "On schema flexibility, NoSQL again." }
      ],
      verdict: "Pick your poison"
    }
  ],
  meta: DEMO_META,
};

export const DEMO_SKYLINE: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Skyline",
  scenes: [
    {
      kind: "skyline",
      id: "sky",
      title: "City Growth",
      eras: [
        {
          when: "1900",
          stat: "100k",
          say: "In nineteen hundred it is houses and a mill, a hundred thousand people.",
          buildings: [
            { kind: "house", h: 2 },
            { kind: "mill", h: 3 }
          ]
        },
        {
          when: "2000",
          stat: "2M",
          say: "A century later, towers and landmarks house two million.",
          buildings: [
            { kind: "skyscraper", h: 8 },
            { kind: "tower", h: 6 },
            { kind: "landmark", h: 9 }
          ]
        }
      ]
    }
  ],
  meta: DEMO_META,
};
export const DEMO_TERMINAL: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Terminal",
  scenes: [
    {
      kind: "terminal",
      id: "term",
      narration: "One command starts the dev server and it is listening on port three thousand.",
      lines: [
        "$ npm run dev",
        "Starting development server...",
        "Ready on http://localhost:3000"
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_STORYBOARD: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Storyboard",
  scenes: [
    {
      kind: "storyboard",
      id: "story",
      title: "Flow",
      panels: [
        { icons: ["📦", "⚙️"], caption: "Build", say: "First the bundler packs everything into one artifact." },
        { icons: ["🚀"], caption: "Deploy", say: "Then that artifact ships to production." },
        { icons: ["🎉"], caption: "Success", say: "And the health check comes back green." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_ZOOMLADDER: SceneScript = {
  format: "short", lang: "en", subject: "Test", module: "Test", submodule: "Test", topic: "Zoomladder Test",
  scenes: [
    {
      kind: "zoomladder",
      id: "zl",
      title: "Scales of the universe",
      direction: "out",
      rungs: [
        { label: "You", scale: "1 m", icon: "🧍", say: "Start at human scale." },
        { label: "City", scale: "10 km", icon: "🏙️", say: "Zoom out to city." },
        { label: "Earth", scale: "10⁷ m", icon: "🌍", say: "The entire planet." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_BODYMAP: SceneScript = {
  format: "short", lang: "en", subject: "Test", module: "Test", submodule: "Test", topic: "Bodymap Test",
  scenes: [
    {
      kind: "bodymap",
      id: "bm",
      title: "Where caffeine acts",
      path: true,
      marks: [
        { region: "brain", label: "Blocks sleep signals", say: "Blocks tiredness." },
        { region: "heart", label: "Raises heart rate", say: "Nudges the heart." },
        { region: "kidneys", label: "Mild diuretic", say: "Flushes more fluid." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_CONSTELLATION: SceneScript = {
  format: "short", lang: "en", subject: "Test", module: "Test", submodule: "Test", topic: "Constellation Test",
  scenes: [
    {
      kind: "constellation",
      id: "co",
      title: "Drawing Orion",
      points: [
        { id: "p1", x: 2, y: 1, label: "Betelgeuse" },
        { id: "p2", x: 8, y: 1 },
        { id: "p3", x: 4, y: 5 },
        { id: "p4", x: 5, y: 5 },
        { id: "p5", x: 6, y: 5 },
        { id: "p6", x: 3, y: 9 },
        { id: "p7", x: 9, y: 9 }
      ],
      steps: [
        { connect: [{ a: "p1", b: "p2" }, { a: "p3", b: "p4" }], say: "First lines" },
        { connect: [{ a: "p4", b: "p5" }], say: "Next line" }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_DAYCLOCK: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Time",
  module: "Test",
  submodule: "Test",
  topic: "Testing Dayclock",
  scenes: [
    {
      id: "demo-dayclock-1",
      kind: "dayclock",
      title: "Daily Schedule",
      face: "24h",
      pins: [
        { at: "08:00", label: "Wake up", icon: "☀️", say: "Eight in the morning, the day starts." },
        { at: "12:30", label: "Lunch", icon: "🍔", say: "Half twelve is the lunch break." },
        { at: "19:00", label: "Dinner", icon: "🍽️", say: "Seven in the evening, dinner." },
      ],
    },
  ],
  meta: DEMO_META,
};

export const DEMO_GEOMETRY: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Math",
  module: "Test",
  submodule: "Test",
  topic: "Testing Geometry",
  scenes: [
    {
      id: "demo-geometry-1",
      kind: "geometry",
      title: "Triangle Properties",
      points: [
        { id: "A", x: 20, y: 80, label: "A" },
        { id: "B", x: 80, y: 80, label: "B" },
        { id: "C", x: 50, y: 20, label: "C" },
      ],
      segments: [
        { a: "A", b: "B", label: "Base", style: "side" },
        { a: "B", b: "C", style: "side" },
        { a: "C", b: "A", style: "side" },
      ],
      fills: [
        { pts: ["A", "B", "C"], label: "Area" }
      ],
      steps: [
        { highlight: ["A", "B", "C"], say: "Points of a triangle" }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_NUMBERLINE: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Math",
  module: "Test",
  submodule: "Test",
  topic: "Testing Numberline",
  scenes: [
    {
      id: "demo-numberline-1",
      kind: "numberline",
      title: "Number Line Jumps",
      min: 0,
      max: 10,
      mode: "line",
      marks: [
        { value: 2, kind: "point", label: "Start at 2", say: "We start at two." },
        { value: 2, to: 5, kind: "jump", label: "+3", say: "Jump forward three places." },
        { value: 5, kind: "point", label: "Land at 5", say: "And we land on five." },
        { value: 5, to: 8, kind: "range", label: "Zone", say: "Five to eight is the shaded zone." },
      ],
    },
  ],
  meta: DEMO_META,
};

export const DEMO_FORMULA: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Formula",
  scenes: [
    {
      kind: "formula",
      id: "f1",
      title: "Compound interest",
      lhs: { symbol: "A", gloss: "final amount" },
      terms: [
        { op: "", symbol: "P", gloss: "principal", value: "1000", say: "Start with the principal you invest." },
        { op: "×", symbol: "(1+r)ⁿ", gloss: "growth factor", value: "1.61", say: "Multiply by the growth factor over n years." },
      ],
      resultValue: "1610",
      sayResult: "After the years compound, the balance grows to sixteen-ten."
    }
  ],
  meta: DEMO_META,
};

export const DEMO_CURVES: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Curves",
  scenes: [
    {
      kind: "curves",
      id: "s2-curves",
      title: "Supply meets demand",
      xLabel: "Quantity",
      yLabel: "Price",
      curves: [
        { label: "Supply", shape: "supply", say: "Suppliers offer more as prices rise." },
        { label: "Demand", shape: "demand", say: "Buyers want less as prices rise." },
      ],
      mark: { x: 50, label: "Equilibrium", say: "Where they cross sets the market price." },
    }
  ],
  meta: DEMO_META,
};

export const DEMO_SCHEMATIC: SceneScript = {
  format: "short",
  lang: "en",
  subject: "Testing",
  module: "Test",
  submodule: "Test",
  topic: "Testing Schematic",
  scenes: [
    {
      kind: "schematic",
      id: "s-schematic",
      title: "A simple arch bridge",
      parts: [
        { id: "l", shape: "pillar", x: 1, y: 6, w: 2, h: 4, label: "pier" },
        { id: "r", shape: "pillar", x: 9, y: 6, w: 2, h: 4, label: "pier" },
        { id: "arch", shape: "arch", x: 2, y: 4, w: 8, h: 3, label: "span" },
        { id: "deck", shape: "platform", x: 1, y: 3, w: 10, h: 1, label: "deck" },
      ],
      steps: [
        { reveal: ["l", "r"], highlight: [], say: "Two piers are sunk into the ground first." },
        { reveal: ["arch"], highlight: ["arch"], say: "The arch spans between them, carrying the load." },
        { reveal: ["deck"], highlight: [], say: "Finally the deck lays flat across the top." },
      ],
    }
  ],
  meta: DEMO_META,
};


// paintBigtext picks one of five entrance styles from variantOf(scene.id, 5), so a
// single scene only ever exercises one of them. These ids are chosen so their djb2
// hashes land on variants 0-4 — reach them with `filmstrip --scene=<id>`.
export const DEMO_BIGTEXT: SceneScript = {
  format: "short", lang: "en", subject: "Testing", module: "Test", submodule: "Test", topic: "Bigtext Test",
  scenes: [
    {
      kind: "bigtext", id: "t-bigtext",
      narration: "Baseline coverage: whichever entrance variant this id hashes to.",
      text: "The **future** of rendering is __3D__ and beyond.",
      sub: "Embrace the **new** dimension.",
      icon: "🚀"
    },
    {
      kind: "bigtext", id: "t-bigtext-v0ae",
      narration: "Variant 0 coverage: the editorial-left entrance.",
      text: "The **future** of rendering is __3D__ and beyond.",
      sub: "Embrace the **new** dimension.",
      icon: "🚀",
    },
    {
      kind: "bigtext", id: "t-bigtext-v1ab",
      narration: "Variant 1 coverage: the bottom-third headline entrance.",
      text: "The **future** of rendering is __3D__ and beyond.",
      sub: "Embrace the **new** dimension.",
      icon: "🚀",
    },
    {
      kind: "bigtext", id: "t-bigtext-v2ad",
      narration: "Variant 2 coverage: the letter-cascade entrance.",
      text: "The **future** of rendering is __3D__ and beyond.",
      sub: "Embrace the **new** dimension.",
      icon: "🚀",
    },
    {
      kind: "bigtext", id: "t-bigtext-v3aa",
      narration: "Variant 3 coverage: the outline-to-solid-fill entrance.",
      text: "The **future** of rendering is __3D__ and beyond.",
      sub: "Embrace the **new** dimension.",
      icon: "🚀",
    },
  ],
  meta: DEMO_META,
};

export const DEMO_STAT: SceneScript = {
  format: "short", lang: "en", subject: "Testing", module: "Test", submodule: "Test", topic: "Stat Test",
  scenes: [
    {
      kind: "stat", id: "t-stat",
      narration: "Switching the painters to WebGL cut frame time to a quarter of what it was.",
      value: "400%",
      label: "Faster rendering after the WebGL switch",
      context: "Measured across 500 scene renders on the same machine.",
    }
  ],
  meta: DEMO_META,
};

export const DEMO_STEPS: SceneScript = {
  format: "short", lang: "en", subject: "Testing", module: "Test", submodule: "Test", topic: "Steps Test",
  scenes: [
    {
      kind: "steps", id: "t-steps",
      title: "Evolution",
      steps: [
        { text: "Plan the changes", say: "First we plan what actually has to change." },
        { text: "Implement in **Three.js**", say: "Then the painter gets rewritten in Three.js." },
        { text: "Capture and __verify__", say: "Finally we capture a filmstrip and verify it." }
      ]
    }
  ],
  meta: DEMO_META,
};

export const DEMO_WAVE3E: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Foundations",
  topic: "Wave-3e animation kinds: batch 4 of the fan-out",
  scenes: [
    {
  kind: "dom_event_flow",
  id: "delegation-demo",
  sayIntro: "One click, four possible listeners — where does the handler actually run?",
  title: "Event Delegation: One Handler at the Root",
  eventLabel: "click",
  delegateAt: "list",
  synthetic: false,
  nodes: [
    { id: "doc", label: "document", icon: "🌐", portal: false },
    { id: "body", label: "body", parent: "doc", portal: false },
    { id: "list", label: "ul.todo-list", parent: "body", icon: "📋", portal: false },
    { id: "item", label: "li.item", parent: "list", icon: "☑️", portal: false },
  ],
  targetId: "item",
  steps: [
    { nodeId: "doc", phase: "capture", say: "The click starts its journey at the very top of the tree: document." },
    { nodeId: "body", phase: "capture", say: "It captures downward through body..." },
    { nodeId: "list", phase: "capture", say: "...and into the list container, ul dot todo-list." },
    { nodeId: "item", phase: "target", say: "It reaches the exact element you clicked: li dot item." },
    { nodeId: "list", phase: "bubble", say: "Now it bubbles back up, straight into the ONE listener sitting on the list." },
    { nodeId: "body", phase: "bubble", say: "It keeps bubbling upward through body..." },
    { nodeId: "doc", phase: "bubble", say: "...all the way back to document, having never needed a per-item handler." },
  ],
},
    {
  kind: "commit_dag",
  id: "s1-commit-dag",
  sayIntro: "Every branch in git is really just a movable pointer to one commit.",
  title: "Branching Internals: refs, HEAD, git branch",
  commits: [
    { id: "c1", parents: [], lane: 0, label: "c1" },
    { id: "c2", parents: ["c1"], lane: 0, label: "c2" },
    { id: "c3", parents: ["c2"], lane: 0, label: "c3" },
    { id: "c4", parents: ["c3"], lane: 1, label: "c4" },
    { id: "c5", parents: ["c4"], lane: 1, label: "c5" },
  ],
  steps: [
    { reveal: ["c1", "c2"], fade: [], newRef: { name: "main", at: "c2" }, head: "main", say: "main starts as nothing more than a pointer to the latest commit." },
    { reveal: ["c3"], fade: [], moveRef: { ref: "main", to: "c3" }, say: "Every new commit on main just slides that pointer forward one step." },
    { reveal: [], fade: [], newRef: { name: "feature", at: "c3" }, note: "git branch feature", say: "`git branch feature` drops a second pointer at c3 — HEAD stays on main, nothing else moves." },
    { reveal: ["c4"], fade: [], head: "feature", moveRef: { ref: "feature", to: "c4" }, note: "git checkout feature", say: "Checking out feature reattaches HEAD, so the next commit advances feature instead of main." },
    { reveal: ["c5"], fade: [], moveRef: { ref: "feature", to: "c5" }, say: "feature now owns a commit main doesn't have — the two histories have diverged." },
  ],
},
    {
  kind: "partitioned_log",
  id: "kafka-partitions-1",
  sayIntro: "A Kafka topic isn't one queue — it's split into partitions so many consumers can read it in parallel.",
  title: "Topics & Partitions: Parallel Streams",
  partitions: [
    { id: "p0", label: "P0" },
    { id: "p1", label: "P1" },
  ],
  consumers: [
    { id: "c1", label: "worker-1", partitionId: "p0", offset: 0 },
    { id: "c2", label: "worker-2", partitionId: "p1", offset: 0 },
  ],
  steps: [
    { op: "append", partitionId: "p0", value: "ord:41", say: "An order for user 41 lands in partition 0 — appended straight onto the lane's tail." },
    { op: "append", partitionId: "p1", value: "ord:77", say: "A different order hashes to partition 1 instead — two lanes, two producers, zero contention." },
    { op: "append", partitionId: "p0", value: "ord:42", say: "Partition 0 keeps growing; every record gets the next offset in line, oldest first." },
    { op: "advance", consumerId: "c1", toOffset: 2, say: "worker-1 commits offset 2 — its bookmark for exactly where it left off in partition 0." },
    { op: "append", partitionId: "p1", value: "ord:78", say: "Partition 1 gets another append while worker-2 is still catching up on its own lane." },
    { op: "rebalance", consumerId: "c1", toPartitionId: "p1", toOffset: 1, say: "worker-2 drops out of the group — reads freeze while partition 1 is reassigned to worker-1." },
    { op: "advance", consumerId: "c1", toOffset: 2, say: "The pause ends: worker-1 resumes partition 1 right where the group last committed." },
  ],
},
    {
  kind: "container_sandbox",
  id: "ns-cgroup-demo",
  sayIntro: "Containers aren't kernel-level VMs — they're one process, walled off by namespaces and capped by cgroups.",
  title: "Namespaces and cgroups: the real boundary",
  processLabel: "nginx (PID 4821)",
  resources: [
    { id: "pid", label: "PID tree", kind: "pid", shared: false },
    { id: "net", label: "Network", kind: "net", shared: true },
    { id: "mnt", label: "Mounts", kind: "mount", shared: false },
    { id: "usr", label: "Users", kind: "user", shared: false },
    { id: "host", label: "Hostname", kind: "hostname", shared: false },
  ],
  cgroupLimit: { label: "Memory", capPct: 70 },
  steps: [
    { kind: "isolate", hide: ["pid"], say: "A new PID namespace hides the host's process tree — this container only sees itself as PID 1." },
    { kind: "isolate", hide: ["mnt", "usr"], say: "Mount and user namespaces cut it off from the host filesystem and its real UID map." },
    { kind: "isolate", hide: ["host"], say: "Even the hostname gets its own namespace — but notice net is still open." },
    { kind: "limit", hide: [], usagePct: 55, say: "A cgroup then caps how much memory this process can actually use, say 55 percent." },
    { kind: "limit", hide: [], usagePct: 82, say: "Push past the 70 percent cap and the kernel throttles it — the namespace never stopped that; the cgroup did." },
  ],
},
    {
  kind: "control_loop",
  id: "podReconcile",
  sayIntro: "Kubernetes doesn't just run your pod once — a controller watches it forever.",
  title: "Delete a Pod, Watch It Resurrect",
  controllerLabel: "ReplicaSet",
  items: [
    { id: "replicas", label: "Pod replicas", desiredValue: "3", icon: "server" },
    { id: "podC", label: "Pod web-c", desiredValue: "Running", icon: "cpu" },
  ],
  steps: [
    { itemId: "podC", action: "drift", actualValue: "Deleted", say: "You delete pod web-c by hand — the cluster's actual state no longer matches what you declared." },
    { itemId: "replicas", action: "drift", actualValue: "2", say: "The controller's next watch loop reads reality: only 2 replicas are running, not 3." },
    { itemId: "replicas", action: "reconcile", actualValue: "3", say: "It diffs actual against desired, sees the gap, and schedules a replacement pod." },
    { itemId: "podC", action: "reconcile", actualValue: "Running", say: "Moments later a fresh pod is Running again — desired state, restored automatically." },
  ],
},
    {
  kind: "telemetry_trace",
  id: "trace-checkout",
  sayIntro: "One checkout click looks simple — until you trace what it actually calls.",
  title: "One Request, 7 Services: Tracing Checkout",
  totalMs: 420,
  unitLabel: "ms",
  spans: [
    { id: "gw", service: "API Gateway", kind: "gateway", startMs: 0, durMs: 420, status: "ok", say: "A single checkout request hits the gateway, and the trace begins." },
    { id: "auth", parentId: "gw", service: "Auth Service", kind: "service", startMs: 10, durMs: 40, status: "ok", say: "First it forks off to Auth, to validate the session token." },
    { id: "cat", parentId: "gw", service: "Catalog Service", kind: "service", startMs: 60, durMs: 180, status: "ok", say: "In parallel, Catalog Service starts fetching the product details." },
    { id: "catdb", parentId: "cat", service: "Catalog DB", kind: "db", startMs: 80, durMs: 120, status: "ok", say: "Catalog calls its own Postgres for the product row." },
    { id: "cache", parentId: "cat", service: "Price Cache", kind: "cache", startMs: 210, durMs: 20, status: "ok", say: "Then a quick Redis lookup fills in the cached price." },
    { id: "pay", parentId: "gw", service: "Payment API", kind: "external", startMs: 250, durMs: 150, status: "error", say: "Payment runs last, sequentially, since it needs that price — and it times out." },
    { id: "queue", parentId: "gw", service: "Order Queue", kind: "queue", startMs: 405, durMs: 15, status: "ok", say: "A retry message is queued so the order isn't lost." },
  ],
  verdict: {
    outcome: "keep",
    reason: "Kept: this trace contains a real payment timeout",
    say: "Because one span errored, tail sampling keeps this entire trace for debugging — head sampling would have coin-flipped before ever seeing that error.",
  },
},
    {
  kind: "spatial_index",
  id: "proximity-quadtree",
  sayIntro: "A proximity service can't scan every driver on Earth for every ride request — it needs to bucket nearby locations together.",
  title: "Quadtree: Bucketing Nearby Locations",
  capacity: 1,
  steps: [
    {
      points: [{ id: "d1", x: 40, y: 40, label: "D1" }],
      say: "Drop the first driver onto the map — one quadrant covers the whole city so far.",
    },
    {
      points: [{ id: "d2", x: 45, y: 42, label: "D2" }],
      say: "A second driver lands close by. That quadrant now holds two, past its capacity of one, so it cascades into smaller and smaller cells until the two separate.",
    },
    {
      points: [{ id: "d3", x: 85, y: 15, label: "D3" }],
      say: "A driver clear across town stays in its own big quadrant — sparse areas never need to subdivide.",
    },
    {
      points: [],
      query: { x: 42, y: 41, radius: 14 },
      say: "A rider nearby only searches that tight cluster of small cells, not the whole map — that's the entire point of the index.",
    },
  ],
},
    {
      kind: "question",
      id: "recap",
      text: "DOM event flow, commit DAG, partitioned log, container sandbox, control loop, telemetry trace, spatial index.",
      narration: "Seven more scene kinds -- which one fits a concept you are teaching right now?",
    },
  ],
  meta: {
    title: "Wave-3e Animation Kinds",
    description: "Reference demo for seven more new DevStudio scene kinds from the Wave-3 fan-out: dom_event_flow, commit_dag, partitioned_log, container_sandbox, control_loop, telemetry_trace, spatial_index.",
    tags: ["wave3e", "devstudio", "demo"],
    hashtags: ["#SystemDesign", "#Algorithms"],
  },
};

export const DEMO_WAVE3F: SceneScript = {
  format: "long",
  lang: "en",
  subject: "Coding",
  module: "System Design",
  submodule: "Foundations",
  topic: "Wave-3f animation kinds: final batch of the fan-out",
  scenes: [
    {
  kind: "object_heap",
  id: "copy-aliasing-demo",
  sayIntro: "In Python a variable is just a name tag pointing at an object somewhere on the heap.",
  title: "Shallow vs Deep Copy",
  vars: [
    { id: "v1", name: "original" },
    { id: "v2", name: "shallow" },
    { id: "v3", name: "deep" },
  ],
  objects: [
    { id: "o1", label: "[1, 2, 3]", icon: "📋", mutable: true },
    { id: "o2", label: "[1, 2, 3]", icon: "📋", mutable: true },
  ],
  steps: [
    { bind: { name: "v1", obj: "o1" }, collect: [], say: "original = [1, 2, 3] allocates one list object on the heap." },
    { bind: { name: "v2", obj: "o1" }, collect: [], say: "shallow = original just copies the reference — same object, refcount climbs to 2." },
    { bind: { name: "v3", obj: "o2" }, collect: [], say: "deep = copy.deepcopy(original) allocates a brand-new, separate object instead." },
    { mutate: "o1", collect: [], note: "shallow sees the change too — deep does not", say: "Mutate through original, and shallow reflects it instantly, because they are the same object." },
  ],
},
    {
  kind: "vector_space",
  id: "wordvecs",
  sayIntro: "Word2Vec turns every word into a point in space — and the geometry between the points captures meaning.",
  title: "Words as Vectors",
  mode: "2d",
  xLabel: "common ↔ royal",
  yLabel: "male ↔ female",
  points: [
    { id: "king", label: "king", cluster: "royal", x: 30, y: 18 },
    { id: "queen", label: "queen", cluster: "royal", x: 32, y: -20 },
    { id: "man", label: "man", cluster: "common", x: -22, y: 20 },
    { id: "woman", label: "woman", cluster: "common", x: -20, y: -18 },
  ],
  distances: [
    { from: "king", to: "queen", label: "royal, flips gender" },
    { from: "man", to: "woman", label: "common, flips gender" },
  ],
  steps: [
    { reveal: ["king"], showBoundary: false, showDistances: [], focus: "king", say: "Start with \"king\" — its position already encodes royal and male." },
    { reveal: ["man"], showBoundary: false, showDistances: [], focus: "man", say: "\"Man\" sits far from royalty but at the same height — same gender axis." },
    { reveal: ["queen"], showBoundary: false, showDistances: [], focus: "queen", say: "\"Queen\" mirrors king's royal position, but drops to the female side." },
    { reveal: ["woman"], showBoundary: false, showDistances: [0, 1], focus: "woman", say: "\"Woman\" completes the square — and the king-to-queen arrow matches man-to-woman almost exactly. That's the analogy hiding in the geometry." },
  ],
},
    {
  kind: "neural_network",
  id: "backprop",
  sayIntro: "A tiny network learns by pushing a signal forward, then correcting itself backward.",
  title: "Backpropagation Step by Step",
  layers: [
    { size: 3, label: "Input" },
    { size: 4, label: "Hidden 1", activation: "ReLU" },
    { size: 4, label: "Hidden 2", activation: "ReLU" },
    { size: 2, label: "Output", activation: "Softmax" },
  ],
  steps: [
    { direction: "forward", layerIndex: 0, label: "x", say: "The input layer takes in three features." },
    { direction: "forward", layerIndex: 1, label: "ReLU(Wx+b)", say: "Hidden layer one activates from a weighted sum." },
    { direction: "forward", layerIndex: 2, label: "ReLU(Wh+b)", say: "Hidden layer two builds on those features." },
    { direction: "forward", layerIndex: 3, label: "ŷ", say: "The output layer produces a prediction." },
    { direction: "backward", layerIndex: 3, label: "loss", say: "We compare that prediction to the true label and compute a loss." },
    { direction: "backward", layerIndex: 2, label: "∂L/∂W3", say: "The gradient flows back into the last weight matrix." },
    { direction: "backward", layerIndex: 1, label: "∂L/∂W2", say: "It keeps flowing backward, layer by layer." },
    { direction: "backward", layerIndex: 0, label: "∂L/∂W1", say: "Finally the earliest weights get their share of the blame." },
  ],
},
    {
  kind: "matrix_convolution",
  id: "sliding-dot-product",
  sayIntro: "A convolution kernel isn't mysterious — it just slides across the image, multiplies overlapping numbers, and adds them up.",
  title: "Convolutions Are Just Sliding Dot Products",
  inputRows: 4,
  inputCols: 4,
  kernelRows: 3,
  kernelCols: 3,
  outputRows: 2,
  outputCols: 2,
  inputValues: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16"],
  kernelValues: ["1","1","1","1","1","1","1","1","1"],
  steps: [
    { atRow: 0, atCol: 0, outRow: 0, outCol: 0, products: ["1","2","3","5","6","7","9","10","11"], result: "54", say: "At the top-left, every kernel weight is a one, so each product equals the pixel underneath — sum all nine and you get fifty-four." },
    { atRow: 0, atCol: 1, outRow: 0, outCol: 1, products: ["2","3","4","6","7","8","10","11","12"], result: "63", say: "Slide the window one column right: new pixels enter the frame, the dot product shifts, and the sum becomes sixty-three." },
    { atRow: 1, atCol: 0, outRow: 1, outCol: 0, products: ["5","6","7","9","10","11","13","14","15"], result: "90", say: "Now slide down a row instead — the receptive field covers the next band of pixels, summing to ninety." },
    { atRow: 1, atCol: 1, outRow: 1, outCol: 1, products: ["6","7","8","10","11","12","14","15","16"], result: "99", say: "One more slide completes the two-by-two feature map: the bottom-right dot product is ninety-nine." }
  ]
},
    {
  kind: "consensus_quorum",
  id: "raft-election-demo",
  sayIntro: "Raft elects a leader only once a candidate wins a majority of the votes.",
  title: "Raft Leader Election",
  nodes: [
    { id: "s1", label: "S1", role: "leader" },
    { id: "s2", label: "S2", role: "follower" },
    { id: "s3", label: "S3", role: "follower" },
    { id: "s4", label: "S4", role: "follower" },
    { id: "s5", label: "S5", role: "follower" },
  ],
  quorumSize: 3,
  steps: [
    { kind: "propose", from: "s1", ackFrom: [], note: "Term 2 · RequestVote", say: "S1 times out first and starts an election, becoming a candidate for term 2." },
    { kind: "ack", from: "s1", ackFrom: ["s2"], note: "1 vote in", say: "S2 grants its vote — one voice alone, nowhere near enough." },
    { kind: "fail", from: "s1", ackFrom: [], note: "Split vote", say: "S3 and S4 already voted for a rival candidate this term, so S1 falls short of quorum." },
    { kind: "reset", ackFrom: [], note: "New term begins", say: "The election times out; every node bumps to term 3 and tries again." },
    { kind: "propose", from: "s1", ackFrom: [], note: "Term 3 · RequestVote", say: "S1's timer fires first this round, so it re-requests votes for term 3." },
    { kind: "ack", from: "s1", ackFrom: ["s2", "s3", "s4"], note: "3 votes in", say: "S2, S3, and S4 all grant their votes this time." },
    { kind: "commit", ackFrom: [], note: "Elected leader", say: "With 4 of 5 nodes behind it, S1 crosses the quorum and becomes leader for term 3." },
  ],
},
    {
      kind: "question",
      id: "recap",
      text: "Object heap, vector space, neural network, matrix convolution, consensus quorum -- the last five of forty.",
      narration: "That's the full set -- forty new scene kinds, ready to use.",
    },
  ],
  meta: {
    title: "Wave-3f Animation Kinds",
    description: "Reference demo for the final five new DevStudio scene kinds from the Wave-3 fan-out: object_heap, vector_space, neural_network, matrix_convolution, consensus_quorum.",
    tags: ["wave3f", "devstudio", "demo"],
    hashtags: ["#SystemDesign", "#MachineLearning"],
  },
};

/** The only kind with no scene anywhere else in this file, so the QA kind index
 *  cannot reach `vocab` without it. Three examples = the schema maximum, which is
 *  the layout-stressing case the painter must survive. */
export const DEMO_VOCAB: SceneScript = {
  format: "short",
  lang: "en",
  subject: "English & Communication",
  module: "Test",
  submodule: "Test",
  topic: "Vocabulary Flashcard",
  scenes: [
    {
      kind: "vocab",
      id: "t-vocab",
      sayIntro: "Here's a word that shows up in every serious code review.",
      word: "Idempotent",
      pron: "eye-DEM-po-tent",
      pos: "adjective",
      meaning: "Producing the same result no matter how many times it is applied.",
      examples: [
        {
          text: "A DELETE endpoint should be idempotent.",
          say: "A DELETE endpoint should be idempotent, so a retry never causes harm.",
        },
        {
          text: "Retries are safe because the write is idempotent.",
          say: "Retries are safe because the write is idempotent.",
        },
        {
          text: "Make the migration idempotent before you ship it.",
          say: "Make the migration idempotent before you ship it.",
        },
      ],
      synonym: "repeat-safe",
    },
  ],
  meta: {
    title: "Vocabulary: Idempotent",
    description: "Reference demo scene for the vocab painter, the one scene kind with no coverage in any other demo script.",
    tags: ["vocab", "devstudio", "demo", "english"],
    hashtags: ["#Vocabulary", "#English", "#DevStudio"],
  },
};
