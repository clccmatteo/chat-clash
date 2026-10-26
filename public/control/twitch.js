import { text } from "/shared/stream.js";
const $ = (id) => document.getElementById(id);
export function createTwitchControls({ notice, onBusyChange }) {
  let latest,
    connection = false,
    busy = false,
    roundBusy = false,
    codeKey = "",
    accountKey = "",
    pollTimer,
    polling = false,
    lastPending = "";
  const cards = new Map();
  function dirty() {
    if (!latest) return false;
    return (
      ["A", "B"].some(
        (team) =>
          $(`channel-${team.toLowerCase()}`).value.toLowerCase() !==
          latest.twitch.teams[team].login,
      ) ||
      $("bot-login").value.toLowerCase() !==
        (latest.twitch.bot.followsTeamA ? "" : latest.twitch.bot.login)
    );
  }
  async function action(action, role, extras = {}) {
    if (busy) return;
    busy = true;
    onBusyChange();
    update();
    try {
      const response = await fetch("/api/twitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, role, ...extras }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Twitch action failed");
      renderCodes(data.authorizations);
      if (action === "authorize")
        notice(
          "Open the activation link in a browser signed in as the displayed account, enter the code, and review the permissions.",
        );
      else if (action === "map-reward")
        notice("Reinforcement reward mapping saved.");
      else if (action === "disconnect")
        notice(
          "Account disconnected locally. Shared broadcaster/bot grants disconnect both roles.",
        );
      else if (action === "reconnect")
        notice("Reconnecting EventSub. Watch the channel status below.");
      schedulePoll();
    } catch (error) {
      notice(error.message || "Cannot reach the server", true);
    } finally {
      busy = false;
      update();
      onBusyChange();
    }
  }
  function makeCard(role, login) {
    const card = document.createElement("div");
    card.className = `twitch-account ${role.toLowerCase()}`;
    const heading = document.createElement("div"),
      tag = document.createElement("b"),
      who = document.createElement("strong"),
      badge = document.createElement("span");
    heading.className = "twitch-account-heading";
    tag.textContent = role === "bot" ? "BOT" : role;
    who.textContent = `@${login}`;
    badge.className = "twitch-badge";
    heading.append(tag, who, badge);
    const details = document.createElement("p"),
      activity = document.createElement("small"),
      error = document.createElement("p");
    error.className = "twitch-error";
    const buttons = document.createElement("div"),
      authorize = document.createElement("button"),
      disconnect = document.createElement("button");
    buttons.className = "twitch-buttons";
    authorize.type = disconnect.type = "button";
    authorize.className = "button";
    disconnect.className = "text-button";
    authorize.textContent = `Authorize ${role === "bot" ? "bot" : `Team ${role}`}`;
    disconnect.textContent = "Disconnect";
    authorize.addEventListener("click", () => void action("authorize", role));
    disconnect.addEventListener("click", () => void action("disconnect", role));
    buttons.append(authorize, disconnect);
    const label = document.createElement("label"),
      select = document.createElement("select");
    label.className = "reward-label";
    label.textContent = "Reinforcement reward";
    select.setAttribute("aria-label", `Team ${role} Reinforcement reward`);
    label.append(select);
    select.addEventListener(
      "change",
      () => void action("map-reward", role, { rewardId: select.value }),
    );
    card.append(heading, details, activity, label, error, buttons);
    cards.set(role, {
      card,
      who,
      badge,
      details,
      activity,
      error,
      authorize,
      disconnect,
      label,
      select,
      rewardKey: "",
    });
    return card;
  }
  function renderCodes(items) {
    const key = JSON.stringify(items);
    if (codeKey === key) return;
    codeKey = key;
    $("device-authorizations").replaceChildren(
      ...items.map((item) => {
        const box = document.createElement("div"),
          heading = document.createElement("strong"),
          code = document.createElement("code"),
          detail = document.createElement("p"),
          link = document.createElement("a"),
          cancel = document.createElement("button");
        box.className = "device-code";
        heading.textContent = `Authorize @${item.login}`;
        code.textContent =
          item.status === "error"
            ? "TRY AGAIN"
            : item.userCode || "REQUESTING CODE…";
        detail.textContent =
          item.status === "error"
            ? item.error
            : item.status === "checking"
              ? "Checking account and permissions…"
              : item.error ||
                `Use the account shown above. Code expires at ${new Date(item.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
        link.textContent = "Open twitch.tv/activate ↗";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "button dark";
        if (item.verificationUri && item.status !== "error")
          link.href = item.verificationUri;
        else link.hidden = true;
        cancel.type = "button";
        cancel.className = "text-button";
        cancel.textContent =
          item.status === "error" ? "Dismiss" : "Cancel authorization";
        cancel.addEventListener(
          "click",
          () => void action("cancel", item.role),
        );
        box.append(heading, code, detail, link, cancel);
        return box;
      }),
    );
  }
  async function pollCodes() {
    if (polling) return;
    polling = true;
    try {
      const response = await fetch("/api/twitch/device", { cache: "no-store" });
      if (response.ok) renderCodes((await response.json()).authorizations);
    } catch {
      /* Connection indicator already explains a server outage. */
    } finally {
      polling = false;
      if (latest?.twitch.pendingRoles.length) schedulePoll();
    }
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void pollCodes(), 1500);
  }
  function update(
    data = latest,
    connected = connection,
    parentBusy = roundBusy,
  ) {
    latest = data;
    connection = connected;
    roundBusy = parentBusy;
    if (!data) return;
    const t = data.twitch,
      active = ["battle", "flash", "rush", "verdict"].includes(data.game.phase),
      disabled = active || busy || parentBusy || !connected;
    const roles = [
      "A",
      "B",
      ...([t.teams.A.login, t.teams.B.login].includes(t.bot.login)
        ? []
        : ["bot"]),
    ];
    const key = roles
      .map(
        (role) =>
          `${role}:${role === "bot" ? t.bot.login : t.teams[role].login}`,
      )
      .join("|");
    if (key !== accountKey) {
      accountKey = key;
      cards.clear();
      $("twitch-accounts").replaceChildren(
        ...roles.map((role) =>
          makeCard(role, role === "bot" ? t.bot.login : t.teams[role].login),
        ),
      );
    }
    text(
      "twitch-summary",
      t.ready
        ? "BOTH CHATS READY"
        : t.initializing
          ? "RESTORING TOKENS"
          : "NOT CONNECTED",
    );
    text(
      "twitch-setup",
      !t.configured
        ? "Add the public TWITCH_CLIENT_ID to .env, then restart. No client secret or redirect is needed. The simulator works without Twitch."
        : dirty()
          ? "Save the channel and bot settings before authorizing."
          : t.bot.followsTeamA
            ? `@${t.bot.login} is also the bot. Team A’s code includes its chat permissions. Activate Team B in a separate account session.`
            : `Bot: @${t.bot.login}. Each distinct account authorizes once. Activate each code while signed in as its matching account.`,
    );
    text("twitch-error", t.error);
    $("twitch-error").hidden = !t.error;
    for (const role of roles) {
      const c = cards.get(role),
        state = role === "bot" ? t.bot : t.teams[role],
        pending = t.pendingRoles.includes(role);
      c.badge.textContent = pending
        ? "AUTHORIZE"
        : role === "bot"
          ? state.authorized
            ? "AUTHORIZED"
            : "NEEDS CODE"
          : state.chatReady
            ? "CHAT CONNECTED"
            : state.authorized
              ? "CONNECTING"
              : "NEEDS CODE";
      c.badge.classList.toggle(
        "ready",
        role === "bot" ? state.authorized : state.chatReady,
      );
      c.details.textContent =
        role === "bot"
          ? "Reads and sends system messages using its own user token. No moderator role required for normal open chat."
          : !state.authorized
            ? "Broadcaster grant: channel:bot, channel points and Bits read access."
            : state.channelPoints === "unsupported"
              ? `Chat ${state.chatReady ? "ready" : "connecting"} · raids ${state.raidsReady ? "ready" : "connecting"}. Bits and channel points unavailable: this account is not Affiliate / Partner.`
              : `Bits: ${state.bits} · Channel points: ${state.channelPoints} · Raids: ${state.raidsReady ? "ready" : "connecting"}`;
      c.activity.textContent =
        role !== "bot" && state.eventsReceived
          ? `${state.eventsReceived} events received${state.lastEventAt ? ` · last at ${new Date(state.lastEventAt).toLocaleTimeString()}` : ""}`
          : "";
      c.error.textContent = state.error;
      c.error.hidden = !state.error;
      c.authorize.disabled =
        disabled || pending || !t.configured || dirty() || t.initializing;
      c.disconnect.disabled = disabled || !state.authorized;
      c.label.hidden =
        role === "bot" ||
        !state.authorized ||
        state.channelPoints === "unsupported";
      if (role !== "bot") {
        const rewardKey = JSON.stringify([state.rewards, state.rewardId]);
        if (rewardKey !== c.rewardKey) {
          c.rewardKey = rewardKey;
          const none = document.createElement("option");
          none.value = "";
          none.textContent = "No reward mapped";
          c.select.replaceChildren(
            none,
            ...state.rewards.map((reward) => {
              const option = document.createElement("option");
              option.value = reward.id;
              option.textContent = `${reward.title} · ${reward.cost} channel points`;
              option.disabled = !reward.enabled;
              return option;
            }),
          );
          c.select.value = state.rewardId;
        }
        c.select.disabled = disabled;
      }
    }
    $("twitch-reconnect").disabled =
      disabled || !t.configured || t.pendingRoles.length > 0;
    const pending = t.pendingRoles.join(",");
    if (lastPending !== pending) {
      lastPending = pending;
      void pollCodes();
    }
  }
  $("twitch-reconnect").addEventListener(
    "click",
    () => void action("reconnect"),
  );
  for (const id of ["channel-a", "channel-b", "bot-login"])
    $(id).addEventListener("input", () => {
      update();
      onBusyChange();
    });
  void pollCodes();
  return { update, dirty, isBusy: () => busy };
}
