import { renderDemoFrame } from "./probe-shot.mjs";

const scene = {
  kind: "dialogue",
  title: "Client-Server Dialogue",
  left: { name: "Client", icon: "💻" },
  right: { name: "Server", icon: "🖥️" },
  messages: [
    { from: "left", text: "Hello! Can I have the homepage?" },
    { from: "right", text: "Sure thing, checking my cache...", reaction: "🔍" },
    { from: "right", text: "Found it. Here is the HTML!" }
  ]
};

// For dialogue, introBeatCount is 1. We have 3 messages. Total beats = 4.
// Let's render at beat 3 (index 2, which is the 2nd message showing, 3rd message typing/showing).
// t=0 is beat 0. t=1 is beat 1.
await renderDemoFrame(scene, "dialogue-short-b2.png", { format: "short", beat: 2, t: 0.8 });
await renderDemoFrame(scene, "dialogue-long-b2.png", { format: "long", beat: 2, t: 0.8 });
await renderDemoFrame(scene, "dialogue-short-b3.png", { format: "short", beat: 3, t: 1.0 });
await renderDemoFrame(scene, "dialogue-long-b3.png", { format: "long", beat: 3, t: 1.0 });

console.log("Rendered dialogue screenshots.");
