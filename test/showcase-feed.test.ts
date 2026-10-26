import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyEvent,
  config,
  createGame,
  pickChallenge,
  publicState,
  startRound,
  tick,
} from "../src/game/index.js";
import type { Challenge, Settings } from "../src/game/types.js";
import { createSimulator } from "../src/sim/index.js";
import { DISPLAY_LIMIT } from "../src/sim/display.js";

const library = JSON.parse(
  readFileSync(new URL("../data/challenges.json", import.meta.url), "utf8"),
) as Challenge[];
const settings: Settings = {
  teams: {
    A: { name: "Coral Crew", channel: "coralcrew" },
    B: { name: "Mint Mob", channel: "mintmob" },
  },
  language: "en",
  penalties: [
    "Wear a silly hat for the next round",
    "Speak like a robot for one minute",
  ],
  approved: { A: true, B: true },
};

function run(cosmeticSeed: number, challenge = pickChallenge(library, 42)) {
  let game = startRound(createGame(settings, challenge), 0);
  const sim = createSimulator(42, cosmeticSeed);
  const kinds = new Set<string>(),
    messages = new Set<string>(),
    sample: string[] = [];
  for (
    let now = 0;
    now <= config.timing.roundMs + config.timing.voteMs;
    now += 250
  ) {
    game = tick(game, now);
    for (const event of sim(game, now)) {
      if (sample.length < 30) sample.push(event.text ?? "");
      game = applyEvent(game, event);
    }
    const feed = sim.displayFeed();
    for (const team of ["A", "B"] as const) {
      assert.ok(feed[team].length <= DISPLAY_LIMIT);
      for (const row of feed[team]) {
        kinds.add(row.kind);
        messages.add(row.text);
        assert.ok(!challenge.answers.includes(row.text));
        assert.ok(!Object.hasOwn(row, "answers"));
      }
    }
  }
  return { game: publicState(game), kinds, messages, sample };
}

test("cosmetic RNG changes chat variety while preserving the exact pre-showcase seed-42 CLI outcome", () => {
  const first = run(123),
    second = run(987);
  assert.deepEqual(first.game, second.game);
  assert.notDeepEqual(first.sample, second.sample);
  const g = first.game;
  assert.deepEqual(
    {
      winner: g.winner,
      scores: g.scores,
      penalty: g.penalty,
      participants: g.participants,
      events: g.eventCount,
      mvps: g.mvps,
    },
    {
      winner: "A",
      scores: { A: 2982, B: 2971 },
      penalty: "Speak like a robot for one minute",
      participants: { A: 72, B: 58 },
      events: 3350,
      mvps: {
        A: [
          { userId: "A-5", userName: "cozychaos_5", points: 82, firstAt: 0 },
          { userId: "A-3", userName: "snackattack_3", points: 70, firstAt: 0 },
          { userId: "A-9", userName: "hypeotter_9", points: 69, firstAt: 1000 },
        ],
        B: [
          { userId: "B-6", userName: "tinythunder_6", points: 98, firstAt: 0 },
          { userId: "B-4", userName: "neonnoodle_4", points: 93, firstAt: 0 },
          { userId: "B-3", userName: "snackattack_3", points: 82, firstAt: 0 },
        ],
      },
    },
  );
  assert.deepEqual([...first.kinds].sort(), [
    "answer",
    "chat",
    "cheer",
    "combo",
    "raid",
    "redemption",
    "vote",
  ]);
  assert.ok(
    [...first.messages].filter((m) => !m.startsWith("!vote")).length > 30,
  );
});

test("simulator masks correct flash payloads before any display snapshot and bounds both feeds", () => {
  const answer = "PRIVATE_SENTINEL_ANSWER_NEVER_PUBLISHED";
  const challenge: Challenge = {
    id: "private-fixture",
    type: "trivia",
    prompt: { en: "A private-answer fixture?", it: "Una domanda?" },
    answers: [answer],
  };
  const result = run(42, challenge);
  assert.ok(result.messages.has("✓ answered the flash challenge"));
  assert.ok(!JSON.stringify([...result.messages]).includes(answer));
  assert.ok(!JSON.stringify(result.game).includes(answer));
});
