import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenStore, type TokenRecord } from "../src/twitch/token-store.js";
import { TwitchApi } from "../src/twitch/api.js";
import { DeviceAuth } from "../src/twitch/device-auth.js";
import type { Fetcher } from "../src/twitch/runtime.js";
import { FakeClock, drain } from "./twitch-helpers.js";
const record: TokenRecord = {
  clientId: "public-client",
  userId: "100",
  login: "alpha",
  accessToken: "private-access",
  refreshToken: "private-refresh",
  scopes: ["channel:bot"],
  expiresAt: Date.parse("2026-10-25T15:00:00Z"),
};
const validation = {
  client_id: record.clientId,
  user_id: "100",
  login: "alpha",
  scopes: record.scopes,
  expires_in: 14400,
};

test("token storage survives restart with atomic owner-only writes and reward mapping", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chat-clash-"));
  try {
    const file = join(dir, "private", "tokens.json"),
      store = new TokenStore(file);
    await store.load();
    await Promise.all([
      store.put(record),
      store.put({ ...record, userId: "200", login: "beta" }),
      store.setReward("100", "reward-1"),
    ]);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, "private"))).mode & 0o777, 0o700);
    const restored = new TokenStore(file);
    await restored.load();
    assert.deepEqual(restored.get(record.clientId, "alpha"), record);
    assert.equal(restored.getReward("100"), "reward-1");
    await restored.remove(record.clientId, "alpha");
    assert.equal(restored.get(record.clientId, "alpha"), undefined);
    assert.ok(!String(await readFile(file)).includes('"login":"alpha"'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("public-client refresh is single-flight, secret-free, persists the new one-use token and retries 401 once", async () => {
  const clock = new FakeClock();
  let refreshes = 0;
  const saved: TokenRecord[] = [],
    requests: RequestInit[] = [];
  const http: Fetcher = async (url, init = {}) => {
    requests.push(init);
    if (String(url).endsWith("/validate")) return Response.json(validation);
    if (String(url).endsWith("/token")) {
      refreshes++;
      const body = init.body as URLSearchParams;
      assert.equal(body.get("refresh_token"), "private-refresh");
      assert.equal(body.has("client_secret"), false);
      await drain();
      return Response.json({
        access_token: "new-access",
        refresh_token: "rotated-refresh",
        scope: record.scopes,
        expires_in: 14400,
      });
    }
    return new Headers(init.headers)
      .get("Authorization")
      ?.includes("private-access")
      ? Response.json({}, { status: 401 })
      : Response.json({ data: [] });
  };
  const api = new TwitchApi(
    { ...record },
    async (r) => {
      saved.push(structuredClone(r));
    },
    http,
    clock,
  );
  await Promise.all([api.helix("users"), api.helix("users")]);
  assert.equal(refreshes, 1);
  assert.equal(saved.at(-1)?.refreshToken, "rotated-refresh");
  assert.ok(requests.every((r) => !String(r.body).includes("client_secret")));
});
test("OAuth tokens are validated at startup and hourly, and identity mismatches fail", async () => {
  const clock = new FakeClock();
  let checks = 0;
  const http: Fetcher = async (url) => {
    if (String(url).endsWith("/validate")) {
      checks++;
      return Response.json(validation);
    }
    return Response.json({
      data: [
        {
          id: "100",
          login: "alpha",
          display_name: "Alpha",
          broadcaster_type: "",
        },
      ],
    });
  };
  const api = new TwitchApi({ ...record }, async () => {}, http, clock);
  assert.equal((await api.loadIdentity()).broadcasterType, "");
  assert.equal(checks, 1);
  await clock.advance(3600000);
  await api.maintain();
  assert.equal(checks, 2);
  const wrong = new TwitchApi(
    { ...record },
    async () => {},
    async () => Response.json({ ...validation, user_id: "999" }),
    clock,
  );
  await assert.rejects(wrong.validate(), /identity/);
});
test("device code flow polls at Twitch's interval, handles pending/slow-down and keeps device/token secrets out of browser status", async () => {
  const clock = new FakeClock();
  let polls = 0,
    completed = false;
  const http: Fetcher = async (url, init = {}) => {
    const body = init.body as URLSearchParams;
    assert.equal(body.has("client_secret"), false);
    if (String(url).endsWith("/device")) {
      assert.equal(body.get("scopes"), "channel:bot");
      return Response.json({
        device_code: "secret-device",
        user_code: "ABCD1234",
        verification_uri:
          "https://www.twitch.tv/activate?public=true&device-code=ABCD1234",
        expires_in: 60,
        interval: 5,
      });
    }
    polls++;
    assert.equal(
      body.get("grant_type"),
      "urn:ietf:params:oauth:grant-type:device_code",
    );
    assert.equal(body.get("device_code"), "secret-device");
    if (polls === 1)
      return Response.json(
        { message: "authorization_pending" },
        { status: 400 },
      );
    if (polls === 2)
      return Response.json({ message: "slow_down" }, { status: 400 });
    return Response.json({
      access_token: "private-access",
      refresh_token: "private-refresh",
      expires_in: 14400,
      scope: ["channel:bot"],
    });
  };
  const auth = new DeviceAuth(
    record.clientId,
    async (_role, login, tokens) => {
      assert.equal(login, "alpha");
      assert.equal(tokens.refreshToken, "private-refresh");
      completed = true;
    },
    () => {},
    http,
    clock,
  );
  await auth.begin("A", "alpha", ["channel:bot"]);
  const browser = JSON.stringify(auth.status());
  assert.ok(!browser.includes("secret-device"));
  assert.ok(!browser.includes("private-access"));
  assert.ok(browser.includes("ABCD1234"));
  await clock.advance(4999);
  assert.equal(polls, 0);
  await clock.advance(1);
  assert.equal(polls, 1);
  await clock.advance(5000);
  assert.equal(polls, 2);
  await clock.advance(9999);
  assert.equal(polls, 2);
  await clock.advance(1);
  assert.equal(completed, true);
  assert.deepEqual(auth.status(), []);
  auth.close();
});
test("device authorization expires, can be cancelled, and rejects non-Twitch activation links", async () => {
  const clock = new FakeClock();
  let polls = 0;
  const http: Fetcher = async (url) =>
    String(url).endsWith("/device")
      ? Response.json({
          device_code: "secret",
          user_code: "CODE",
          verification_uri: "https://www.twitch.tv/activate",
          expires_in: 3,
          interval: 5,
        })
      : (polls++,
        Response.json({ message: "authorization_pending" }, { status: 400 }));
  const auth = new DeviceAuth(
    record.clientId,
    async () => {},
    () => {},
    http,
    clock,
  );
  await auth.begin("A", "alpha", []);
  await clock.advance(3000);
  assert.match(auth.status()[0].error!, /expired/);
  assert.equal(polls, 0);
  await auth.begin("A", "alpha", []);
  auth.cancel("A");
  await clock.advance(10000);
  assert.deepEqual(auth.status(), []);
  const bad = new DeviceAuth(
    record.clientId,
    async () => {},
    () => {},
    async () =>
      Response.json({
        device_code: "secret",
        user_code: "CODE",
        verification_uri: "https://evil.example/activate",
        expires_in: 30,
      }),
    clock,
  );
  await bad.begin("A", "alpha", []);
  assert.equal(bad.status()[0].status, "error");
  bad.close();
  auth.close();
});

test("device polling retries temporary network failures without replacing the activation code", async () => {
  const clock = new FakeClock();
  let polls = 0,
    completed = false;
  const http: Fetcher = async (url) => {
    if (String(url).endsWith("/device"))
      return Response.json({
        device_code: "secret-device",
        user_code: "RETRYCODE",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 60,
        interval: 5,
      });
    if (++polls === 1) throw new TypeError("network unavailable");
    return Response.json({
      access_token: "private-access",
      refresh_token: "private-refresh",
      expires_in: 14400,
      scope: [],
    });
  };
  const auth = new DeviceAuth(
    record.clientId,
    async () => {
      completed = true;
    },
    () => {},
    http,
    clock,
  );
  await auth.begin("A", "alpha", []);
  await clock.advance(5000);
  assert.equal(auth.status()[0].status, "pending");
  assert.equal(auth.status()[0].userCode, "RETRYCODE");
  await clock.advance(5000);
  assert.equal(completed, true);
  auth.close();
});
