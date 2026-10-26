import config from "../../data/config.json" with { type: "json" };
import { isCorrect } from "./challenges.js";
import type {
  Challenge,
  ClashEvent,
  GameState,
  Participant,
  Phase,
  Settings,
  Team,
} from "./types.js";
export * from "./types.js";
export * from "./challenges.js";
export { config };
const { timing: t, scoring: s } = config;
const map = <T>(): Record<string, T> =>
  Object.create(null) as Record<string, T>;

export function createGame(
  settings: Settings,
  challenge: Challenge,
): GameState {
  return {
    settings: structuredClone(settings),
    challenge: structuredClone(challenge),
    phase: "idle",
    startedAt: null,
    now: 0,
    scores: { A: 0, B: 0 },
    users: { A: map(), B: map() },
    combos: { A: map(), B: map() },
    challengeProgress: {
      answers: { A: map(), B: map() },
      emotes: { A: map(), B: map() },
      finished: { A: null, B: null },
      firstCorrect: null,
      firstFinisher: null,
      winner: null,
      judged: false,
    },
    winner: null,
    votes: map(),
    penalty: null,
    eventCount: 0,
  };
}

export function startRound(state: GameState, now: number): GameState {
  if (state.phase !== "idle" || !Number.isFinite(now)) return state;
  if (
    !state.settings.approved.A ||
    !state.settings.approved.B ||
    !state.settings.penalties.length
  )
    throw new Error("Both streamers must approve a nonempty safe penalty list");
  return { ...structuredClone(state), phase: "battle", startedAt: now, now };
}

export function phaseAt(elapsed: number): Phase {
  if (elapsed < t.flashStartMs) return "battle";
  if (elapsed < t.flashEndMs) return "flash";
  if (elapsed < t.rushStartMs) return "battle";
  if (elapsed < t.roundMs) return "rush";
  if (elapsed < t.roundMs + t.voteMs) return "verdict";
  return "complete";
}

function award(
  state: GameState,
  team: Team,
  base: number,
  userId?: string,
  multiplier = state.phase === "rush" ? s.rushMultiplier : 1,
) {
  const points = base * multiplier;
  state.scores[team] += points;
  if (userId) state.users[team][userId].points += points;
}

function judge(state: GameState) {
  const p = state.challengeProgress;
  if (p.judged) return;
  if (
    state.challenge.type === "type-race" ||
    state.challenge.type === "emote-target"
  ) {
    p.winner = p.firstFinisher;
  } else {
    const a = Object.values(p.answers.A),
      b = Object.values(p.answers.B);
    if (a.length !== b.length) p.winner = a.length > b.length ? "A" : "B";
    else if (a.length) p.winner = p.firstCorrect;
  }
  p.judged = true;
  if (p.winner) award(state, p.winner, s.challengeBonus, undefined, 1);
}

// Explicit clock makes missed ticks, phase edges and all scoring deterministic.
export function tick(input: GameState, now: number): GameState {
  if (
    input.startedAt === null ||
    ["stopped", "complete"].includes(input.phase) ||
    !Number.isFinite(now) ||
    now < input.now
  )
    return input;
  const state = structuredClone(input);
  state.now = now;
  const elapsed = now - state.startedAt!;
  if (elapsed >= t.flashEndMs) judge(state);
  state.phase = phaseAt(elapsed);
  if (elapsed >= t.roundMs && input.winner === null) {
    state.winner =
      state.scores.A === state.scores.B
        ? null
        : state.scores.A > state.scores.B
          ? "A"
          : "B";
  }
  if (state.phase === "complete" && state.winner) {
    const counts = state.settings.penalties.map(
      (_, i) => Object.values(state.votes).filter((v) => v === i).length,
    );
    const max = Math.max(...counts);
    state.penalty =
      max > 0 ? state.settings.penalties[counts.indexOf(max)] : null;
  }
  return state;
}

export function stopRound(state: GameState, now: number): GameState {
  if (state.startedAt === null || ["complete", "stopped"].includes(state.phase))
    return state;
  return { ...tick(state, now), phase: "stopped" };
}

