import { isCorrect } from "../game/challenges.js";
import type { Challenge, ClashEvent, GameState, Team } from "../game/types.js";

export const DISPLAY_LIMIT = 40;
export type DisplayRow = {
  id: number;
  team: Team;
  userName: string;
  kind: "chat" | "combo" | "cheer" | "redemption" | "raid" | "answer" | "vote";
  text: string;
};
export type DisplayFeed = Record<Team, DisplayRow[]>;
export const emptyDisplayFeed = (): DisplayFeed => ({ A: [], B: [] });

const chatter = [
  "tiny keyboard, enormous energy ⚡",
  "the comeback is cooking 🍳",
  "sending a pocket-sized cheer",
  "this bar has places to be 🚀",
  "we brought snacks and determination",
  "one more voice in the crowd 🌱",
  "friendly chaos, excellent company",
  "look at that teamwork ✨",
  "my imaginary hat is off to you",
  "the whole room is buzzing 🐝",
  "every little push counts",
  "a very good day for a very loud chat ☀️",
  "rally the blanket brigade",
  "maximum cozy, maximum effort 🧡",
  "keep that momentum rolling",
  "keyboard confetti incoming 🎉",
  "someone pass the victory toast",
  "the suspense is crunchy 🍿",
  "hello from the snack corner",
  "we can hear the other side cheering 👋",
  "a polite but powerful push",
  "this crew has excellent timing ⏱️",
  "cheering with my whole mug ☕",
  "plot twist loading…",
  "the bar is doing a little dance",
  "a spark for the scoreboard ✨",
  "our group project is going great",
  "small messages, big teamwork",
  "keeping the good vibes airborne 🪁",
  "warm-up over, slippers on",
  "a friendly wave across the arena 🌊",
  "the room understood the assignment",
  "that was a beautifully noisy moment",
  "one keyboard joining the chorus 🎶",
  "the comeback committee has arrived",
  "round of applause for both crews 👏",
];

export function syntheticEmote(name: string): string {
  if (name === "CLASH") return "⚡";
  const glyphs = ["✨", "🌊", "☀️", "🔥", "🎉", "🧡"];
  const hash = [...name].reduce((sum, char) => sum + char.codePointAt(0)!, 0);
  return glyphs[hash % glyphs.length];
}

// Private to a simulator instance. No Twitch callback or public HTTP input owns
// a reference to this writer. Never copy raw event text into a display row.
export function createSimulatorDisplay(random: () => number) {
  const rows = emptyDisplayFeed();
  let id = 0;
  const message = (challenge: Challenge) => {
    const candidates = chatter.filter((text) => !isCorrect(challenge, text));
    return candidates[Math.floor(random() * candidates.length)];
  };
  return {
    message,
    record(state: GameState, event: ClashEvent) {
      let kind: DisplayRow["kind"] = "chat";
      // Cosmetic text comes from our own pool, even for a wrong answer. Correct
      // answers are masked before emote/vote rendering can expose their payload.
      let text = event.text ?? "";
      if (event.type === "raid") {
        kind = "raid";
        text = `raided with ${event.amount} viewers`;
      } else if (event.type === "cheer") {
        kind = "cheer";
        text = `cheered ${event.amount}`;
      } else if (event.type === "redemption") {
        kind = "redemption";
        text = "redeemed Reinforcement";
      } else if (isCorrect(state.challenge, text, event.emotes)) {
        kind = "answer";
        text = "✓ answered the flash challenge";
      } else if (state.phase === "verdict") {
        kind = "vote";
        // Only a generated vote command can get here. No raw payload survives.
        const vote = /^!vote (\d+)$/.exec(text);
        text = vote ? `!vote ${vote[1]}` : "cheering for the winning crew";
      } else if (event.emotes?.length) {
        kind = "combo";
        text = event.emotes.map(syntheticEmote).join(" ").repeat(3).trim();
      }
      rows[event.team].push({
        id: ++id,
        team: event.team,
        userName: event.userName,
        kind,
        text,
      });
      rows[event.team] = rows[event.team].slice(-DISPLAY_LIMIT);
    },
    snapshot: (): DisplayFeed => structuredClone(rows),
  };
}
