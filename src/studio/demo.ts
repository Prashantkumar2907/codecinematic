import type { SceneScript } from "./schema";

/** Hardcoded script for the render spike and manual smoke-testing (no Gemini call). */
export const DEMO_SCRIPT: SceneScript = {
  format: "short",
  subject: "Coding",
  module: "Frontend",
  submodule: "JavaScript",
  topic: "The prototype chain: how objects find their methods",
  scenes: [
    {
      kind: "bigtext",
      id: "hook",
      narration: "Your object doesn't have that method. So why does calling it still work?",
      text: "This method doesn't exist on your object.",
      sub: "So why does it work?",
    },
    {
      kind: "diagram",
      id: "chain",
      title: "The lookup walk",
      nodes: [
        { id: "obj", label: "p1", x: 4, y: 0, w: 4, h: 2, accent: true },
        { id: "proto", label: "Person.prototype", x: 3, y: 4, w: 6, h: 2, accent: false },
        { id: "objproto", label: "Object.prototype", x: 3, y: 8, w: 6, h: 2, accent: false },
      ],
      arrows: [
        { from: "obj", to: "proto", label: "not found? go up" },
        { from: "proto", to: "objproto", label: "still not found?" },
      ],
      steps: [
        { reveal: ["obj"], highlight: ["obj"], say: "JavaScript checks the object itself first." },
        {
          reveal: ["proto"],
          highlight: ["proto"],
          say: "Not there? It walks up to the prototype and looks again.",
        },
        {
          reveal: ["objproto"],
          highlight: ["objproto"],
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
      kind: "mythfact",
      id: "myth",
      myth: "Every object carries its own copy of every method.",
      fact: "Methods live once on the prototype — a thousand objects share one function.",
      sayMyth: "Most beginners assume every object carries its own copy of every method.",
      sayFact: "Wrong. Methods live once on the prototype, and a thousand objects share that single function.",
    },
    {
      kind: "chart",
      id: "memory",
      sayIntro: "Here is why that sharing matters for memory.",
      title: "Memory for 10,000 objects",
      items: [
        { label: "Copied methods", value: 4200, unit: " KB", say: "Copy the method onto each object and ten thousand objects cost over four megabytes." },
        { label: "Prototype shared", value: 640, unit: " KB", say: "Share it on the prototype and the same objects need a fraction of that." },
      ],
    },
    {
      kind: "quote",
      id: "principle",
      narration: "It all comes down to one sentence: objects don't own behaviour, they look it up.",
      text: "Objects don't own their behaviour — they look it up, one link at a time.",
      author: "The prototype mental model",
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
