import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { randomInt } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  applyEvent,
  config,
  createGame,
  pickChallenge,
  publicState,
  startRound,
  stopRound,
  tick,
} from "./game/index.js";
import type { Challenge, ClashEvent, Settings } from "./game/types.js";
import { createSimulator } from "./sim/index.js";
import { emptyDisplayFeed } from "./sim/display.js";
import { TwitchManager, type TwitchOptions } from "./twitch/manager.js";
import { TwitchError } from "./twitch/runtime.js";
import { roundAnnouncements } from "./twitch/announcements.js";

const library = JSON.parse(
  readFileSync(new URL("../data/challenges.json", import.meta.url), "utf8"),
) as Challenge[];
const safePenalties = JSON.parse(
  readFileSync(new URL("../data/penalties.json", import.meta.url), "utf8"),
) as string[];
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const defaults: Settings = {
  teams: {
    A: { name: "Coral Crew", channel: "coralcrew" },
    B: { name: "Mint Mob", channel: "mintmob" },
  },
  language: "en",
  penalties: safePenalties.slice(0, 3),
  approved: { A: false, B: false },
};
const active = (phase: string) =>
  ["battle", "flash", "rush", "verdict"].includes(phase);
class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== "object")
    throw new RequestError("Match settings are required");
  const raw = value as Settings;
  const result = structuredClone(defaults);
  for (const team of ["A", "B"] as const) {
    const data = raw.teams?.[team];
    if (
      !data ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.trim().length > 32
    )
      throw new RequestError("Team names must be 1–32 characters");
    if (
      typeof data.channel !== "string" ||
      !/^[a-zA-Z0-9_]{1,25}$/.test(data.channel)
    )
      throw new RequestError(
        "Channel names must use 1–25 letters, numbers or underscores",
      );
    result.teams[team] = {
      name: data.name.trim(),
      channel: data.channel.toLowerCase(),
    };
    result.approved[team] = raw.approved?.[team] === true;
  }
  if (!["en", "it"].includes(raw.language))
    throw new RequestError("Choose English or Italian");
  result.language = raw.language;
  if (result.teams.A.channel === result.teams.B.channel)
    throw new RequestError("The two Twitch channels must be different");
  if (
    !Array.isArray(raw.penalties) ||
    raw.penalties.length < 1 ||
    raw.penalties.length > safePenalties.length ||
    raw.penalties.some((p) => !safePenalties.includes(p)) ||
    new Set(raw.penalties).size !== raw.penalties.length
  )
    throw new RequestError(
      "Choose at least one penalty from the safe, voluntary list",
    );
  result.penalties = [...raw.penalties];
  return result;
}

