# Chat Clash — 2:45 video script

Target final runtime: **2 minutes 45 seconds**, including opening and closing
frames. Keep the export under 2:50 for margin; the submission requires under
3 minutes. Upload to YouTube as public or unlisted and paste its URL in Devpost.

## Capture plan

Record a complete **normal-speed real round** with your own two authorized Twitch
accounts and their independent chat rooms. Play lasts 3:00, followed by a 0:30
vote; edit that 3:30 source recording into the shorter sequence below. Label the
cuts with elapsed round time. Never imply that real Twitch play runs at 12×.
A separate simulator clip must be labeled **SIMULATOR · 12×** if used at all.

Use only your own chat accounts and footage; do not feature other streamers.
Record narration without music. No copyrighted music, game footage, third-party
logos, emote artwork or unrelated chat messages. Crop Twitch/OBS/Codex application
chrome and brand marks out of the frame; keep only the relevant chat text,
project overlay, project source and Codex conversation. Text references to the
services can explain the integration. The original Chat Clash mark can stay.

Prepare and authorize the accounts off camera. Never record `.env`, the local
token store, Client IDs, activation codes, device codes or token values. Close
unrelated tabs/notifications. Use English and select **Type race** for a reliable
two-account flash demonstration. Approve three safe penalties as both streamers.
Keep two chats and the 1920×1080 overlay visible, with no live broadcast required.

## Shot-by-shot edit

| Video time | Picture and action | Narration / on-screen text |
| --- | --- | --- |
| 0:00–0:10 | Open on the original mark, then a moving scoreboard and a quick RUSH ×2 glimpse from your actual round. | “Two communities. Three minutes. The most active chat wins. This is Chat Clash.” |
| 0:10–0:24 | Cropped local controls: both chats ready, Type race selected, safe penalties and both approvals. Click **Start round**. Cut to the two real chat panes beside the overlay. | “Connect two real Twitch chats and agree on voluntary penalties. Viewers can join with an ordinary message.” Label **REAL TWITCH CHATS · NORMAL SPEED**. |
| 0:24–0:44 | Show a viewer message in each of your two rooms followed by the corresponding score change. Show a later eligible message after the cooldown. Keep one team clearly ahead. | “A first contribution earns four points. Later eligible messages add one, with a five-second cooldown. These messages are moving the real scoreboard.” Keep each message and score response in one continuous shot. |
| 0:44–1:03 | Cut labeled **ROUND ELAPSED 1:30**. Show the same flash prompt in the overlay and both real chats. Type only the requested phrase in one room, then the other, within the window. Cut to the +25 result at elapsed 2:00. | “At halfway, a flash challenge appears in both chats. In this type race, the first correct answer wins the bonus.” Preserve the actual winning team/result; do not stage a mismatched score. |
| 1:03–1:18 | Cut labeled **ROUND ELAPSED 2:30**. Show the coral RUSH ×2 banner and one previously participating viewer's eligible message adding +2. | “The last thirty seconds double every newly awarded point. One final push can change the match.” |
| 1:18–1:38 | Cut labeled **ROUND ELAPSED 3:00**. Freeze on verdict, then let the large vote clock count down. Show the duration in the bot announcement. Immediately send `!vote 2` from a non-bot viewer in the winning room and show that option's count increasing. | “Scores freeze. The winning chat has thirty seconds to choose from the approved list. Vote now: exclamation mark vote, two.” Keep the countdown/message/vote response continuous. |
| 1:38–1:50 | Cut labeled **ROUND ELAPSED 3:30**. Show the actual selected penalty and voluntary-result label. | “The vote selects a friendly consequence. It is always voluntary; the app never performs it automatically.” |
| 1:50–2:03 | Show the overlay as an OBS Browser Source on a plain background you created, at 1920×1080. Crop OBS logos/chrome; let the original result and MVPs remain visible. | “The transparent overlay drops into OBS. Scores, challenge, rush, MVPs and voting are designed to be readable on stream.” |
| 2:03–2:18 | Show this real Codex conversation in a tight crop: the vote-clarity request, concrete diff, then the eight-option overlap fix. Cut to the corresponding final overlay. | “I built Chat Clash with Codex. Human tests exposed late votes. Codex made the deadline clearer, tested the boundary, and fixed a layout problem found in browser review.” |
| 2:18–2:32 | In Codex, show the pure reducer, explicit timestamp tests and mocked integration test, then the real terminal output: **51 tests pass**, **typecheck passes**. Briefly show the build log. Keep secret-bearing files closed. | “Codex also built the engine, simulator and mocked OAuth-to-EventSub tests. One local process, strict TypeScript, and no AI calls during a match.” |
| 2:32–2:45 | Return to the original mark and a clean overlay frame. Text: **RUN LOCALLY · npm ci → npm start · TRY 12× SIMULATOR**. Add the actual repository URL once available. | “Try a full demo without credentials. Chat Clash: less pay-to-win, more people power.” Hold the final card inside this time allocation. |

## Recording checks

- Rehearse the live type race and vote before recording. Use a viewer account
  that is not the bot in the room where it sends messages: bot echoes are filtered.
  Send the vote immediately when the verdict appears; OBS/network latency consumes
  real time. Real voting remains 30 seconds.
- Leave enough time between messages to demonstrate scoring honestly. Do not
  present a simulator score as live chat evidence or claim a live multi-user
  combo, emote-target, paid event or raid test. Those remain mocked/simulated.
- Keep the flash phrase, score response, RUSH ×2, timer and vote count readable
  at the final export size. Review the encoded file, including its last frame.
- Use only actual Codex work and test output. Show development evidence without
  credentials, private participant maps or accepted-answer arrays in the overlay.
- Review the YouTube link while signed out to confirm it plays without access
  requests. Check runtime is under 3:00, audio is clear and no third-party logo or
  copyrighted music slipped into the crop.
- Copy the actual Codex session ID from `/status` into the submission. Complete
  the repository and video URLs in [submission.md](submission.md), then fill in
  and submit the Devpost form before November 2, 2026, 2:00 PM PT.
