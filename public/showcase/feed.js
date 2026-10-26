// Display scheduling only: never computes scores or chooses game events.
const priority = {
  raid: 5,
  cheer: 5,
  redemption: 5,
  answer: 4,
  vote: 3,
  combo: 2,
  chat: 1,
};
export function createFeedQueue(limit = 28) {
  let pending = [],
    seen = 0;
  return {
    add(rows) {
      for (const row of rows) {
        if (row.id <= seen) continue;
        pending.push(row);
        seen = row.id;
      }
      pending.sort(
        (a, b) =>
          (priority[b.kind] ?? 0) - (priority[a.kind] ?? 0) || a.id - b.id,
      );
      pending = pending.slice(0, limit);
    },
    take: () => pending.shift(),
    clear() {
      pending = [];
      seen = 0;
    },
    size: () => pending.length,
  };
}
