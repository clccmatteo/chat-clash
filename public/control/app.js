import { subscribe, text, clock } from "/shared/stream.js";
import { createTwitchControls } from "/control/twitch.js";
const $ = (id) => document.getElementById(id);
let latest,
  initialized = false,
  busy = false,
  connected = false,
  previousLog = "";
const form = $("settings-form");
const twitchUI = createTwitchControls({ notice, onBusyChange: updateButtons });
const obsUrl = new URL("/overlay/", location.origin).href;
text("obs-url", obsUrl);
function fitPreview() {
  $("preview").style.transform =
    `scale(${$("preview-wrap").clientWidth / 1920})`;
}
new ResizeObserver(fitPreview).observe($("preview-wrap"));
fitPreview();
function notice(message, error = false) {
  text("notice", message);
  $("notice").hidden = false;
  $("notice").className = `notice${error ? " error" : ""}`;
}
function readSettings() {
  return {
    teams: Object.fromEntries(
      ["A", "B"].map((team) => [
        team,
        {
          name: $(`name-${team.toLowerCase()}`).value,
          channel: $(`channel-${team.toLowerCase()}`).value,
        },
      ]),
    ),
    language: $("language").value,
    penalties: [
      ...document.querySelectorAll("#penalty-list input:checked"),
    ].map((input) => input.value),
    approved: { A: $("approve-a").checked, B: $("approve-b").checked },
  };
}
function resetApprovals() {
  $("approve-a").checked = false;
  $("approve-b").checked = false;
}
for (const id of [
  "name-a",
  "name-b",
  "channel-a",
  "channel-b",
  "language",
  "bot-login",
])
  $(id).addEventListener("input", resetApprovals);
function updateButtons() {
  const active =
    latest &&
    ["battle", "flash", "rush", "verdict"].includes(latest.game.phase);
  const pending = latest?.twitch.pendingRoles.length > 0;
  for (const id of ["sim-start", "start", "save"])
    $(id).disabled =
      busy || twitchUI.isBusy() || !connected || active || pending;
  $("start").disabled ||= !latest?.twitch.ready || twitchUI.dirty();
  $("stop").disabled = busy || !connected || !active;
  $("reset").disabled = busy || !connected;
  $("settings-fields").disabled = active || busy || pending;
  $("penalty-fields").disabled = active || busy;
  twitchUI.update(latest, connected, busy);
}
async function command(action) {
  if (busy) return;
  if (
    ["configure", "start", "start-simulator"].includes(action) &&
    !form.reportValidity()
  )
    return;
  busy = true;
  updateButtons();
  try {
    const response = await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        settings: readSettings(),
        speed: Number($("speed").value),
        botLogin: $("bot-login").value.toLowerCase(),
        challengeType: $("next-challenge-type").value,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "The command could not be completed");
    render(data);
    notice(
      action === "configure"
        ? "Settings saved. Your arena is ready."
        : action === "start-simulator"
          ? `Simulator running at ${data.speed}×. Twitch events are ignored and no chat messages will be sent.`
          : action === "start"
            ? "Live round started. Both Twitch chats are scoring and system announcements are enabled."
            : action === "reset"
              ? "Scores, votes and round timer reset."
              : "Round stopped. Start again whenever you’re ready.",
    );
  } catch (e) {
    notice(
      e.message ||
        "Cannot reach the server. Check the connection and try again.",
      true,
    );
  } finally {
    busy = false;
    updateButtons();
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void command("configure");
});
for (const [id, action] of [
  ["sim-start", "start-simulator"],
  ["start", "start"],
  ["stop", "stop"],
  ["reset", "reset"],
])
  $(id).addEventListener("click", () => void command(action));
