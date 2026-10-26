import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createClashServer } from "../src/server.js";
import { CHAT, CHEER, REDEMPTION } from "../src/twitch/normalize.js";
import { chatEvent, drain } from "./twitch-helpers.js";
import { MockTwitch, eventually } from "./twitch-mock.js";
import { roundAnnouncements } from "../src/twitch/announcements.js";
import { ChatOutbox } from "../src/twitch/outbox.js";
import { FakeClock } from "./twitch-helpers.js";
import { config, createGame, startRound, tick } from "../src/game/index.js";
import type { Challenge } from "../src/game/types.js";

async function harness(botLogin = "", nonAffiliate = false) {
  await mkdir(resolve(".local"), { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(resolve(".local/test-")),
    mock = new MockTwitch();
  if (nonAffiliate) mock.users.alpha.broadcaster_type = "";
  const tokenFile = join(dir, "tokens.json");
  const app = createClashServer({
    autoTick: false,
    twitch: {
      clientId: "publicclient123",
      tokenFile,
      teamLogins: { A: "alpha", B: "beta" },
      botLogin,
      http: mock.http,
      clock: mock.clock,
      socketFactory: mock.socketFactory,
    },
  });
  await app.ready;
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, data: unknown) => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { status: response.status, data: await response.json() };
  };
  const authorize = async (role: "A" | "B" | "bot", login: string) => {
    mock.nextLogin = login;
    const result = await post("/api/twitch", { action: "authorize", role });
    assert.equal(result.status, 200);
    assert.ok(!JSON.stringify(app.snapshot()).includes("USERCODE"));
    assert.ok(!JSON.stringify(app.snapshot()).includes("secret-device"));
    await mock.clock.advance(5000);
    await eventually(() => app.snapshot().twitch.pendingRoles.length === 0);
    return result;
  };
  const step = async (ms: number) => {
    for (let remaining = ms; remaining > 0;) {
      const delta = Math.min(1000, remaining);
      remaining -= delta;
      mock.keepalive();
      await mock.clock.advance(delta);
      app.advance(delta);
      await drain();
    }
  };
  return {
    app,
    mock,
    post,
    authorize,
    step,
    base,
    tokenFile,
    cleanup: async () => {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("two broadcasters authorize once; live EventSub scoring, dedup, reward IDs, challenge/vote chat posts and simulator isolation work end to end", async () => {
  const h = await harness();
  try {
    await h.authorize("A", "alpha");
    await h.authorize("B", "beta");
    await eventually(() => h.app.snapshot().twitch.ready);
    const status = h.app.snapshot().twitch;
    assert.equal(status.teams.A.channelPoints, "enabled");
    assert.equal(status.teams.B.channelPoints, "unsupported");
    assert.equal(status.teams.B.bits, "unsupported");
    assert.equal(
      h.mock.requests.filter((r) => r.url.endsWith("/device")).length,
      2,
    );
    assert.ok(
      h.mock.requests
        .filter((r) => r.url.endsWith("/device"))
        .every((r) => r.body.scopes.includes("channel:bot")),
    );
    assert.equal(h.mock.sockets.filter((s) => !s.socket.closed).length, 1); // Shared principal groups share one connection.
    const settings = {
      ...h.app.snapshot().settings,
      approved: { A: true, B: true },
    };
    assert.equal(
      (await h.post("/api/control", { action: "start", settings })).status,
      200,
    );
    await drain();
    assert.equal(h.app.snapshot().game.eventCount, 0); // The bot's echoed start messages cannot score.
    const raw = "PRIVATE CHAT MUST NOT BE BROADCAST";
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({ message: { text: raw, fragments: [] } }),
      "duplicate-envelope",
    );
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({ message: { text: raw, fragments: [] } }),
      "duplicate-envelope",
    );
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({ message: { text: raw, fragments: [] } }),
      "different-envelope-same-native-id",
    );
    assert.equal(h.app.snapshot().game.scores.A, 4);
    h.mock.emit("100", REDEMPTION, {
      id: "redemption-1",
      user_id: "300",
      user_name: "Viewer",
      reward: { id: "wrong", title: "Reinforcement" },
    });
    assert.equal(h.app.snapshot().game.scores.A, 4);
    h.mock.emit("100", REDEMPTION, {
      id: "redemption-1",
      user_id: "300",
      user_name: "Viewer",
      reward: { id: "reward-1" },
    });
    h.mock.emit("100", REDEMPTION, {
      id: "redemption-1",
      user_id: "300",
      user_name: "Viewer",
      reward: { id: "reward-1" },
    });
    assert.equal(h.app.snapshot().game.scores.A, 9);
    h.mock.emit("100", CHEER, {
      user_id: "300",
      user_name: "Viewer",
      bits: 100,
    });
    assert.equal(h.app.snapshot().game.scores.A, 10);
    assert.equal(h.app.snapshot().mode, "live");
    assert.deepEqual(h.app.snapshot().demoFeed, { A: [], B: [] });
    assert.ok(!JSON.stringify(h.app.snapshot()).includes(raw));
    assert.ok(!JSON.stringify(h.app.snapshot()).includes("private-access"));
    await h.step(90000);
    assert.equal(h.app.snapshot().game.phase, "flash");
    const c = h.app.snapshot().game.challenge!;
    const library = JSON.parse(
      await readFile(
        new URL("../data/challenges.json", import.meta.url),
        "utf8",
      ),
    ) as Challenge[];
    const answer = library.find((item) => item.id === c.id)!.answers[0];
    for (let i = 0; i < 10; i++)
      h.mock.emit(
        "100",
        CHAT,
        chatEvent({
          chatter_user_id: String(400 + i),
          chatter_user_name: `Correct${i}`,
          message_id: `answer-${i}`,
          message: {
            text: answer ?? "Kappa",
            fragments:
              c.type === "emote-target"
                ? [{ type: "emote", text: "Kappa", emote: { id: "25" } }]
                : [],
          },
        }),
      );
    const beforeBonus = h.app.snapshot().game.scores.A;
    await h.step(30000);
    assert.equal(h.app.snapshot().game.scores.A, beforeBonus + 25);
    assert.ok(
      h.mock.sent.some(
        (s) =>
          s.message.includes("FLASH CHALLENGE") && s.broadcaster_id === "100",
      ),
    );
    assert.ok(
      h.mock.sent.some(
        (s) =>
          s.message.includes("FLASH CHALLENGE") && s.broadcaster_id === "200",
      ),
    );
    await h.step(30000);
    const rushBefore = h.app.snapshot().game.scores.A;
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({
        chatter_user_id: "900",
        message_id: "rush",
        chatter_user_name: "RushViewer",
      }),
    );
    assert.equal(h.app.snapshot().game.scores.A, rushBefore + 8);
    await h.step(30000);
    assert.equal(h.app.snapshot().game.phase, "verdict");
    const frozen = h.app.snapshot().game.scores.A;
    h.mock.emit(
      "200",
      CHAT,
      chatEvent({
        chatter_user_id: "999",
        message_id: "losing-vote",
        message: { text: "!vote 1", fragments: [] },
      }),
    );
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({
        message_id: "vote",
        message: { text: "!vote 2", fragments: [] },
      }),
    );
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({
        message_id: "revote",
        message: { text: "!vote 1", fragments: [] },
      }),
    );
    assert.deepEqual(h.app.snapshot().game.votes, [0, 1, 0]);
    assert.equal(h.app.snapshot().game.scores.A, frozen);
    await h.step(30000);
    assert.equal(h.app.snapshot().game.penalty, settings.penalties[1]);
    assert.ok(
      h.mock.sent.some(
        (s) => s.message.includes("!vote 1:") && s.broadcaster_id === "100",
      ),
    );
    assert.ok(
      !h.mock.sent.some(
        (s) => s.message.includes("!vote 1:") && s.broadcaster_id === "200",
      ),
    );
    assert.ok(
      h.mock.sent.every(
        (s) => s.message.length <= 500 && s.sender_id === "100",
      ),
    );
    assert.equal(
      (await h.post("/api/control", { action: "reset" })).status,
      200,
    );
    const sent = h.mock.sent.length;
    assert.equal(
      (await h.post("/api/control", { action: "start-simulator", settings }))
        .status,
      200,
    );
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({
        message_id: "ignore-during-sim",
        chatter_user_name: "PRIVATE_LIVE_NAME",
        message: { text: raw, fragments: [] },
      }),
    );
    assert.equal(h.app.snapshot().game.eventCount, 0);
    assert.deepEqual(h.app.snapshot().demoFeed, { A: [], B: [] });
    await h.step(1000);
    assert.ok(!JSON.stringify(h.app.snapshot().demoFeed).includes(raw));
    assert.ok(
      !JSON.stringify(h.app.snapshot().demoFeed).includes("PRIVATE_LIVE_NAME"),
    );
    assert.equal(h.mock.sent.length, sent);
    assert.ok(h.app.snapshot().demoFeed.A.length > 0);
    await h.post("/api/control", { action: "reset" });
    assert.deepEqual(h.app.snapshot().demoFeed, { A: [], B: [] });
    await h.post("/api/control", { action: "start", settings });
    h.mock.emit(
      "100",
      CHAT,
      chatEvent({
        message_id: "private-after-demo",
        message: { text: raw, fragments: [] },
      }),
    );
    assert.equal(h.app.snapshot().mode, "live");
    assert.deepEqual(h.app.snapshot().demoFeed, { A: [], B: [] });
    assert.ok(!JSON.stringify(h.app.snapshot()).includes(raw));
  } finally {
    await h.cleanup();
  }
});

