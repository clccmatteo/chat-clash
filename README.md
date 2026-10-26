<img src="public/brand/logo.png" width="128" alt="Chat Clash — two colliding speech bubbles">

# Chat Clash

**The most active community wins.** A live, three-minute battle between two Twitch
communities. Messages, new participants, emote combos and flash challenges push a
shared scoreboard. No AI models or paid AI services are used at runtime. The real
Twitch connection uses a free public Twitch developer application and OAuth grants.

Built for the **Codex × TwitchCon Hackathon — November 2, 2026**.
Milestone 2 adds two-channel Twitch EventSub over WebSocket, public-client Device
Code OAuth, automatic token refresh, event deduplication, reward mapping and chat
announcements. The complete local simulator remains available without credentials.

## Run locally

Prerequisite: **Node.js 22** and npm. `.nvmrc` pins the major version for nvm users.

```sh
cd "/Users/matteocolucci/Projects2026/Codex x TwitchCon Hackathon"
nvm use                  # optional, if you use nvm; install with nvm install first
npm install
npm run dev
```

1. Open **http://127.0.0.1:3000/control/**.
2. Click **Start simulator**. The default runs a full **180-second round plus a
   30-second penalty vote**. Select **4×** or **12×** before starting for a faster
   demo; these change the virtual clock, not the scoring rules.
3. Watch the embedded preview, scores, MVPs and event log update live.
4. Use **Stop** to abort a round, **Reset** to clear it, or start a fresh round
   after it ends. Refreshing a page reconnects to the same in-memory match.

**OBS:** Add a **Browser Source**, URL **http://127.0.0.1:3000/overlay/**, width
**1920**, height **1080**. The background is transparent. The preview uses a
checkerboard to demonstrate transparency; that checkerboard is not in the overlay.
The overlay reconnects automatically and honors `prefers-reduced-motion`.

For a new checkout, copy `.env.example` to `.env` if one does not already exist.
Set `TWITCH_CLIENT_ID`, `TWITCH_TEAM_A_LOGIN`, and `TWITCH_TEAM_B_LOGIN`. A blank
`TWITCH_BOT_LOGIN` follows Team A. This is a **PUBLIC client**: no client secret or
redirect URI. Only loopback hosts are supported. `.env` and `.local/` are ignored.
Restarts clear the match and restore startup logins from `.env`; tokens and reward
mappings persist in the owner-only `.local/twitch-tokens.json` file.

**Real-channel setup and a complete offline test with two accounts:**
[docs/twitch-test.md](docs/twitch-test.md). Authorize each distinct account using the
activation code and Twitch link shown in the controls, wait for both chats to
connect, approve penalties, then use **Start round**. No broadcast is required.
Non-Affiliate channels retain chat/raids and display Bits/points as unavailable.

## Scripts and checks

```sh
npm run dev           # server with TypeScript watch mode
npm start             # same server, without watch mode
npm test              # Node test runner, explicit fake-clock timestamps
npm run typecheck     # strict TypeScript, no output files
npm run sim           # full seeded round instantly in the terminal, no server
npm run sim -- 123    # choose another deterministic simulation seed
```

`npm run sim` has its own virtual clock and does not feed a separately running
server. Use **Start simulator** in the control panel to animate the OBS overlay.

## Round timeline

| Elapsed | Phase | Behavior |
| --- | --- | --- |
| 0:00–1:30 | Battle | Normal scoring |
| 1:30–2:00 | Flash challenge | Chat scoring continues; challenge worth +25 |
| 2:00–2:30 | Battle | Normal scoring resumes |
| 2:30–3:00 | RUSH ×2 | All newly awarded base points are doubled |
| 3:00–3:30 | Verdict + vote | Scores freeze; only winning-team votes count |
| 3:30 | Complete | Selected penalty shown; never automatically executed |

## Scoring and edge cases

All scoring values, caps, thresholds and durations live in **`data/config.json`**.
Restart the server after changing the config or challenge library.

| Event | Base points | Limit |
| --- | --- | --- |
| Chat message | +1 | Once per user, per team, every 5 seconds |
| First participation | +3 | Once per user, per team, per round |
| Emote combo | +10 | 5 distinct users sending the same emote within 10 seconds |
| Reinforcement redemption | +5 | 3 redemptions per user per round |
| Bits | +1 per 100 | 10 base points per user per round |
| Incoming raid | +1 per 10 raiders | 50 base points per raid |
| Flash challenge | +25 | One team, once, at the end of the window |
| Final rush | ×2 | Applied after caps; final 30 seconds only |

- First participation includes a user's first valid chat, Reinforcement redemption
  or cheer. A raid scores for the team and does not create a participant.
- Per-user counters are scoped to each team. A viewer can participate in both
  communities independently.
- Partial hundreds of bits accumulate per user across the round. Caps count base
  points, so earning the remaining allowed points during rush doubles those awards.
- Cooldowns and combo windows include their exact 5-second and 10-second edges.
  A qualifying combo consumes its participant set; a fresh set can qualify again.
  Combo credit is shared evenly between its contributors for MVP ranking.
