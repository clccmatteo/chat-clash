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
    seen = 0,
    turn = 0;
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
      // Preserve ordinary chatter through continuous combo waves. Fill spare
      // slots with chat when fewer special rows are available.
      const chatter = pending.filter((row) => row.kind === "chat");
      const reserve = Math.min(
        chatter.length,
        Math.max(1, Math.floor(limit / 4)),
      );
      const special = pending
        .filter((row) => row.kind !== "chat")
        .slice(0, limit - reserve);
      pending = [...special, ...chatter.slice(-(limit - special.length))];
    },
    take() {
      const chat =
        turn++ % 3 === 2 ? pending.findIndex((row) => row.kind === "chat") : -1;
      return pending.splice(chat >= 0 ? chat : 0, 1)[0];
    },
    clear() {
      pending = [];
      seen = 0;
      turn = 0;
    },
    size: () => pending.length,
  };
}