test("third bot account uses its own grant; non-Affiliate channels keep chat/raids and never request paid-event subscriptions", async () => {
  const h = await harness("helper", true);
  try {
    await h.authorize("A", "alpha");
    await h.authorize("B", "beta");
    assert.equal(h.app.snapshot().twitch.ready, false);
    await h.authorize("bot", "helper");
    await eventually(() => h.app.snapshot().twitch.ready);
    const subscriptions = h.mock.requests.filter((r) =>
      r.url.endsWith("/eventsub/subscriptions"),
    );
    assert.ok(
      subscriptions.every((r) => [CHAT, "channel.raid"].includes(r.body.type)),
    );
    assert.equal(h.app.snapshot().twitch.teams.A.channelPoints, "unsupported");
    assert.equal(h.app.snapshot().twitch.teams.A.raidsReady, true);
    const settings = {
      ...h.app.snapshot().settings,
      approved: { A: true, B: true },
    };
    assert.equal(
      (
        await h.post("/api/control", {
          action: "start",
          settings,
          botLogin: "helper",
        })
      ).status,
      200,
    );
    await drain();
    assert.ok(h.mock.sent.length > 0);
    assert.ok(h.mock.sent.every((s) => s.sender_id === "500"));
    assert.ok(
      h.mock.requests
        .filter((r) => r.url.endsWith("/device"))
        .every((r) => !r.body.scopes.includes("moderator:")),
    );
    h.mock.sockets.find((s) => !s.socket.closed)!.socket.terminate();
    assert.equal(h.app.snapshot().game.phase, "stopped");
    assert.equal(
      (await h.post("/api/twitch", { action: "authorize", role: "A" })).status,
      200,
    );
  } finally {
    await h.cleanup();
  }
});

