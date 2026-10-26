import { subscribe, text } from "/shared/stream.js";
import { createFeedQueue } from "/showcase/feed.js";

const $ = (id) => document.getElementById(id);
const queues = { A: createFeedQueue(), B: createFeedQueue() };
const active = (phase) =>
  ["battle", "flash", "rush", "verdict"].includes(phase);
let latest,
  round,
  mode,
  connected = false,
  busy = false,
  hasRun = false;
function fit() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  $("showcase").style.transform = `translate(-50%, -50%) scale(${scale})`;
}
addEventListener("resize", fit);
fit();
function clearChats() {
  for (const team of ["A", "B"]) {
    queues[team].clear();
    $(`chat-${team.toLowerCase()}`).replaceChildren();
  }
}
function updateControls() {
  for (const button of document.querySelectorAll("[data-speed]"))
    button.disabled = busy || !connected || active(latest?.game.phase);
}
function notice(message) {
  text("notice", message);
  $("notice").hidden = !message;
}
function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function renderRow(row) {
  const known = [
    "chat",
    "combo",
    "cheer",
    "redemption",
    "raid",
    "answer",
    "vote",
  ];
  const kind = known.includes(row.kind) ? row.kind : "chat";
  const li = element("li", "", `chat-row ${kind}`);
  li.dataset.kind = kind;
  const hash = [...row.userName].reduce(
    (sum, char) => sum + char.codePointAt(0),
    0,
  );
  const colors = [
    "#ffb99f",
    "#79dfc6",
    "#9ed9fb",
    "#f6d486",
    "#f3a8c1",
    "#bddea2",
  ];
  const badge = element("span", ["✦", "◇", "✧"][hash % 3], "badge");
  badge.setAttribute("aria-hidden", "true");
  const user = element("strong", row.userName, "username");
  user.style.color = colors[hash % colors.length];
  li.append(
    badge,
    user,
    element(
      "span",
      kind === "chat" || kind === "combo" || kind === "vote" ? ": " : " ",
    ),
  );
  if (kind === "cheer") {
    const spark = element("span", "", "cheer-spark");
    spark.setAttribute("aria-hidden", "true");
    li.append(spark);
  }
  li.append(element("span", row.text, "message"));
  const list = $(`chat-${row.team.toLowerCase()}`);
  list.append(li);
  while (list.children.length > 18) list.firstElementChild.remove();
}
// Six readable rows per real second per room at every simulation speed. Rare
// events go first; queues and DOM stay bounded even at 12x or after reconnects.
setInterval(() => {
  if (mode !== "simulator" || !connected || !active(latest?.game.phase)) return;
  for (const team of ["A", "B"]) {
    const row = queues[team].take();
    if (row) renderRow(row);
  }
}, 167);

subscribe(
  (state) => {
    latest = state;
    if (round !== state.demoRound || mode !== state.mode) clearChats();
    round = state.demoRound;
    mode = state.mode;
    const running = active(state.game.phase);
    if (running) hasRun = true;
    $("launch-panel").hidden = running || (hasRun && mode === "simulator");
    $("new-demo").hidden = running || !hasRun || mode !== "simulator";
    for (const team of ["A", "B"]) {
      const key = team.toLowerCase();
      text(`team-${key}-name`, state.game.teams[team].name);
      const isDemo = mode === "simulator";
      if (isDemo) queues[team].add(state.demoFeed?.[team] ?? []);
      $(`placeholder-${key}`).hidden = isDemo;
      text(
        `placeholder-${key}`,
        mode === "live"
          ? "Live chat stays private — scores only"
          : "Start a demo to rally this chat.",
      );
      text(
        `room-${key}-note`,
        state.game.phase === "verdict"
          ? "Winning chat: !vote + option number"
          : state.game.phase === "complete"
            ? "GG, both communities. What a round."
            : "Every voice counts.",
      );
    }
    updateControls();
  },
  (value) => {
    connected = value;
    text(
      "connection",
      value ? "● ARENA CONNECTED" : "RECONNECTING · DISPLAY PAUSED",
    );
    updateControls();
  },
);

for (const button of document.querySelectorAll("[data-speed]")) {
  button.addEventListener("click", async () => {
    if (busy || !latest || active(latest.game.phase)) return;
    busy = true;
    notice("");
    updateControls();
    try {
      const response = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start-simulator",
          speed: Number(button.dataset.speed),
          challengeType: "anagram",
          settings: {
            teams: {
              A: { name: "Coral Crew", channel: "coralcrew" },
              B: { name: "Mint Mob", channel: "mintmob" },
            },
            // The server supplies demo approvals inside start-simulator. Keep the
            // saved streamer approvals false so a demo cannot approve a live round.
            language: "en",
            penalties: latest.safePenalties.slice(0, 3),
            approved: { A: false, B: false },
          },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not start the demo.");
      hasRun = true;
      $("launch-panel").hidden = true;
    } catch (error) {
      notice(error.message || "Cannot reach the arena.");
    } finally {
      busy = false;
      updateControls();
    }
  });
}
$("full-screen").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen();
  } catch {
    notice(
      "Full screen is unavailable here. Open /showcase/ in your browser and try again.",
    );
  }
});
$("new-demo").addEventListener("click", () => {
  $("launch-panel").hidden = false;
});
