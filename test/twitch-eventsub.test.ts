import { test } from "node:test";
import assert from "node:assert/strict";
import { EventSubSource, type SourceState } from "../src/twitch/eventsub.js";
import { Deduplicator } from "../src/twitch/dedup.js";
import {
  normalizeNotification,
  CHAT,
  CHEER,
  RAID,
  REDEMPTION,
} from "../src/twitch/normalize.js";
import type { TwitchEvent } from "../src/twitch/types.js";
import {
  FakeClock,
  FakeSocket,
  chatEvent,
  notification,
  welcome,
  drain,
} from "./twitch-helpers.js";
const connections = [
  {
    team: "A" as const,
    broadcasterId: "100",
    reinforcementRewardId: "reinforcement-id",
  },
];

test("native EventSub normalization maps chat/emotes, reward IDs, Bits and incoming raids without trusting text", () => {
  const clock = new FakeClock();
  const chat = normalizeNotification(
    notification(
      CHAT,
      clock,
      chatEvent({
        message: {
          text: "CLASH",
          fragments: [
            { type: "emote", text: "Kappa", emote: { id: "25" } },
            { type: "emote", text: "Kappa", emote: { id: "25" } },
          ],
        },
      }),
    ),
    connections,
    clock.now(),
  );
  assert.deepEqual(chat?.event.emotes, ["25"]);
  assert.equal(chat?.event.type, "chat");
  assert.equal(chat?.event.ts, clock.now());
  const redeem = notification(REDEMPTION, clock, {
    id: "redemption-1",
    user_id: "300",
    user_name: "Viewer",
    reward: { id: "reinforcement-id", title: "Other title" },
  });
  assert.equal(
    normalizeNotification(redeem, connections, clock.now())?.event.type,
    "redemption",
  );
  redeem.payload.event.reward.id = "wrong-id";
  assert.equal(normalizeNotification(redeem, connections, clock.now()), null);
  assert.equal(
    normalizeNotification(
      notification(CHEER, clock, {
        user_id: "300",
        user_name: "Viewer",
        bits: 100,
      }),
      connections,
      clock.now(),
    )?.event.amount,
    100,
  );
  assert.equal(
    normalizeNotification(
      notification(CHEER, clock, {
        is_anonymous: true,
        user_id: null,
        user_name: null,
        bits: 100,
      }),
      connections,
      clock.now(),
    ),
    null,
  );
  const raid = notification(
    RAID,
    clock,
    {
      to_broadcaster_user_id: "100",
      from_broadcaster_user_id: "400",
      from_broadcaster_user_name: "Raider",
      viewers: 99,
    },
    "raid-1",
    { to_broadcaster_user_id: "100" },
  );
  assert.equal(
    normalizeNotification(raid, connections, clock.now())?.event.type,
    "raid",
  );
});
test("foreign channels, Shared Chat copies, bot system posts, stale/future and malformed notifications never score", () => {
  const clock = new FakeClock();
  for (const extras of [
    { broadcaster_user_id: "999" },
    { source_broadcaster_user_id: "999" },
    {
      chatter_user_id: "500",
      message: { text: "[Chat Clash] Flash", fragments: [] },
    },
  ])
    assert.equal(
      normalizeNotification(
        notification(CHAT, clock, chatEvent(extras)),
        connections,
        clock.now(),
        "500",
      ),
      null,
    );
  assert.equal(normalizeNotification({}, connections, clock.now()), null);
  const stale = notification(CHAT, clock, chatEvent());
  stale.metadata.message_timestamp = new Date(
    clock.now() - 600001,
  ).toISOString();
  assert.equal(normalizeNotification(stale, connections, clock.now()), null);
  const future = notification(CHAT, clock, chatEvent());
  future.metadata.message_timestamp = new Date(
    clock.now() + 60001,
  ).toISOString();
  assert.equal(normalizeNotification(future, connections, clock.now()), null);
});
test("deduplication handles envelope and provider IDs, bounded memory and expiry", () => {
  const d = new Deduplicator(100, 3);
  assert.ok(d.accept(["envelope1", "chat1"], 0));
  assert.ok(!d.accept(["envelope1", "chat2"], 1));
  assert.ok(!d.accept(["envelope2", "chat1"], 2));
  assert.ok(d.accept(["new1", "new2"], 3));
  assert.ok(d.accept(["envelope1"], 4));
  assert.ok(d.accept(["chat1"], 200));
});
test("EventSub welcome subscribes, deduplicates, hands off without resubscribing, and cold reconnect resubscribes", async () => {
  const clock = new FakeClock(),
    sockets: FakeSocket[] = [],
    urls: string[] = [],
    events: TwitchEvent[] = [],
    states: SourceState[] = [];
  let subscriptions = 0;
  const source = new EventSubSource({
    connections,
    specs: [
      {
        team: "A",
        type: CHAT,
        condition: { broadcaster_user_id: "100", user_id: "500" },
      },
    ],
    botId: "500",
    clock,
    socketFactory: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    subscribe: async () => {
      subscriptions++;
    },
    onEvent: (e) => events.push(e),
    onState: (s) => states.push(s),
    onIssue: () => {},
    onRevoked: () => {},
  });
  source.connect();
  sockets[0].sendPacket(welcome());
  await drain();
  assert.equal(subscriptions, 1);
  const packet = notification(CHAT, clock, chatEvent(), "first", {
    user_id: "500",
  });
  sockets[0].sendPacket(packet);
  sockets[0].sendPacket(packet);
  sockets[0].sendPacket({
    ...packet,
    metadata: { ...packet.metadata, message_id: "new-envelope-same-chat" },
  });
  await drain();
  assert.equal(events.length, 1);
  sockets[0].sendPacket({
    metadata: { message_type: "session_reconnect" },
    payload: {
      session: {
        reconnect_url: "wss://eventsub.wss.twitch.tv/ws?ticket=opaque",
      },
    },
  });
  await drain();
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].closed, false);
  assert.ok(urls[1].endsWith("?ticket=opaque"));
  sockets[1].sendPacket(welcome("migrated"));
  await drain();
  assert.equal(sockets[0].closed, true);
  assert.equal(subscriptions, 1);
  sockets[1].sendPacket(packet);
  await drain();
  assert.equal(events.length, 1);
  sockets[1].terminate();
  await clock.advance(500);
  assert.equal(sockets.length, 3);
  sockets[2].sendPacket(welcome("fresh"));
  await drain();
  assert.equal(subscriptions, 2);
  assert.equal(states.at(-1)?.status, "connected");
  source.disconnect();
  await clock.advance(60000);
  assert.equal(sockets.length, 3);
});
test("keepalive watchdog, malformed frames, unsafe reconnect URLs, optional subscription failures and revocations", async () => {
  const clock = new FakeClock(),
    sockets: FakeSocket[] = [],
    states: SourceState[] = [];
  let revoked = false;
  const source = new EventSubSource({
    connections,
    clock,
    specs: [
      { team: "A", type: CHAT, condition: { broadcaster_user_id: "100" } },
      { team: "A", type: CHEER, condition: { broadcaster_user_id: "100" } },
    ],
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    subscribe: async (_id, spec) => {
      if (spec.type === CHEER) throw new Error("unsupported");
    },
    onState: (s) => states.push(s),
    onIssue: () => {},
    onRevoked: () => {
      revoked = true;
    },
    onEvent: () => {},
  });
  source.connect();
  sockets[0].sendPacket(welcome());
  await drain();
  assert.equal(states.at(-1)?.subscriptions[`A:${CHEER}`], "error");
  assert.equal(states.at(-1)?.subscriptions[`A:${CHAT}`], "enabled");
  sockets[0].emit("message", Buffer.from("not JSON"));
  sockets[0].sendPacket({
    metadata: { message_type: "session_reconnect" },
    payload: { session: { reconnect_url: "wss://evil.example/ws" } },
  });
  await drain();
  assert.equal(sockets.length, 1);
  await clock.advance(10000);
  sockets[0].sendPacket({
    metadata: { message_type: "session_keepalive" },
    payload: {},
  });
  await clock.advance(10000);
  assert.equal(sockets.length, 1);
  await clock.advance(1500);
  assert.equal(sockets.length, 2);
  sockets[1].sendPacket(welcome());
  await drain();
  sockets[1].sendPacket({
    metadata: { message_type: "revocation" },
    payload: { subscription: { type: CHAT, status: "authorization_revoked" } },
  });
  assert.equal(revoked, true);
  assert.equal(states.at(-1)?.status, "disconnected");
  source.disconnect();
});
