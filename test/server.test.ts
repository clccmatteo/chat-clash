import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createClashServer } from "../src/server.js";

test("HTTP and WebSocket deliver a full simulated round, vote, reset and safe snapshots", async () => {
  const app = createClashServer({ autoTick: false, twitch: false });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  let socket: WebSocket | undefined;
  try {
    const initial = (await (
      await fetch(`${base}/api/state`)
    ).json()) as ReturnType<typeof app.snapshot>;
    assert.equal(initial.game.phase, "idle");
    assert.equal(initial.game.challenge, null);
    assert.deepEqual(initial.demoFeed, { A: [], B: [] });
    for (const path of [
      "/control/",
      "/overlay/",
      "/showcase/",
      "/showcase/app.js",
      "/showcase/feed.js",
      "/showcase/style.css",
      "/shared/stream.js",
      "/brand/logo.png",
      "/brand/favicon.ico",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
    assert.equal((await fetch(base + "/data/challenges.json")).status, 404);
    const redirect = await fetch(base + "/showcase", { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/showcase/");
    const post = (data: unknown, origin = base) =>
      fetch(`${base}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(data),
      });
    assert.equal(
      (await post({ action: "start", settings: initial.settings })).status,
      400,
    );
    assert.equal(
      (await post({ action: "reset" }, "https://untrusted.example")).status,
      403,
    );
    assert.equal((await post(null)).status, 400);
    assert.equal(
      (
        await post({
          action: "start-simulator",
          settings: {
            ...initial.settings,
            penalties: ["Unsafe unknown custom penalty"],
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post({
          action: "start-simulator",
          settings: initial.settings,
          speed: 99,
        })
      ).status,
      400,
    );
    assert.equal((await post({ action: "unknown" })).status, 400);
    assert.equal(
      (await post({ action: "reset", extra: "x".repeat(17000) })).status,
      413,
    );
    socket = new WebSocket(base.replace("http", "ws") + "/ws", {
      origin: base,
    });
    const firstPacket = once(socket, "message");
    await once(socket, "open");
    assert.equal(JSON.parse(String((await firstPacket)[0])).game.phase, "idle");
    const packets: string[] = [];
    socket.on("message", (value) => packets.push(String(value)));
    const start = await post({
      action: "start-simulator",
      settings: initial.settings,
      speed: 1,
    });
    assert.equal(start.status, 200);
    assert.equal(
      (await post({ action: "configure", settings: initial.settings })).status,
      409,
    );
    const phases = new Set<string>();
    for (let i = 0; i < 840; i++) {
      app.advance(250);
      phases.add(app.snapshot().game.phase);
      // Let the real socket drain while the game runs on an explicit fake clock.
      if (i % 40 === 0) await new Promise<void>((r) => setImmediate(r));
    }
    await new Promise<void>((r) => setImmediate(r));
    const final = app.snapshot();
    assert.equal(final.game.phase, "complete");
    assert.equal(final.simulator, false);
    assert.equal(phases.size, 5);
    assert.ok(final.game.eventCount > 1000);
    assert.ok(final.game.penalty);
    assert.equal(final.game.mvps.A.length, 3);
    assert.equal(final.game.mvps.B.length, 3);
    assert.ok(
      packets.some((packet) => JSON.parse(packet).game.phase === "flash"),
    );
    assert.ok(
      packets.some((packet) => JSON.parse(packet).game.phase === "rush"),
    );
    for (const packet of packets) {
      assert.ok(!packet.includes("surely it is a potato"));
      assert.ok(!packet.includes("lastChatAt"));
      const parsed = JSON.parse(packet);
      for (const team of ["A", "B"]) {
        assert.ok(parsed.demoFeed[team].length <= 40);
        for (const row of parsed.demoFeed[team]) {
          assert.ok(!Object.hasOwn(row, "answers"));
          if (row.kind === "answer")
            assert.equal(row.text, "✓ answered the flash challenge");
        }
      }
      if (parsed.game.challenge)
        assert.ok(!Object.hasOwn(parsed.game.challenge, "answers"));
    }
    assert.equal((await post({ action: "reset" })).status, 200);
    assert.equal(app.snapshot().game.scores.A, 0);
    assert.equal(app.snapshot().game.phase, "idle");
    assert.deepEqual(app.snapshot().demoFeed, { A: [], B: [] });
    const live = { ...initial.settings, approved: { A: true, B: true } };
    assert.equal((await post({ action: "start", settings: live })).status, 400);
    assert.equal(
      (await post({ action: "start-simulator", settings: live })).status,
      200,
    );
    app.advance(90000);
    assert.equal(app.snapshot().game.phase, "flash");
    assert.equal((await post({ action: "stop" })).status, 200);
    app.advance(300000);
    assert.equal(app.snapshot().game.phase, "stopped");
  } finally {
    socket?.terminate();
    await app.close();
  }
});

test("WebSocket rejects cross-origin clients", async () => {
  const app = createClashServer({ autoTick: false, twitch: false });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
      origin: "https://untrusted.example",
    });
    const [error] = await once(ws, "error");
    assert.match(error.message, /403/);
    ws.terminate();
  } finally {
    await app.close();
  }
});

test("simulator pause freezes every phase and display feed, resumes without catch-up, and resets on stop/reset", async () => {
  const app = createClashServer({ autoTick: false, twitch: false });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (action: string, extra = {}) =>
    fetch(`${base}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ action, ...extra }),
    });
  try {
    assert.equal((await post("pause-simulator")).status, 409);
    assert.equal((await post("resume-simulator")).status, 409);
    const settings = app.snapshot().settings;
    await post("start-simulator", { settings, speed: 4 });
    for (const phase of ["battle", "flash", "rush", "verdict"]) {
      const target = {
        battle: 20000,
        flash: 95000,
        rush: 155000,
        verdict: 185000,
      }[phase]!;
      app.advance((target - app.snapshot().game.elapsedMs) / 4);
      assert.equal(app.snapshot().game.phase, phase);
      assert.equal((await post("pause-simulator")).status, 200);
      const paused = app.snapshot();
      assert.equal(paused.simulatorPaused, true);
      app.advance(90000);
      assert.deepEqual(app.snapshot().game, paused.game);
      assert.deepEqual(app.snapshot().demoFeed, paused.demoFeed);
      // Duplicate commands are idempotent, rather than toggling unexpectedly.
      await post("pause-simulator");
      assert.equal(app.snapshot().simulatorPaused, true);
      assert.equal((await post("resume-simulator")).status, 200);
      assert.equal(app.snapshot().simulatorPaused, false);
      app.advance(250);
      assert.equal(app.snapshot().game.elapsedMs, target + 1000);
    }
    app.advance(10000);
    assert.equal(app.snapshot().game.phase, "complete");
    assert.equal((await post("pause-simulator")).status, 409);
    await post("start-simulator", { settings });
    await post("pause-simulator");
    await post("stop");
    assert.equal(app.snapshot().simulatorPaused, false);
    await post("start-simulator", { settings });
    await post("pause-simulator");
    await post("reset");
    assert.equal(app.snapshot().simulatorPaused, false);
    assert.equal(app.snapshot().game.phase, "idle");
  } finally {
    await app.close();
  }
});