test("wrong-account device activation is rejected and tokens restore after restart without another device grant", async () => {
  const h = await harness();
  try {
    await h.authorize("A", "beta");
    assert.equal(h.app.snapshot().twitch.teams.A.authorized, false);
    const errors = await (await fetch(h.base + "/api/twitch/device")).json();
    assert.match(errors.authorizations[0].error, /Authorize as @alpha/);
    await h.authorize("A", "alpha");
    await h.authorize("B", "beta");
    await eventually(() => h.app.snapshot().twitch.ready);
    await h.app.close();
    const deviceRequests = h.mock.requests.filter((r) =>
      r.url.endsWith("/device"),
    ).length;
    const restored = createClashServer({
      autoTick: false,
      twitch: {
        clientId: "publicclient123",
        tokenFile: h.tokenFile,
        teamLogins: { A: "alpha", B: "beta" },
        http: h.mock.http,
        clock: h.mock.clock,
        socketFactory: h.mock.socketFactory,
      },
    });
    try {
      await restored.ready;
      await eventually(() => restored.snapshot().twitch.ready);
      assert.equal(
        h.mock.requests.filter((r) => r.url.endsWith("/device")).length,
        deviceRequests,
      );
    } finally {
      await restored.close();
    }
  } finally {
    await h.cleanup();
  }
});

