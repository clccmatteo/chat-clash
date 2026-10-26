import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEvent,
  config,
  createGame,
  isCorrect,
  mvps,
  normalizeAnswer,
  phaseAt,
  pickChallenge,
  publicState,
  startRound,
  stopRound,
  tick,
} from "../src/game/index.js";
import type {
  Challenge,
  ClashEvent,
  GameState,
  Settings,
} from "../src/game/types.js";

export const settings: Settings = {
  teams: {
    A: { name: "Coral Crew", channel: "coralcrew" },
    B: { name: "Mint Mob", channel: "mintmob" },
  },
  language: "en",
  penalties: ["Wear a silly hat", "Speak like a robot for one minute"],
  approved: { A: true, B: true },
};
export const challenge: Challenge = {
  id: "test",
  type: "trivia",
  prompt: { en: "Name a hot beverage.", it: "Nomina una bevanda calda." },
  answers: ["caffè", "coffee"],
};
const started = (c = challenge) => startRound(createGame(settings, c), 0);
const event = (overrides: Partial<ClashEvent> = {}): ClashEvent => ({
  type: "chat",
  team: "A",
  userId: "u1",
  userName: "viewer1",
  text: "hello",
  ts: 0,
  ...overrides,
});
const send = (g: GameState, overrides: Partial<ClashEvent> = {}) =>
  applyEvent(g, event(overrides));

