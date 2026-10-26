import { test } from "node:test";
import assert from "node:assert/strict";

// Browser-native ES module, exercised without a DOM or frontend build step.
const { createFeedQueue } = await import(
  new URL("../public/showcase/feed.js", import.meta.url).href
);

test("showcase display queue bounds bursts, favors rare events, deduplicates snapshots and resets per round", () => {
  const queue = createFeedQueue(5);
  queue.add(
    Array.from({ length: 40 }, (_, id) => ({
      id: id + 1,
      kind: id === 0 ? "raid" : id === 2 ? "redemption" : "chat",
    })),
  );
  assert.equal(queue.size(), 5);
  assert.equal(queue.take().kind, "raid");
  assert.equal(queue.take().kind, "redemption");
  queue.add([
    { id: 3, kind: "redemption" },
    { id: 40, kind: "chat" },
  ]);
  assert.equal(queue.size(), 3);
  queue.add([
    { id: 41, kind: "cheer" },
    { id: 42, kind: "answer" },
    { id: 43, kind: "vote" },
    { id: 44, kind: "combo" },
  ]);
  assert.equal(queue.size(), 5);
  assert.deepEqual(Array.from({ length: 5 }, () => queue.take().kind).sort(), [
    "answer",
    "chat",
    "cheer",
    "combo",
    "vote",
  ]);
  queue.clear();
  assert.equal(queue.size(), 0);
  queue.add([{ id: 1, kind: "chat" }]);
  assert.equal(queue.take().id, 1);
});

test("continuous combo waves cannot starve ordinary readable chat", () => {
  const queue = createFeedQueue();
  let id = 0,
    chats = 0;
  for (let tick = 0; tick < 30; tick++) {
    queue.add(
      Array.from({ length: 10 }, (_, index) => ({
        id: ++id,
        kind: index === 0 ? "chat" : "combo",
      })),
    );
    if (queue.take().kind === "chat") chats++;
    assert.ok(queue.size() <= 28);
  }
  assert.equal(chats, 10);
});