function participant(state: GameState, event: ClashEvent): Participant {
  let user = state.users[event.team][event.userId];
  if (!Object.hasOwn(state.users[event.team], event.userId)) {
    user = {
      userName: event.userName.slice(0, 40),
      points: 0,
      firstAt: event.ts,
      lastChatAt: null,
      redemptions: 0,
      bits: 0,
      bitsPoints: 0,
    };
    Object.defineProperty(state.users[event.team], event.userId, {
      value: user,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    award(state, event.team, s.firstParticipation, event.userId);
  }
  return user;
}

function recordCombo(state: GameState, event: ClashEvent, emote: string) {
  const teamCombos = state.combos[event.team];
  if (!Object.hasOwn(teamCombos, emote))
    Object.defineProperty(teamCombos, emote, {
      value: map<number>(),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  const members = teamCombos[emote];
  for (const [id, ts] of Object.entries(members))
    if (event.ts - ts > s.comboWindowMs) delete members[id];
  Object.defineProperty(members, event.userId, {
    value: event.ts,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  const ids = Object.keys(members);
  if (ids.length >= s.comboUsers) {
    for (const id of ids)
      award(state, event.team, s.comboBonus / ids.length, id);
    teamCombos[emote] = map(); // A user can count again only in a fresh combo.
  }
}

export function applyEvent(input: GameState, event: ClashEvent): GameState {
  if (
    !["A", "B"].includes(event.team) ||
    !event.userId ||
    !event.userName ||
    !Number.isFinite(event.ts) ||
    event.ts < input.now
  )
    return input;
  if (!["chat", "redemption", "cheer", "raid"].includes(event.type))
    return input;
  const state = tick(input, event.ts);
  if (state.phase === "verdict") {
    if (event.type === "chat" && event.team === state.winner) {
      const match = /^!vote\s+(\d+)\s*$/i.exec(event.text ?? "");
      const index = match ? Number(match[1]) - 1 : -1;
      if (
        index >= 0 &&
        index < state.settings.penalties.length &&
        !Object.hasOwn(state.votes, event.userId)
      )
        Object.defineProperty(state.votes, event.userId, {
          value: index,
          enumerable: true,
        });
    }
    return state;
  }
  if (!["battle", "flash", "rush"].includes(state.phase)) return state;
  if (
    ["cheer", "raid"].includes(event.type) &&
    (!Number.isSafeInteger(event.amount) || event.amount! <= 0)
  )
    return state;
  state.eventCount++;
  if (event.type === "raid") {
    award(
      state,
      event.team,
      Math.min(s.raidMaxPoints, Math.floor(event.amount! / s.raidersPerPoint)),
    );
    return state;
  }
  const user = participant(state, event);
  if (event.type === "redemption") {
    if (user.redemptions < s.redemptionMaxPerUser) {
      user.redemptions++;
      award(state, event.team, s.redemption, event.userId);
    }
  } else if (event.type === "cheer") {
    user.bits = Math.min(
      s.bitsMaxPointsPerUser * s.bitsPerPoint,
      user.bits + event.amount!,
    );
    const points = Math.min(
      s.bitsMaxPointsPerUser,
      Math.floor(user.bits / s.bitsPerPoint),
    );
    award(state, event.team, points - user.bitsPoints, event.userId);
    user.bitsPoints = points;
  } else {
    if (
      user.lastChatAt === null ||
      event.ts - user.lastChatAt >= s.messageCooldownMs
    ) {
      award(state, event.team, s.message, event.userId);
      user.lastChatAt = event.ts;
    }
    for (const emote of [...new Set(event.emotes ?? [])].slice(0, 10))
      recordCombo(state, event, emote);
    if (
      state.phase === "flash" &&
      isCorrect(state.challenge, event.text ?? "", event.emotes)
    ) {
      const p = state.challengeProgress,
        answerMap = p.answers[event.team];
      // Events arrive in monotonic time order. Preserve processing order as the
      // tiebreak when two correct events share a millisecond.
      p.firstCorrect ??= event.team;
      if (!Object.hasOwn(answerMap, event.userId))
        Object.defineProperty(answerMap, event.userId, {
          value: event.ts,
          enumerable: true,
        });
      if (state.challenge.type === "emote-target") {
        const members = p.emotes[event.team];
        for (const [id, ts] of Object.entries(members))
          if (event.ts - ts > s.comboWindowMs) delete members[id];
        Object.defineProperty(members, event.userId, {
          value: event.ts,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        if (
          Object.keys(members).length >= s.challengeEmoteUsers &&
          p.finished[event.team] === null
        ) {
          p.finished[event.team] = event.ts;
          p.firstFinisher ??= event.team;
        }
      } else if (p.finished[event.team] === null) {
        p.finished[event.team] = event.ts;
        p.firstFinisher ??= event.team;
      }
    }
  }
  return state;
}

export function mvps(state: GameState, team: Team) {
  return Object.entries(state.users[team])
    .map(([userId, u]) => ({
      userId,
      userName: u.userName,
      points: u.points,
      firstAt: u.firstAt,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.firstAt - b.firstAt ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    )
    .slice(0, s.mvpCount);
}

// Explicit allowlist: raw messages and accepted answers never leave the engine.
export function publicState(state: GameState) {
  const elapsed =
    state.startedAt === null ? 0 : Math.max(0, state.now - state.startedAt);
  const flashVisible = elapsed >= t.flashStartMs && state.startedAt !== null;
  return {
    phase: state.phase,
    teams: state.settings.teams,
    language: state.settings.language,
    scores: state.scores,
    elapsedMs: Math.min(elapsed, t.roundMs + t.voteMs),
    remainingMs: Math.max(0, t.roundMs - elapsed),
    voteRemainingMs: Math.max(0, t.roundMs + t.voteMs - elapsed),
    multiplier: state.phase === "rush" ? s.rushMultiplier : 1,
    rules: config,
    participants: {
      A: Object.keys(state.users.A).length,
      B: Object.keys(state.users.B).length,
    },
    mvps: { A: mvps(state, "A"), B: mvps(state, "B") },
    challenge: flashVisible
      ? {
          id: state.challenge.id,
          type: state.challenge.type,
          prompt: state.challenge.prompt[state.settings.language],
          emote: state.challenge.emote,
          remainingMs: Math.max(0, t.flashEndMs - elapsed),
          showCard:
            state.phase === "flash" ||
            (state.challengeProgress.judged &&
              elapsed < t.flashEndMs + t.flashResultMs),
          counts: {
            A: Object.keys(state.challengeProgress.answers.A).length,
            B: Object.keys(state.challengeProgress.answers.B).length,
          },
          winner: state.challengeProgress.winner,
          judged: state.challengeProgress.judged,
        }
      : null,
    winner: state.winner,
    penalties: state.settings.penalties,
    votes: state.settings.penalties.map(
      (_, i) => Object.values(state.votes).filter((v) => v === i).length,
    ),
    penalty: state.penalty,
    eventCount: state.eventCount,
  };
}
