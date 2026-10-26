import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyEvent,
  config,
  createGame,
  isCorrect,
  normalizeAnswer,
  pickChallenge,
  startRound,
  tick,
} from "../src/game/index.js";
import type { Challenge, ClashEvent, Settings } from "../src/game/types.js";
import { createSimulator } from "../src/sim/index.js";

const library = JSON.parse(
  readFileSync(new URL("../data/challenges.json", import.meta.url), "utf8"),
) as Challenge[];
const settings: Settings = {
  teams: { A: { name: "A", channel: "a" }, B: { name: "B", channel: "b" } },
  language: "en",
  penalties: ["Wear a silly hat"],
  approved: { A: true, B: true },
};

test("library has at least 150 unique original bilingual challenges and every deterministic type", () => {
  assert.ok(library.length >= 150);
  assert.equal(new Set(library.map((c) => c.id)).size, library.length);
  for (const language of ["en", "it"] as const)
    assert.equal(
      new Set(library.map((c) => c.prompt[language])).size,
      library.length,
    );
  for (const type of ["trivia", "anagram", "math", "type-race", "emote-target"])
    assert.ok(library.filter((c) => c.type === type).length >= 20);
  for (const c of library) {
    assert.ok(c.prompt.en.length > 10 && c.prompt.it.length > 10);
    if (c.type === "emote-target")
      assert.ok(c.emote && isCorrect(c, "", [c.emote]));
    else {
      assert.ok(c.answers.length);
      for (const answer of c.answers)
        assert.ok(isCorrect(c, answer.toUpperCase()));
    }
  }
});
test("anagrams preserve every letter and math answers are correct independently", () => {
  for (const c of library) {
    if (c.type === "anagram") {
      const letters = (s: string) =>
        normalizeAnswer(s).split("").sort().join("");
      assert.equal(letters(c.prompt.en.split(": ")[1]), letters(c.answers[0]));
      assert.notEqual(
        normalizeAnswer(c.prompt.en.split(": ")[1]),
        normalizeAnswer(c.answers[0]),
      );
    }
    if (c.type === "math") {
      const expression = c.prompt.en
        .split(": ")[1]
        .split(" =")[0]
        .replaceAll("×", "*")
        .replaceAll("÷", "/");
      assert.match(expression, /^[\d\s+*/()-]+$/);
      assert.equal(String(Function(`return (${expression})`)()), c.answers[0]);
    }
  }
});
test("seeded simulator runs full round and vote, producing every event type and a raid", () => {
  const run = () => {
    let g = startRound(createGame(settings, pickChallenge(library, 42)), 0);
    const sim = createSimulator(42),
      phases = new Set<string>(),
      types = new Set<string>();
    const sample: ClashEvent[] = [];
    for (
      let now = 0;
      now <= config.timing.roundMs + config.timing.voteMs;
      now += 250
    ) {
      g = tick(g, now);
      phases.add(g.phase);
      for (const e of sim(g, now)) {
        types.add(e.type);
        if (sample.length < 10) sample.push(e);
        g = applyEvent(g, e);
      }
    }
    return { g, phases, types, sample };
  };
  const a = run(),
    b = run();
  assert.deepEqual(a, b);
  assert.equal(a.g.phase, "complete");
  assert.ok(a.g.scores.A > 0 && a.g.scores.B > 0);
  assert.equal(a.types.size, 4);
  assert.equal(a.phases.size, 5);
  assert.ok(a.g.eventCount > 1000);
  assert.ok(Object.keys(a.g.votes).length > 0);
});
