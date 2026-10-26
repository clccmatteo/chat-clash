import type { GameState, Team } from "../game/types.js";
import { config } from "../game/index.js";
import { SYSTEM_PREFIX } from "./normalize.js";
export type Announcement = { team: Team; text: string };
function chunks(lines: string[]) {
  const result: string[] = [];
  let current = SYSTEM_PREFIX;
  for (const line of lines) {
    if (current.length + line.length + 1 > 500 && current !== SYSTEM_PREFIX) {
      result.push(current);
      current = SYSTEM_PREFIX;
    }
    if (line.length + SYSTEM_PREFIX.length > 500)
      throw new Error("System announcement line is too long");
    current += (current === SYSTEM_PREFIX ? "" : " | ") + line;
    // Account for the separator before the next line, keeping Twitch's limit.
    if (current.length > 500) {
      const cut = current.lastIndexOf(" | ");
      result.push(current.slice(0, cut));
      current = SYSTEM_PREFIX + line;
    }
  }
  if (current !== SYSTEM_PREFIX) result.push(current);
  return result;
}
export function roundAnnouncements(
  state: GameState,
  previous: string,
): Announcement[] {
  const result: Announcement[] = [],
    both = (lines: string[]) => {
      for (const team of ["A", "B"] as const)
        for (const text of chunks(lines)) result.push({ team, text });
    };
  const lang = state.settings.language,
    it = lang === "it",
    name = (team: Team) => state.settings.teams[team].name;
  if (previous === "flash" && state.challengeProgress.judged) {
    const winner = state.challengeProgress.winner;
    both([
      winner
        ? `${name(winner)} +${config.scoring.challengeBonus}! ${it ? "Sfida lampo vinta." : "Flash challenge won."}`
        : it
          ? "Sfida lampo in parità: nessun bonus."
          : "Flash challenge tied: no bonus.",
    ]);
  }
  if (state.phase === "flash") {
    const seconds =
      (config.timing.flashEndMs - config.timing.flashStartMs) / 1000;
    const race =
      state.challenge.type === "type-race" ||
      state.challenge.type === "emote-target";
    both([
      `${it ? "SFIDA LAMPO" : "FLASH CHALLENGE"} (${seconds}s, +${config.scoring.challengeBonus}): ${state.challenge.prompt[lang]}`,
      race
        ? it
          ? "Vince chi completa per primo."
          : "First to finish wins."
        : it
          ? "Vince la squadra con più utenti diversi che rispondono correttamente. Parità: prima risposta corretta."
          : "Most distinct correct users wins. Ties: first correct answer.",
    ]);
  } else if (state.phase === "rush")
    both([
      it
        ? "RUSH FINALE! Tutti i punti raddoppiano!"
        : "FINAL RUSH! All points are doubled!",
    ]);
  else if (state.phase === "verdict") {
    if (!state.winner)
      both([it ? "Parità! Nessuna penitenza." : "It's a draw! No penalty."]);
    else {
      both([
        `${name(state.winner)} ${it ? "vince!" : "wins!"} ${it ? "Solo la chat vincente vota la penitenza." : "Only the winning chat votes on the penalty."}`,
      ]);
      for (const text of chunks([
        it
          ? `Vota entro ${config.timing.voteMs / 1000}s con !vote NUMERO. Un voto a persona.`
          : `Vote within ${config.timing.voteMs / 1000}s using !vote NUMBER. One vote per user.`,
        ...state.settings.penalties.map((p, i) => `!vote ${i + 1}: ${p}`),
        it ? "Sempre sicuro e volontario." : "Always safe and voluntary.",
      ]))
        result.push({ team: state.winner, text });
    }
  } else if (state.phase === "complete")
    both([
      state.penalty
        ? `${it ? "Penitenza scelta" : "Selected penalty"}: ${state.penalty}. ${it ? "La partecipazione è volontaria." : "Participation is voluntary."}`
        : it
          ? "Round finito. Nessuna penitenza scelta."
          : "Round complete. No penalty selected.",
    ]);
  else if (state.phase === "stopped")
    both([
      it
        ? "Round interrotto. I punteggi sono bloccati."
        : "Round stopped. Scores are frozen.",
    ]);
  else if (state.phase === "battle" && previous === "idle")
    both([
      `${it ? "BATTAGLIA" : "BATTLE"}! ${name("A")} vs ${name("B")} · ${config.timing.roundMs / 1000}s. ${it ? "Ogni voce conta!" : "Every voice counts!"}`,
    ]);
  return result;
}
