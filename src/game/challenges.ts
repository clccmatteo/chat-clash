import type { Challenge } from "./types.js";

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/\s/gu, "");
}

export function isCorrect(
  challenge: Challenge,
  text: string,
  emotes: string[] = [],
): boolean {
  if (challenge.type === "emote-target")
    return emotes.includes(challenge.emote ?? "");
  return challenge.answers.some(
    (answer) => normalizeAnswer(answer) === normalizeAnswer(text),
  );
}

// Deterministic selection. The caller supplies entropy; no random I/O in game/.
export function pickChallenge(
  challenges: Challenge[],
  seed: number,
  previousIds: string[] = [],
): Challenge {
  if (!challenges.length) throw new Error("Challenge library is empty");
  const unused = challenges.filter((c) => !previousIds.includes(c.id));
  const pool = unused.length ? unused : challenges;
  return structuredClone(pool[Math.abs(Math.trunc(seed)) % pool.length]);
}
