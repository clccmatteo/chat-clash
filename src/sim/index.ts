import { config } from "../game/index.js";
import type { ClashEvent, GameState, Team } from "../game/types.js";

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const names = [
  "pixelpilot",
  "toastwizard",
  "lunarbean",
  "snackattack",
  "neonnoodle",
  "cozychaos",
  "tinythunder",
  "ctrlcat",
  "cloudrider",
  "hypeotter",
  "pastapower",
  "mintymage",
];

// Stateful event producer only. The engine remains the sole authority for scores.
export function createSimulator(seed = 42) {
  const random = seededRandom(seed);
  const fired = new Set<string>();
  let lastStep = -1;
  return (state: GameState, now: number): ClashEvent[] => {
    if (
      state.startedAt === null ||
      ["stopped", "complete", "idle"].includes(state.phase)
    )
      return [];
    const elapsed = now - state.startedAt,
      step = Math.floor(elapsed / 250);
    if (step === lastStep) return [];
    lastStep = step;
    const events: ClashEvent[] = [];
    const add = (
      team: Team,
      user: number,
      extras: Partial<ClashEvent> = {},
    ) => {
      events.push({
        type: "chat",
        team,
        userId: `${team}-${user}`,
        userName: `${names[user % names.length]}_${user}`,
        text: ["lets go", "what a round", "we got this", "clash!"][
          Math.floor(random() * 4)
        ],
        ts: now,
        ...extras,
      });
    };
    if (state.phase === "verdict") {
      if (state.winner && random() > 0.35)
        add(state.winner, Math.floor(random() * 70), {
          text: `!vote ${1 + Math.floor(random() * state.settings.penalties.length)}`,
        });
      return events;
    }
    const count = 2 + Math.floor(random() * (state.phase === "rush" ? 9 : 5));
    for (let i = 0; i < count; i++) {
      // Coral leads early; Mint mounts a comeback in the final rush.
      const team: Team =
        random() < (state.phase === "rush" ? 0.38 : 0.59) ? "A" : "B";
      const user = Math.floor(random() * (team === "A" ? 72 : 58));
      const correct =
        state.phase === "flash" &&
        elapsed >= config.timing.flashStartMs + 1500 &&
        random() < 0.6;
      if (correct) {
        add(
          team,
          user,
          state.challenge.type === "emote-target"
            ? { emotes: [state.challenge.emote!] }
            : {
                text: state.challenge.answers[
                  Math.floor(random() * state.challenge.answers.length)
                ],
              },
        );
      } else
        add(team, user, {
          emotes: random() < 0.4 ? ["CLASH"] : [],
          text:
            state.phase === "flash" ? "surely it is a potato" : "lets go crew",
        });
    }
    const second = Math.floor(elapsed / 1000);
    if (second % 13 === 0 && !fired.has(`burst-${second}`)) {
      fired.add(`burst-${second}`);
      const team = random() < 0.5 ? "A" : "B";
      for (let i = 0; i < 12; i++) add(team, i, { emotes: ["CLASH"] });
    }
    if (second >= 45 && !fired.has("raid")) {
      fired.add("raid");
      add("B", 0, { type: "raid", amount: 187 });
    }
    if (second % 15 === 0 && !fired.has(`redeem-${second}`)) {
      fired.add(`redeem-${second}`);
      add(random() < 0.5 ? "A" : "B", 3, { type: "redemption" });
    }
    if (second % 29 === 0 && !fired.has(`bits-${second}`)) {
      fired.add(`bits-${second}`);
      add("A", 5, { type: "cheer", amount: 300 });
    }
    return events;
  };
}