function trustedRequest(req: IncomingMessage): boolean {
  try {
    const base = new URL(`http://${req.headers.host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
      return false;
    return (
      !req.headers.origin || new URL(req.headers.origin).origin === base.origin
    );
  } catch {
    return false;
  }
}

async function body(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new RequestError("Send application/json", 415);
  let size = 0,
    result = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new RequestError("Request is too large", 413);
    result += chunk.toString();
  }
  try {
    return JSON.parse(result) as Record<string, unknown>;
  } catch {
    throw new RequestError("Invalid JSON");
  }
}

export function createClashServer(
  options: { autoTick?: boolean; twitch?: false | Partial<TwitchOptions> } = {},
) {
  let settings = structuredClone(defaults);
  settings.teams.A.channel = (
    process.env.TWITCH_TEAM_A_LOGIN || settings.teams.A.channel
  ).toLowerCase();
  settings.teams.B.channel = (
    process.env.TWITCH_TEAM_B_LOGIN || settings.teams.B.channel
  ).toLowerCase();
  if (options.twitch)
    for (const team of ["A", "B"] as const)
      settings.teams[team].channel =
        options.twitch.teamLogins?.[team] ?? settings.teams[team].channel;
  settings = validateSettings(settings);
  let state = createGame(
    settings,
    pickChallenge(library, randomInt(library.length)),
  );
  const wallNow = () =>
    options.twitch && options.twitch.clock
      ? options.twitch.clock.now()
      : Date.now();
  let virtualNow = wallNow(),
    speed = 1,
    simulator: ReturnType<typeof createSimulator> | null = null;
  let usedChallenges: string[] = [];
  let displayFeed = emptyDisplayFeed();
  let mode: "idle" | "live" | "simulator" = "idle",
    roundId = 0,
    liveStartedAt = 0;
  let logId = 0;
  const logs: {
    id: number;
    ts: number;
    kind: string;
    text: string;
    team?: string;
  }[] = [];
  const log = (kind: string, text: string, team?: string) => {
    logs.push({ id: ++logId, ts: virtualNow, kind, text, team });
    if (logs.length > 60) logs.shift();
  };
  log("system", "Arena ready. Connect Twitch or start the simulator.");
  const snapshot = () => ({
    type: "state",
    game: publicState(state),
    settings,
    logs,
    simulator: !!simulator,
    speed,
    safePenalties,
    mode,
    demoRound: roundId,
    demoFeed:
      mode === "simulator" ? structuredClone(displayFeed) : emptyDisplayFeed(),
    twitch: twitch.status(),
  });
  const broadcast = () => {
    const payload = JSON.stringify(snapshot());
    for (const socket of wss.clients)
      if (socket.readyState === WebSocket.OPEN) {
        if (socket.bufferedAmount > 1024 * 1024) socket.terminate();
        else socket.send(payload);
      }
  };
  const announcePhase = (previous: string) => {
    if (state.phase === previous) return;
    const phase = state.phase;
    if (previous === "flash" && state.challengeProgress.judged)
      log(
        "challenge",
        state.challengeProgress.winner
          ? `${settings.teams[state.challengeProgress.winner].name} wins the flash challenge · +${config.scoring.challengeBonus}`
          : "Flash challenge drawn. No bonus awarded.",
      );
    log(
      "phase",
      phase === "flash"
        ? `FLASH · ${state.challenge.prompt[settings.language]}`
        : phase === "rush"
          ? "FINAL RUSH · All points ×2 for the last 30 seconds!"
          : phase === "verdict"
            ? state.winner
              ? `${settings.teams[state.winner].name} wins! Winning chat: vote with !vote 1, !vote 2…`
              : "A draw! No penalty this round."
            : phase === "complete"
              ? state.penalty
                ? `Selected penalty: ${state.penalty}. Participation is voluntary.`
                : "Round complete. No penalty selected."
              : "Battle is on. Every voice counts.",
    );
    if (mode === "live") {
      const id = roundId,
        phase = state.phase;
      for (const announcement of roundAnnouncements(state, previous))
        void twitch
          .sendSystemMessage(
            announcement.team,
            announcement.text,
            () => roundId === id && mode === "live" && state.phase === phase,
          )
          .catch(() =>
            log(
              "twitch",
              `Team ${announcement.team}: system announcement was not delivered. Check Twitch chat restrictions and connection status.`,
            ),
          );
    }
  };
  const ingest = (event: ClashEvent) => {
    const previous = state.phase,
      score = state.scores[event.team];
    state = applyEvent(state, event);
    announcePhase(previous);
    const delta = state.scores[event.team] - score;
    if (event.type !== "chat" || delta > 0)
      log(
        event.type,
        `${event.userName.slice(0, 40)} · ${event.type === "redemption" ? "Reinforcement" : event.type === "raid" ? `${event.amount} raiders` : event.type === "cheer" ? `${event.amount} bits` : "participated"}${delta ? ` · +${delta}` : " · cap reached"}`,
        event.team,
      );
  };
  const advance = (realDeltaMs: number, push = true) => {
    let delta = Math.max(0, realDeltaMs * speed);
    while (delta > 0) {
      const step = Math.min(250, delta);
      delta -= step;
      virtualNow += step;
      const previous = state.phase;
      state = tick(state, virtualNow);
      announcePhase(previous);
      if (simulator) {
        for (const event of simulator(state, virtualNow)) ingest(event);
        displayFeed = simulator.displayFeed();
      }
      if (state.phase === "complete") {
        simulator = null;
        speed = 1;
        break;
      }
    }
    if (push) broadcast();
  };
  const twitch = new TwitchManager(
    {
      clientId:
        options.twitch === false ? "" : (process.env.TWITCH_CLIENT_ID ?? ""),
      tokenFile: process.env.TWITCH_TOKEN_FILE || ".local/twitch-tokens.json",
      teamLogins: { A: settings.teams.A.channel, B: settings.teams.B.channel },
      botLogin: process.env.TWITCH_BOT_LOGIN?.toLowerCase() || "",
      ...(options.twitch || {}),
    },
    {
      canChange: () => !active(state.phase),
      onIssue: (message) => log("twitch", message),
      onEvent: (event) => {
        if (
          mode !== "live" ||
          !active(state.phase) ||
          event.providerTs < liveStartedAt
        )
          return;
        synchronize();
        ingest({ ...event, ts: virtualNow });
      },
      onChange: () => {
        if (mode === "live" && active(state.phase) && !twitch.status().ready) {
          const previous = state.phase;
          state = stopRound(state, virtualNow);
          log(
            "twitch",
            "Live round stopped because a Twitch chat connection was lost. Reconnect, then start a new round.",
          );
          announcePhase(previous);
        }
        broadcast();
      },
    },
  );
  const command = async (data: Record<string, unknown>) => {
    const action = data.action;
    if (action === "stop") {
      const previous = state.phase;
      state = stopRound(state, virtualNow);
      simulator = null;
      speed = 1;
      log("system", "Round stopped. Reset or start a new round.");
      announcePhase(previous);
      return;
    }
    if (action === "reset") {
      roundId++;
      mode = "idle";
      state = createGame(
        settings,
        pickChallenge(library, randomInt(library.length), usedChallenges),
      );
      simulator = null;
      speed = 1;
      log("system", "Arena reset. Scores and votes cleared.");
      return;
    }
    if (!["configure", "start", "start-simulator"].includes(String(action)))
      throw new RequestError("Unknown control action");
    if (active(state.phase))
      throw new RequestError(
        "Stop or finish the current round before changing match settings",
        409,
      );
    const nextSettings = validateSettings(data.settings);
    if (twitch.status().pendingRoles.length)
      throw new RequestError(
        "Finish or cancel Twitch authorization before starting or configuring a round",
      );
    const botLogin =
      data.botLogin ??
      (twitch.status().bot.followsTeamA ? "" : twitch.status().bot.login);
    if (typeof botLogin !== "string")
      throw new RequestError("Bot login must be text");
    if (action === "configure")
      await twitch.configure(
        { A: nextSettings.teams.A.channel, B: nextSettings.teams.B.channel },
        botLogin.toLowerCase(),
      );
    if (
      action === "start" &&
      (!twitch.status().ready ||
        (["A", "B"] as const).some(
          (team) =>
            twitch.status().teams[team].login !==
            nextSettings.teams[team].channel,
        ) ||
        botLogin !==
          (twitch.status().bot.followsTeamA ? "" : twitch.status().bot.login))
    )
      throw new RequestError(
        "Save the settings, authorize both broadcasters and the bot, and wait for both chats to connect before starting a live round",
      );
    const nextSpeed = data.speed ?? 1;
    const challengeType = data.challengeType ?? "";
    if (
      typeof challengeType !== "string" ||
      !["", "trivia", "anagram", "math", "type-race", "emote-target"].includes(
        challengeType,
      )
    )
      throw new RequestError("Choose a valid flash challenge type");
    if (action === "start-simulator" && ![1, 4, 12].includes(Number(nextSpeed)))
      throw new RequestError("Choose 1×, 4× or 12× simulator speed");
    const pool = library.filter(
      (c) =>
        (!challengeType || c.type === challengeType) &&
        !(
          action === "start" &&
          !twitch.status().emoteTargetsReady &&
          c.type === "emote-target"
        ),
    );
    if (!pool.length)
      throw new RequestError(
        "Global emotes are not loaded yet. Reconnect Twitch or choose a text challenge.",
      );
    let challenge = pickChallenge(
      pool,
      randomInt(library.length),
      usedChallenges,
    );
    if (action === "start")
      challenge = twitch.prepareChallenge(challenge, randomInt(1000000));
    let next = createGame(nextSettings, challenge);
    if (action !== "configure") {
      try {
        if (action === "start-simulator")
          next.settings.approved = { A: true, B: true }; // Explicitly demo approvals only.
        next = startRound(next, virtualNow);
      } catch (e) {
        throw new RequestError((e as Error).message);
      }
      usedChallenges.push(challenge.id);
      if (usedChallenges.length >= library.length) usedChallenges = [];
    }
    settings = nextSettings;
    state = next;
    displayFeed = emptyDisplayFeed();
    roundId++;
    mode =
      action === "start"
        ? "live"
        : action === "start-simulator"
          ? "simulator"
          : "idle";
    if (mode === "live") liveStartedAt = wallNow();
    simulator = action === "start-simulator" ? createSimulator(42) : null;
    speed = simulator ? Number(nextSpeed) : 1;
    log(
      "system",
      action === "configure"
        ? "Match settings saved."
        : simulator
          ? `Demo started at ${speed}×. Approvals are simulated; no Twitch messages are sent.`
          : "Live round started. Both Twitch chats are scoring.",
    );
    if (action !== "configure") announcePhase("idle");
  };
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    );
    try {
      if (!trustedRequest(req))
        throw new RequestError("Local same-origin access only", 403);
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname === "/api/control" && req.method === "POST") {
        const data = await body(req);
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new RequestError("Expected a command object");
        synchronize();
        await command(data);
        broadcast();
        return json(res, 200, snapshot());
      }
      if (url.pathname === "/api/twitch/device" && req.method === "GET")
        return json(res, 200, { authorizations: twitch.deviceStatus() });
      if (url.pathname === "/api/twitch" && req.method === "POST") {
        const data = await body(req);
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new RequestError("Expected a Twitch command object");
        const role = data.role;
        if (data.action === "reconnect") await twitch.reconnect();
        else if (["A", "B", "bot"].includes(String(role))) {
          const selected = role as "A" | "B" | "bot";
          if (data.action === "authorize") await twitch.authorize(selected);
          else if (data.action === "cancel")
            twitch.cancelAuthorization(selected);
          else if (data.action === "disconnect")
            await twitch.disconnect(selected);
          else if (
            data.action === "map-reward" &&
            selected !== "bot" &&
            typeof data.rewardId === "string"
          )
            await twitch.mapReward(selected, data.rewardId);
          else throw new RequestError("Unknown Twitch action");
        } else throw new RequestError("Choose Team A, Team B or bot");
        broadcast();
        return json(res, 200, {
          authorizations: twitch.deviceStatus(),
          twitch: twitch.status(),
        });
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new RequestError("Method not allowed", 405);
      if (url.pathname === "/api/state") return json(res, 200, snapshot());
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (url.pathname === "/") {
        res.writeHead(302, { Location: "/control/" });
        res.end();
        return;
      }
      if (["/overlay", "/control", "/showcase"].includes(url.pathname)) {
        res.writeHead(302, { Location: `${url.pathname}/` });
        res.end();
        return;
      }
      let relative = decodeURIComponent(url.pathname).slice(1);
      if (relative.endsWith("/")) relative += "index.html";
      const path = resolve(publicDir, relative);
      if (
        !path.startsWith(publicDir.endsWith(sep) ? publicDir : publicDir + sep)
      )
        throw new RequestError("Not found", 404);
      let file: Buffer;
      try {
        file = await readFile(path);
      } catch {
        throw new RequestError("Not found", 404);
      }
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".svg": "image/svg+xml",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : file);
    } catch (e) {
      const error =
        e instanceof RequestError
          ? e
          : e instanceof TwitchError
            ? new RequestError(e.message, 400)
            : new RequestError("Internal server error", 500);
      if (error.status === 500) console.error(e);
      json(res, error.status, { error: error.message });
    }
  });
  server.requestTimeout = 10000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on("upgrade", (req, socket, head) => {
    if (!trustedRequest(req) || req.url !== "/ws") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (socket) => {
    socket.on("error", () => socket.terminate());
    socket.send(JSON.stringify(snapshot()));
    // Read-only clients: all control mutations go through validated same-origin HTTP.
  });
  let lastWall = performance.now();
  const synchronize = () => {
    if (options.autoTick === false) return;
    const now = performance.now(),
      delta = now - lastWall;
    lastWall = now;
    advance(delta, false);
  };
  const interval =
    options.autoTick === false
      ? null
      : setInterval(() => {
          const now = performance.now();
          const delta = now - lastWall;
          lastWall = now;
          advance(delta);
        }, 250);
  interval?.unref();
  const close = async () => {
    if (interval) clearInterval(interval);
    roundId++;
    mode = "idle";
    await ready;
    await twitch.close();
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((r) => wss.close(() => r()));
    if (server.listening)
      await new Promise<void>((r, reject) =>
        server.close((e) => (e ? reject(e) : r())),
      );
  };
  const ready = twitch.initialize();
  return { server, advance, close, snapshot, ready };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const host = process.env.HOST ?? "127.0.0.1",
    port = Number(process.env.PORT ?? 3000);
  if (!["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("Chat Clash supports loopback HOST values only");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be 1–65535");
  const app = createClashServer();
  app.server.listen(port, host, () =>
    console.log(
      `CHAT CLASH\nControl: http://${host === "::1" ? "[::1]" : host}:${port}/control/\nOBS:     http://${host === "::1" ? "[::1]" : host}:${port}/overlay/ (1920×1080)`,
    ),
  );
  app.server.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
    void app.close();
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