test("first chat scores 1 + 3; first participation only once and independent per team", () => {
  let g = send(started());
  assert.equal(g.scores.A, 4);
  g = send(g, { ts: 5000 });
  assert.equal(g.scores.A, 5);
  g = send(g, { team: "B", ts: 5000 });
  assert.equal(g.scores.B, 4);
});
test("chat cooldown accepts exactly 5 seconds; spam does not extend cooldown", () => {
  let g = send(started());
  g = send(g, { ts: 4999 });
  assert.equal(g.scores.A, 4);
  g = send(g, { ts: 5000 });
  assert.equal(g.scores.A, 5);
});
test("redemptions award 5, cap at three per user, independent of chat cooldown", () => {
  let g = started();
  for (let i = 0; i < 8; i++) g = send(g, { type: "redemption", ts: i });
  assert.equal(g.scores.A, 18);
  g = send(g, { type: "redemption", userId: "u2", ts: 10 });
  assert.equal(g.scores.A, 26);
});
test("bits accumulate partial hundreds and cap at ten base points per user per round", () => {
  let g = send(started(), { type: "cheer", amount: 99 });
  assert.equal(g.scores.A, 3);
  g = send(g, { type: "cheer", amount: 1, ts: 1 });
  assert.equal(g.scores.A, 4);
  g = send(g, { type: "cheer", amount: 9999, ts: 2 });
  assert.equal(g.scores.A, 13);
  g = send(g, { type: "cheer", amount: 1000, ts: 3 });
  assert.equal(g.scores.A, 13);
});
test("raids round down per ten, cap at fifty per raid, no first-participation bonus", () => {
  let g = send(started(), { type: "raid", amount: 9 });
  assert.equal(g.scores.A, 0);
  g = send(g, { type: "raid", amount: 29, ts: 1 });
  assert.equal(g.scores.A, 2);
  g = send(g, { type: "raid", amount: 9000, ts: 2 });
  assert.equal(g.scores.A, 52);
  assert.equal(mvps(g, "A").length, 0);
});
test("invalid monetary amounts do not score or create participants", () => {
  for (const amount of [-1, 0, NaN, Infinity, 1.5, undefined]) {
    assert.equal(send(started(), { type: "cheer", amount }).scores.A, 0);
    assert.equal(send(started(), { type: "raid", amount }).scores.A, 0);
  }
});
test("combo needs five distinct users, deduplicates repeated emotes, shares credit", () => {
  let g = started();
  for (let i = 0; i < 5; i++)
    g = send(g, { userId: `u${i}`, emotes: ["CLASH", "CLASH"], ts: i });
  assert.equal(g.scores.A, 30); // 5 × (1 + 3) + 10
  assert.ok(Object.values(g.users.A).every((u) => u.points === 6));
  for (let i = 5; i < 10; i++) g = send(g, { emotes: ["CLASH"], ts: i });
  assert.equal(g.scores.A, 30);
});
test("combo window includes 10s edge, expires older users, and is isolated by emote and team", () => {
  let g = started();
  for (let i = 0; i < 4; i++)
    g = send(g, { userId: `u${i}`, emotes: ["CLASH"], ts: 0 });
  const edge = send(g, { userId: "u4", emotes: ["CLASH"], ts: 10000 });
  assert.equal(edge.scores.A, 30);
  g = send(g, { userId: "u4", emotes: ["CLASH"], ts: 10001 });
  assert.equal(g.scores.A, 20);
  g = send(g, { team: "B", emotes: ["CLASH"], ts: 10001 });
  assert.equal(g.scores.B, 4);
  g = send(g, { userId: "u5", emotes: ["HYPE"], ts: 10001 });
  assert.equal(g.scores.A, 24);
});
test("a fresh five-user combo can score again; old users are not reused automatically", () => {
  let g = started();
  for (let n = 0; n < 2; n++)
    for (let i = 0; i < 5; i++)
      g = send(g, { userId: `u${i}`, emotes: ["CLASH"], ts: n * 5000 });
  assert.equal(g.scores.A, 45);
});
test("rush starts at 150s and doubles all awarded points after base caps", () => {
  let g = send(started(), { ts: 149999 });
  assert.equal(g.scores.A, 4);
  g = send(g, { type: "redemption", ts: 150000 });
  assert.equal(g.scores.A, 14);
  g = send(g, { type: "cheer", amount: 10000, ts: 150001 });
  assert.equal(g.scores.A, 34);
  g = send(g, { type: "cheer", amount: 10000, ts: 150002 });
  assert.equal(g.scores.A, 34);
  g = send(g, { type: "raid", amount: 10000, ts: 150003 });
  assert.equal(g.scores.A, 134);
  g = send(g, { userId: "new", ts: 150004 });
  assert.equal(g.scores.A, 142);
});
test("rush doubles combo and message points while preserving first-participation caps", () => {
  let g = started();
  for (let i = 0; i < 5; i++)
    g = send(g, { userId: `u${i}`, emotes: ["CLASH"], ts: 150000 });
  assert.equal(g.scores.A, 60);
});
test("normalization handles case, accents, unicode and spaces; exact punctuation is retained", () => {
  assert.equal(normalizeAnswer(" CÀF FÈ\t"), "caffe");
  assert.ok(isCorrect(challenge, "CAF FE"));
  assert.ok(!isCorrect(challenge, "coffee!"));
  for (const type of ["anagram", "math", "type-race"] as const)
    assert.ok(isCorrect({ ...challenge, type, answers: ["42"] }, " 4 2 "));
});
test("flash window is inclusive at 90s and exclusive at 120s; answers counted once per user", () => {
  let g = send(started(), { ts: 89999, text: "coffee" });
  assert.equal(Object.keys(g.challengeProgress.answers.A).length, 0);
  g = send(g, { ts: 90000, text: "wrong" });
  g = send(g, { ts: 90001, text: "COFFEE" });
  g = send(g, { ts: 90002, text: "coffee" });
  assert.equal(Object.keys(g.challengeProgress.answers.A).length, 1);
  g = send(g, { team: "B", ts: 120000, text: "coffee" });
  assert.equal(Object.keys(g.challengeProgress.answers.B).length, 0);
  assert.equal(g.challengeProgress.winner, "A");
});
test("majority of distinct correct users wins trivia, math and anagrams; +25 only once", () => {
  for (const type of ["trivia", "math", "anagram"] as const) {
    let g = send(started({ ...challenge, type }), {
      team: "B",
      ts: 90000,
      text: "coffee",
    });
    for (let i = 0; i < 2; i++)
      g = send(g, { userId: `a${i}`, ts: 90001 + i, text: "coffee" });
    const before = g.scores.A;
    g = tick(g, 120000);
    assert.equal(g.challengeProgress.winner, "A");
    assert.equal(g.scores.A, before + 25);
    assert.equal(tick(g, 130000).scores.A, g.scores.A);
  }
});
test("challenge ties use the first correct event, including identical timestamps; no answers draw", () => {
  let g = send(started(), { team: "B", ts: 90000, text: "coffee" });
  g = send(g, { ts: 90001, text: "coffee" });
  assert.equal(tick(g, 120000).challengeProgress.winner, "B");
  assert.equal(tick(started(), 120000).challengeProgress.winner, null);
  let tied = send(started(), { ts: 90000, text: "coffee" });
  tied = send(tied, { team: "B", ts: 90000, text: "coffee" });
  assert.equal(tick(tied, 120000).challengeProgress.winner, "A");
});
test("type-race awards the first correct finisher even against a later majority", () => {
  let g = send(started({ ...challenge, type: "type-race" }), {
    team: "B",
    ts: 90000,
    text: "coffee",
  });
  for (let i = 0; i < 5; i++)
    g = send(g, { userId: `a${i}`, ts: 90001 + i, text: "coffee" });
  assert.equal(tick(g, 120000).challengeProgress.winner, "B");
});
test("race and emote completions in the same millisecond use event arrival order", () => {
  let race = send(started({ ...challenge, type: "type-race" }), {
    team: "B",
    ts: 90000,
    text: "coffee",
  });
  race = send(race, { ts: 90000, text: "coffee" });
  assert.equal(tick(race, 120000).challengeProgress.winner, "B");
  let emote = started({
    ...challenge,
    type: "emote-target",
    emote: "CLASH",
    answers: [],
  });
  for (const team of ["B", "A"] as const)
    for (let i = 0; i < 10; i++)
      emote = send(emote, {
        team,
        userId: `${team}${i}`,
        ts: 90000,
        emotes: ["CLASH"],
      });
  assert.equal(tick(emote, 120000).challengeProgress.winner, "B");
});
test("emote-target requires actual emote metadata and ten distinct users in ten seconds", () => {
  const c: Challenge = {
    ...challenge,
    type: "emote-target",
    emote: "CLASH",
    answers: [],
  };
  let g = send(started(c), { text: "CLASH", ts: 90000 });
  assert.equal(Object.keys(g.challengeProgress.answers.A).length, 0);
  for (let i = 0; i < 10; i++)
    g = send(g, { userId: `a${i}`, emotes: ["CLASH"], ts: 90000 + i });
  for (let i = 0; i < 12; i++)
    g = send(g, {
      team: "B",
      userId: `b${i}`,
      emotes: ["CLASH"],
      ts: 91000 + i,
    });
  assert.equal(tick(g, 120000).challengeProgress.winner, "A");
  let failed = started(c);
  for (let i = 0; i < 10; i++)
    failed = send(failed, {
      userId: `a${i}`,
      emotes: ["CLASH"],
      ts: 90000 + i * 2000,
    });
  assert.equal(tick(failed, 120000).challengeProgress.winner, null);
});
test("all phase boundaries and skipped ticks resolve correctly; flash bonus is never doubled", () => {
  for (const [time, phase] of [
    [0, "battle"],
    [89999, "battle"],
    [90000, "flash"],
    [119999, "flash"],
    [120000, "battle"],
    [150000, "rush"],
    [180000, "verdict"],
    [210000, "complete"],
  ] as const)
    assert.equal(tick(started(), time).phase, phase);
  let g = send(started(), { ts: 90000, text: "coffee" });
  const before = g.scores.A;
  g = tick(g, 210000);
  assert.equal(g.scores.A, before + 25);
  assert.equal(g.winner, "A");
  assert.equal(phaseAt(config.timing.roundMs), "verdict");
});
test("round end freezes scores and votes accept one vote per winning-team user only", () => {
  let g = send(started());
  g = send(g, { ts: 180000, text: "!vote 2" });
  assert.equal(g.scores.A, 4);
  g = send(g, { ts: 180001, text: "!vote 1" });
  g = send(g, { team: "B", userId: "b", ts: 180002, text: "!vote 1" });
  g = send(g, { userId: "late", ts: 210000, text: "!vote 1" });
  assert.deepEqual(Object.values(g.votes), [1]);
  assert.equal(g.penalty, settings.penalties[1]);
});
test("draw has no penalty vote; no votes means no penalty; tied votes choose first listed option", () => {
  assert.equal(tick(started(), 210000).winner, null);
  assert.equal(tick(send(started()), 210000).penalty, null);
  let g = send(started());
  g = send(g, { ts: 180000, text: "!vote 2" });
  g = send(g, { userId: "u2", ts: 180001, text: "!vote 1" });
  assert.equal(tick(g, 210000).penalty, settings.penalties[0]);
});
test("idle, stopped, complete and stale events never score; reset uses fresh state", () => {
  const idle = createGame(settings, challenge);
  assert.equal(send(idle).scores.A, 0);
  let g = stopRound(send(started()), 100);
  assert.equal(send(g, { ts: 200 }).scores.A, 4);
  g = tick(started(), 210000);
  assert.equal(send(g, { ts: 220000 }).scores.A, 0);
  g = send(started(), { ts: 100 });
  assert.equal(send(g, { ts: 99 }), g);
  assert.equal(createGame(settings, challenge).scores.A, 0);
});
test("engine does not mutate prior state or caller settings", () => {
  const before = started();
  const snapshot = structuredClone(before);
  send(before);
  assert.deepEqual(before, snapshot);
  const copy = createGame(settings, challenge);
  copy.settings.penalties[0] = "changed";
  assert.notEqual(settings.penalties[0], "changed");
});
test("both streamers must approve penalties; a running round cannot restart", () => {
  assert.throws(() =>
    startRound(
      createGame({ ...settings, approved: { A: true, B: false } }, challenge),
      0,
    ),
  );
  assert.throws(() =>
    startRound(createGame({ ...settings, penalties: [] }, challenge), 0),
  );
  const g = started();
  assert.equal(startRound(g, 42), g);
});
test("MVPs track all user awards, sort by points, and return top three per team", () => {
  let g = started();
  for (let i = 0; i < 6; i++)
    g = send(g, { userId: `u${i}`, userName: `viewer${i}`, ts: i });
  g = send(g, { type: "redemption", userId: "u5", ts: 10 });
  assert.deepEqual(
    mvps(g, "A").map((u) => u.userId),
    ["u5", "u0", "u1"],
  );
  assert.equal(mvps(g, "B").length, 0);
});
test("challenge selection is deterministic, avoids repeats and resets exhausted pool", () => {
  const cs = [challenge, { ...challenge, id: "second" }];
  assert.equal(pickChallenge(cs, 1).id, "second");
  assert.equal(pickChallenge(cs, 0, ["test"]).id, "second");
  assert.equal(pickChallenge(cs, 0, ["test", "second"]).id, "test");
  assert.throws(() => pickChallenge([], 0));
});
test("public snapshot excludes messages, accepted answers, unrevealed challenge and internal identities", () => {
  let g = send(started(), { text: "PRIVATE MESSAGE" });
  assert.equal(publicState(g).challenge, null);
  g = tick(g, 90000);
  const json = JSON.stringify(publicState(g));
  assert.ok(!json.includes("PRIVATE MESSAGE"));
  assert.ok(!json.includes("coffee"));
  assert.ok(!json.includes("lastChatAt"));
});
test("prototype-like user and emote identifiers remain safe data keys", () => {
  const g = send(started(), { userId: "__proto__", emotes: ["__proto__"] });
  assert.equal(g.scores.A, 4);
  assert.equal(mvps(g, "A")[0].userId, "__proto__");
});