$("copy-url").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(obsUrl);
    notice(
      "Overlay URL copied. Paste it into an OBS Browser Source at 1920 × 1080.",
    );
  } catch {
    notice(`Copy this OBS Browser Source URL: ${obsUrl}`);
  }
});
function initSettings(data) {
  for (const team of ["A", "B"]) {
    $(`name-${team.toLowerCase()}`).value = data.settings.teams[team].name;
    $(`channel-${team.toLowerCase()}`).value =
      data.settings.teams[team].channel;
    $(`approve-${team.toLowerCase()}`).checked = data.settings.approved[team];
  }
  $("language").value = data.settings.language;
  $("bot-login").value = data.twitch.bot.followsTeamA
    ? ""
    : data.twitch.bot.login;
  $("penalty-list").replaceChildren(
    ...data.safePenalties.map((penalty) => {
      const label = document.createElement("label"),
        input = document.createElement("input"),
        span = document.createElement("span");
      input.type = "checkbox";
      input.value = penalty;
      input.checked = data.settings.penalties.includes(penalty);
      span.textContent = penalty;
      input.addEventListener("change", () => {
        resetApprovals();
        updatePenaltyCount();
      });
      label.append(input, span);
      return label;
    }),
  );
  updatePenaltyCount();
}
function updatePenaltyCount() {
  text(
    "penalty-count",
    `${document.querySelectorAll("#penalty-list input:checked").length} SELECTED`,
  );
}
function render(data) {
  const previousPhase = latest?.game.phase;
  latest = data;
  if (!initialized) {
    initSettings(data);
    initialized = true;
  }
  const g = data.game;
  if (g.phase === "complete" && previousPhase && previousPhase !== "complete")
    notice(
      g.penalty
        ? `Round complete. Selected penalty: ${g.penalty}. Always voluntary.`
        : "Round complete. No penalty selected. Ready for a rematch?",
    );
  text(
    "round-status",
    {
      idle: "Ready when you are.",
      battle: "The battle is on.",
      flash: "Think fast. Chat faster.",
      rush: "Final rush. Double points.",
      verdict: g.winner
        ? `${g.teams[g.winner].name} wins!`
        : "What a battle. It’s a draw.",
      complete: "That’s a wrap. GG!",
      stopped: "Round stopped.",
    }[g.phase],
  );
  text(
    "round-clock",
    clock(g.phase === "verdict" ? g.voteRemainingMs : g.remainingMs),
  );
  text("stat-a", g.participants.A);
  text("stat-b", g.participants.B);
  text("stat-events", g.eventCount.toLocaleString("en"));
  text("stat-multiplier", `${g.multiplier}×`);
  text(
    "round-hint",
    data.simulator
      ? `Simulated chat · ${data.speed}× speed · ${g.phase === "verdict" ? "winning chat is voting now" : "bursts, combos, challenges and a raid"}`
      : g.phase === "complete"
        ? g.penalty
          ? `Selected penalty: ${g.penalty}. Always voluntary.`
          : "No penalty selected. Ready for a rematch?"
        : data.mode === "live"
          ? "Live Twitch scoring · announcements are sent by the configured bot."
          : "Try the simulator, or connect both Twitch channels for a live round.",
  );
  const key = data.logs.at(-1)?.id;
  if (key !== previousLog) {
    previousLog = key;
    $("event-log").replaceChildren(
      ...[...data.logs].reverse().map((item) => {
        const li = document.createElement("li"),
          time = document.createElement("time"),
          kind = document.createElement("span"),
          message = document.createElement("span");
        time.textContent = new Date(item.ts).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        kind.className = `log-kind ${item.team ?? ""}`;
        kind.textContent = item.kind.toUpperCase();
        message.textContent = item.text;
        li.append(time, kind, message);
        return li;
      }),
    );
  }
  updateButtons();
}
updateButtons();
subscribe(render, (value) => {
  connected = value;
  $("connection").className = `connection${value ? " connected" : ""}`;
  $("connection").replaceChildren();
  const dot = document.createElement("i");
  $("connection").append(
    dot,
    document.createTextNode(value ? "Arena connected" : "Reconnecting…"),
  );
  updateButtons();
});
