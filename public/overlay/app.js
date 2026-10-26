import { subscribe, text, clock } from "/shared/stream.js";

const $ = (id) => document.getElementById(id);
function fit() {
  $("arena").style.transform =
    `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
}
addEventListener("resize", fit);
fit();
let lastMvp = "",
  lastVotes = "";
subscribe(
  ({ game: g }) => {
    document.documentElement.lang = g.language;
    for (const team of ["A", "B"]) {
      const key = team.toLowerCase();
      text(`name-${key}`, g.teams[team].name);
      text(`channel-${key}`, `@${g.teams[team].channel}`);
      text(`score-${key}`, g.scores[team].toLocaleString("en"));
      text(`people-${key}`, `${g.participants[team]} PLAYERS`);
    }
    const total = g.scores.A + g.scores.B;
    const share = total ? (g.scores.A / total) * 100 : 50;
    $("bar-a").style.width = `${share}%`;
    $("bar-spark").style.left = `${share}%`;
    $("meter").setAttribute(
      "aria-label",
      `${g.teams.A.name}: ${g.scores.A} points; ${g.teams.B.name}: ${g.scores.B} points`,
    );
    text(
      "timer",
      clock(g.phase === "verdict" ? g.voteRemainingMs : g.remainingMs),
    );
    text(
      "timer-label",
      g.phase === "verdict"
        ? "PENALTY VOTE"
        : g.phase === "complete"
          ? "ROUND COMPLETE"
          : "ROUND 01",
    );
    $("timer").parentElement.classList.toggle("voting", g.phase === "verdict" && !!g.winner);
    text(
      "phase",
      {
        idle: "READY TO CLASH",
        battle: "BATTLE",
        flash: "FLASH CHALLENGE",
        rush: "RUSH ×2",
        verdict: g.winner ? "VERDICT · VOTE OPEN" : "VERDICT",
        complete: "ROUND COMPLETE",
        stopped: "ROUND STOPPED",
      }[g.phase],
    );
    $("phase").className = `phase ${g.phase}`;
    text(
      "phase-detail",
      {
        idle: "Every voice counts.",
        battle: "Make some noise. Move the bar.",
        flash: "A quick mind. A louder community.",
        rush: "Last 30 seconds. Every point doubled.",
        verdict: g.winner
          ? "Winning chat, choose your penalty."
          : "Both communities brought the energy.",
        complete: "GG. Same time, next round?",
        stopped: "Take a breath. Rally your crew.",
      }[g.phase],
    );
    const mvp = JSON.stringify(g.mvps);
    if (mvp !== lastMvp) {
      lastMvp = mvp;
      for (const team of ["A", "B"]) {
        const rows = Array.from({ length: 3 }, (_, i) => {
          const u = g.mvps[team][i],
            li = document.createElement("li");
          const rank = document.createElement("span");
          rank.className = "rank";
          rank.textContent = `0${i + 1}`;
          const name = document.createElement("span");
          name.className = "username";
          name.textContent = u?.userName ?? "Your next MVP";
          const score = document.createElement("strong");
          score.textContent = u ? `${u.points}` : "—";
          li.append(rank, name, score);
          return li;
        });
        $(`mvp-${team.toLowerCase()}`).replaceChildren(...rows);
      }
    }
    const c = g.challenge;
    $("challenge-card").hidden = !c?.showCard;
    if (c) {
      text("challenge-type", c.type.replaceAll("-", " ").toUpperCase());
      text("challenge-prompt", c.prompt);
      const race = ["type-race", "emote-target"].includes(c.type);
      text(
        "challenge-rule",
        c.judged
          ? c.winner
            ? `${g.teams[c.winner].name} takes +${g.rules.scoring.challengeBonus}!`
            : "A draw. No bonus awarded."
          : c.type === "emote-target"
            ? "Send the actual emote. First team to complete the combo wins."
            : race
              ? "First team to finish wins. Case, accents and spaces are normalized."
              : "Most distinct correct users wins. Ties go to the first correct answer.",
      );
      text("challenge-bonus", `+${g.rules.scoring.challengeBonus} PTS`);
      text(
        "answers-a",
        `${c.counts.A} ${c.type === "emote-target" ? "users" : "correct"}`,
      );
      text(
        "answers-b",
        `${c.counts.B} ${c.type === "emote-target" ? "users" : "correct"}`,
      );
      text("challenge-clock", clock(c.remainingMs));
    }
    const verdict = ["verdict", "complete"].includes(g.phase);
    $("verdict-card").hidden = !verdict;
    $("vote-countdown").hidden = g.phase !== "verdict" || !g.winner;
    text("vote-clock", clock(g.voteRemainingMs));
    if (verdict) {
      text(
        "verdict-title",
        g.winner
          ? `${g.teams[g.winner].name.toUpperCase()} WINS!`
          : "IT’S A DRAW!",
      );
      text(
        "verdict-detail",
        g.phase === "complete"
          ? g.penalty
            ? `The vote is in: ${g.penalty}`
            : g.winner
              ? "No votes cast. No penalty selected."
              : "A rematch is calling."
          : g.winner
            ? `Winning chat: vote now with !vote 1–${g.penalties.length}`
            : "No penalty. Just bragging rights for both teams.",
      );
      const votes = JSON.stringify([g.penalties, g.votes, g.phase, g.winner]);
      if (votes !== lastVotes) {
        lastVotes = votes;
        $("vote-options").classList.toggle(
          "many-options",
          g.penalties.length > 4,
        );
        $("vote-options").replaceChildren(
          ...(g.phase === "verdict" && g.winner
            ? g.penalties.map((p, i) => {
                const li = document.createElement("li"),
                  cmd = document.createElement("b"),
                  label = document.createElement("span"),
                  count = document.createElement("small");
                cmd.textContent = `!vote ${i + 1}`;
                label.textContent = p;
              count.textContent = `${g.votes[i]} ${g.votes[i] === 1 ? "vote" : "votes"}`;
                li.append(cmd, label, count);
                return li;
              })
            : []),
        );
      }
    }
  },
  (connected) => {
    $("connection").hidden = connected;
    text("connection", "RECONNECTING TO ARENA · SCORES PAUSED ON SCREEN");
  },
);