test("announcements fit Twitch's limit, vote options go only to winners, and queued stale messages are cancelled", async () => {
  const clock = new FakeClock(),
    sent: string[] = [];
  let g = startRound(
    createGame(
      {
        teams: {
          A: { name: "A", channel: "alpha" },
          B: { name: "B", channel: "beta" },
        },
        language: "en",
        penalties: Array.from(
          { length: 8 },
          (_, i) =>
            `Safe voluntary penalty number ${i + 1} with a longer description`,
        ),
        approved: { A: true, B: true },
      },
      {
        id: "test",
        type: "trivia",
        prompt: { en: "Question", it: "Domanda" },
        answers: ["answer"],
      },
    ),
    0,
  );
  g.scores.A = 1;
  g = tick(g, 180000);
  const messages = roundAnnouncements(g, "rush");
  assert.ok(messages.every((m) => m.text.length <= 500));
  assert.ok(
    messages
      .filter((m) => m.text.includes("!vote 1:"))
      .every((m) => m.team === "A"),
  );
  assert.ok(messages.some((m) => m.text.includes("!vote 8:")));
  for (const language of ["en", "it"] as const) {
    const state = { ...g, settings: { ...g.settings, language } };
    const localized = roundAnnouncements(state, "rush");
    const seconds = `${config.timing.voteMs / 1000} ${language === "en" ? "seconds" : "secondi"}`;
    for (const team of ["A", "B"] as const)
      assert.ok(localized.find((m) => m.team === team)?.text.includes(seconds));
    const command = language === "en" ? "!vote NUMBER" : "!vote NUMERO";
    assert.ok(
      localized.some(
        (m) =>
          m.team === "A" &&
          m.text.includes(command) &&
          m.text.includes(seconds),
      ),
    );
    assert.ok(localized.every((m) => m.text.length <= 500));
    const draw = roundAnnouncements({ ...state, winner: null }, "rush");
    assert.ok(draw.every((m) => !m.text.includes("!vote")));
  }
  let current = true;
  const outbox = new ChatOutbox(async (_team, text) => {
    sent.push(text);
  }, clock);
  const a = outbox.enqueue("A", "first", () => current),
    b = outbox.enqueue("A", "stale", () => current);
  await drain();
  await a;
  current = false;
  await clock.advance(1100);
  await b;
  assert.deepEqual(sent, ["first"]);
  outbox.close();
});

test("a completed device grant can refresh later and persist its single-use refresh-token rotation", async () => {
  const h = await harness();
  h.mock.expirySeconds = 61;
  try {
    await h.authorize("A", "alpha");
    await eventually(() => h.app.snapshot().twitch.teams.A.chatReady);
    const original = JSON.parse(await readFile(h.tokenFile, "utf8")).accounts[0]
      .refreshToken;
    await h.step(30000);
    await eventually(() => h.mock.refreshes > 0);
    let rotated = false;
    for (let i = 0; i < 100 && !rotated; i++) {
      rotated =
        JSON.parse(await readFile(h.tokenFile, "utf8")).accounts[0]
          .refreshToken !== original;
      if (!rotated) await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(rotated, true);
    assert.equal(h.app.snapshot().twitch.teams.A.authorized, true);
  } finally {
    await h.cleanup();
  }
});

test("an explicitly disabled Reinforcement mapping survives account restoration", async () => {
  const h = await harness();
  try {
    await h.authorize("A", "alpha");
    await eventually(
      () => h.app.snapshot().twitch.teams.A.channelPoints === "enabled",
    );
    assert.equal(
      (
        await h.post("/api/twitch", {
          action: "map-reward",
          role: "A",
          rewardId: "",
        })
      ).status,
      200,
    );
    assert.equal(h.app.snapshot().twitch.teams.A.channelPoints, "unmapped");
    await h.app.close();
    const restored = createClashServer({
      autoTick: false,
      twitch: {
        clientId: "publicclient123",
        tokenFile: h.tokenFile,
        teamLogins: { A: "alpha", B: "beta" },
        botLogin: "",
        http: h.mock.http,
        clock: h.mock.clock,
        socketFactory: h.mock.socketFactory,
      },
    });
    try {
      await restored.ready;
      await eventually(() => restored.snapshot().twitch.teams.A.chatReady);
      assert.equal(restored.snapshot().twitch.teams.A.rewardId, "");
      assert.equal(
        restored.snapshot().twitch.teams.A.channelPoints,
        "unmapped",
      );
    } finally {
      await restored.close();
    }
  } finally {
    await h.cleanup();
  }
});