- Emotes are matched using normalized emote metadata, not words that merely look
  like emote names. Ordinary messages can contain several distinct emotes.
- MVPs rank the top three per team by awarded user points, then earliest first
  participation, then user ID. Raid and challenge bonuses are team points.
- Timestamps must be monotonic; stale events are ignored. The Twitch adapter must
  deduplicate provider deliveries before emitting normalized events.
- A tied match has no penalty vote. Each winning-chat user gets one valid vote:
  `!vote 1`, `!vote 2`, etc. Invalid votes do not consume that opportunity. A tied
  penalty vote picks the earliest option in the approved list; no votes means no
  penalty. All scoring and voting windows are exclusive at their end boundary.

## Flash challenges

`data/challenges.json` contains **160 original bilingual records**, each with an
English and Italian prompt: 40 trivia, 30 anagrams, 30 quick math, 30 type-races and
30 emote targets. Every record has a unique ID and deterministic judging metadata.

- **Trivia, anagram, math:** most distinct correct users within the 30-second
  window wins. A tie goes to the team whose correct answer arrived first.
- **Type-race:** the first correct answer wins, as confirmed for this milestone.
- **Emote target:** the first team to reach 10 distinct users sending the target
  emote inside a rolling 10-second window wins. Fewer than 10 does not qualify.
- When timestamps are identical, normalized-event processing order determines the
  first correct answer or finisher. No qualifying answers means no bonus.
- Text judging ignores case, accents and whitespace. Punctuation is significant.
  A localized race prompt displays the localized phrase; either listed language
  is accepted. Anagram prompts specify the language of the scrambled word.
- The selected challenge stays private until 1:30. Accepted answer arrays and raw
  chat messages are never included in HTTP or WebSocket snapshots.

The simulator uses synthetic emote names and produces correct answers, wrong
answers, spam, coordinated bursts, paid events, an incoming raid, uneven activity
and post-round votes. `scripts/build-challenges.py` rebuilds the checked-in library
from authored content using Python's standard library; Python is not a runtime
dependency. Live rounds post flash prompts, results, rush, verdict and penalty-vote
instructions using the configured bot's user token. Simulator rounds never post to
Twitch. Choose a specific next challenge type in the controls for testing. Live
emote targets resolve to actual global Twitch emote IDs and names.

## Penalties

The control panel edits the approved list by selecting from the safe, voluntary
catalog in `data/penalties.json`. Both streamers must approve the current list
before **Start round** succeeds. Editing names or the list clears the UI approvals;
settings and penalties are frozen while a round or vote is active.

**Start simulator** explicitly uses demo approvals and sends nothing to Twitch.
These simulated approvals never become the approvals for a real round. Custom
unreviewed penalties are rejected by the server. Edit the source catalog to add
new safe options for both streamers to review.

## Architecture

```text
data/
  config.json          # scoring, caps and phase timing
  challenges.json      # 160 bilingual challenges
  penalties.json       # safe, voluntary penalty catalog
src/
  game/                # pure reducer, challenge normalization/selection, snapshots
  sim/                 # seeded normalized-event producer and terminal demo
  twitch/              # device OAuth, private tokens, EventSub, dedup and chat queue
  server.ts            # Node HTTP, read-only WebSocket fanout, clock and controls
public/
  overlay/             # transparent 1920×1080 OBS scoreboard
  control/             # responsive streamer control panel and live preview
  shared/              # reconnecting WebSocket client
  brand/               # generated 1024px transparent mark and favicon exports
test/                  # scoring, fake-clock game tests, data and server integration
docs/codex-log.md       # implementation and verification record
AGENTS.md              # project brief and contributor conventions
```

No frontend build, external fonts, CDN or AI SDK is used. Twitch is the only
external runtime service. One process owns one match. `src/game/` takes events and explicit timestamps and returns
new state; it does not read files, call clocks, start timers or access the network.
The server owns I/O, randomness for challenge selection, bounded logs and 4 Hz
snapshots. Shared clients reconnect with backoff and mark stale connections.

Local endpoints: `GET /health`, `GET /api/state`, `POST /api/control`, and the
read-only WebSocket `/ws`. Same-origin checks and loopback binding are enforced.
Controls accept `configure`, `start`, `start-simulator`, `stop`, and `reset`.
Twitch controls use `POST /api/twitch`; activation codes are fetched directly by
the controls from `GET /api/twitch/device` and are never broadcast to OBS clients.
Live rounds stop on lost chat connections; planned reconnects preserve subscriptions.
Normalizing, deduplicating, bot-echo filtering and native emote/reward ID checks
happen before an event reaches the pure game engine.

## Brand

`public/brand/logo.png` is the **1024×1024 transparent PNG** generated for this
project; PNG and multiresolution ICO favicons are included. The mark shows two
colliding speech bubbles with a spark, without third-party logos or characters.
The generation prompt and export provenance are in `public/brand/README.md`.

## Next milestone

- Add authentication and deployment hardening before exposing controls publicly.
- Exercise full matches with the real broadcaster accounts after their owners finish
  device authorization; use the offline test guide above.

## License

To be selected before public release.
