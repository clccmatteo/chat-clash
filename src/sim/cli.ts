import { readFileSync } from "node:fs";
import {
  applyEvent,
  config,
  createGame,
  pickChallenge,
  publicState,
  startRound,
  tick,
} from "../game/index.js";
import type { Challenge, Settings } from "../game/types.js";
import { createSimulator } from "./index.js";

const library = JSON.parse(
  readFileSync(new URL("../../data/challenges.json", import.meta.url), "utf8"),
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
const seed = Number(process.argv[2] ?? 42);
if (!Number.isSafeInteger(seed))
  throw new Error("Seed must be an integer: npm run sim -- 42");
const simulate = createSimulator(seed);
let state = startRound(createGame(settings, pickChallenge(library, seed)), 0);
console.log(
  "CHAT CLASH · seeded simulation · virtual clock · no server required",
);
for (
  let now = 0;
  now <= config.timing.roundMs + config.timing.voteMs;
  now += 250
) {
  const previous = state.phase;
  state = tick(state, now);
  for (const event of simulate(state, now)) state = applyEvent(state, event);
  if (previous !== state.phase || now % 30000 === 0)
    console.log(
      `${String(now / 1000).padStart(3)}s  ${state.phase.padEnd(9)} ${state.scores.A} : ${state.scores.B}`,
    );
}
const final = publicState(state);
console.log(
  JSON.stringify(
    {
      winner: final.winner,
      penalty: final.penalty,
      participants: final.participants,
      mvps: final.mvps,
      events: final.eventCount,
    },
    null,
    2,
  ),
);
