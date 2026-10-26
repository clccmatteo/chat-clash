# Codex build log

## 2026-10-25 — Game engine, simulator and local UI

- Started from an empty workspace. Added Node 22 / strict TypeScript scaffold,
  native Node test runner, `ws`, `tsx`, and a single scoring/timing config.
- Built a pure game reducer with explicit timestamps, immutable state transitions,
  cooldowns, caps, distinct-user combos, challenge judging, MVPs and penalty votes.
- The first test pass caught a privacy assertion whose own prompt contained an
  accepted answer; changed the fixture prompt so the assertion tests answer leakage.
- Generated the collision-bubble mark with the built-in image generation tool.
  Full prompt and asset provenance are in `public/brand/README.md`.

- Confirmed judging with the user: type-races and emote targets are first to finish;
  trivia, anagrams and math use distinct correct users and earliest-answer ties.
- Added 160 original EN/IT challenges, authored source generator, data integrity
  checks, and independent math/anagram verification.
- Added seeded simulator with bursts, uneven activity, chat spam, correct/wrong
  challenge answers, capped paid events, a raid, and winning-team penalty votes.
- Added local HTTP + WebSocket server and read-only public snapshots; same-origin
  checks, loopback binding, bounded request bodies and event logs. Safe penalty
  selection is limited to a reviewed catalog and frozen during active rounds.
- Added a coral/mint arcade overlay and responsive control panel, embedded preview,
  system/activity log, copyable OBS URL, reconnect behavior and reduced-motion CSS.
- Browser review at 442px and 1280px caught a missing interpolation in the preview's
  scale transform. Fixed it. Removed `color-scheme: dark` from the overlay because
  its canvas fallback obscured transparency inside the preview iframe.
- Added HTTP/WebSocket integration tests that run every phase and voting with an
  explicit fake clock, verify privacy, reject invalid commands and cross-origin
  clients, and cover stop/reset.
- Exported the generated mark as a 1024×1024 RGBA PNG plus 64px PNG and multiresolution
  ICO favicon. Included it in overlay, controls and README.
- Initialized a local Git repository without creating a commit. No secrets added.
- Verification: 33 tests pass on the host Node 24 runtime **and Node 22.23.4**;
  strict TypeScript passes; terminal simulator completes; desktop and narrow browser
  layouts and transparent preview visually checked.
- Ran a full normal-speed browser demo: 180 seconds of play plus 30 seconds of
  voting, 3,350 events and 44 valid votes. Scores froze during the vote. Saved local
  screenshots and runtime evidence under ignored `artifacts/`.
- Final timing review added explicit first-arrival latches for same-millisecond
  challenge answers and finishes. A regression test covers race and emote finish
  collisions. Empty/no-qualifying challenges still award no bonus.
- Verified all eight penalty options with a frozen test clock; compacted the vote
  card so it clears the MVP panels and central brand mark. Fixed singular vote copy
  and the control panel's completion notice. Temporary preview server removed.

### Current scope

One local in-memory match, synthetic chat and demo approvals. No real Twitch
connection, OAuth, chat sending, persistence or public deployment at that stage.
Penalty outcomes are display-only and voluntary. Emote targets use synthetic
metadata until the real adapter resolves native emotes. No runtime AI calls.

## 2026-10-25 — Twitch connection and real-account checks

- User specified a public Twitch client and Device Code Grant (no secret/redirect),
  configurable env/control logins, persistent local tokens, an optional separate bot,
  broadcaster `channel:bot` grants, and graceful non-Affiliate behavior. Followed
  those requirements and official Twitch docs; no unrelated service is in the app.
- Prepared ignored `.env` with the user's requested team logins, preserving any
  existing values. Client ID remains for the user to fill; no secret was requested.
- Added device authorization polling, pending/slow-down/expiry/cancel states, strict
  account identity and scope checks, startup/hourly token validation, single-flight
  public refreshes and atomic owner-only local token storage. One shared account
  gets one combined grant when it is both broadcaster and bot.
- Added principal-grouped EventSub sockets, welcome/subscription setup, keepalive
  watchdogs, validated reconnect URLs, subscription-preserving handoff, fresh
  subscriptions after unexpected loss, revocation handling and bounded dedup caches.
- Normalization verifies broadcaster/conditions, maps only the selected reward ID,
  extracts emote IDs, ignores Shared Chat copies, anonymous cheers and bot echoes,
  and checks upstream timestamps. The server stamps accepted events in game time.
- Non-Affiliate/Partner channels skip Bits and redemption subscriptions; chat/raids
  keep working. Live emote challenges use actual global emotes, not synthetic names.
- Added a bounded per-team chat queue, 500-character chunking, pacing, delivery
  checks and round/phase cancellation so obsolete queued prompts are not sent.
- Connected live start gating, simulator isolation, automatic stop on chat loss,
  optional challenge type selection, device codes in controls, status cards,
  configurable bot and native reward selectors. Codes/tokens are excluded from
  WebSocket snapshots. Wrote the full offline two-account test guide.
- Verification includes mocked full OAuth → EventSub → scoring → challenge → vote
  chat delivery, separate-bot and non-Affiliate cases, wrong-account rejection,
  restart restoration and no real Twitch requests from automated tests.
- Real-account validation awaits the user's actual Client ID and human activation
  of each account. No successful real-channel connection is claimed yet.
- Final checks: **50 tests pass on Node 24 and Node 22.23.4**, strict TypeScript
  passes, and frontend modules pass syntax checks. Browser smoke test completed a
  12× type-race simulation through verdict/voting; controls were reset to idle and
  normal speed. No browser errors. Saved local UI proof under ignored `artifacts/`.
- Added regressions for post-device-flow refresh rotation, temporary device-poll
  network failures and explicitly disabling a reward mapping across restarts.
  Verified `.env` and `.local/twitch-tokens.json` are Git-ignored.

### Real-account connection setup

- Restarted the development server after the user supplied the public Client ID.
  Updated the ignored startup default for Team B to `your_channel_b` and aligned the
  offline guide with the user's new account name.
- Confirmed the saved `your_channel_a` grant restores successfully: real EventSub chat and
  incoming-raid subscriptions are connected. Twitch reports the channel as
  non-Affiliate/Partner; optional Bits and points are unavailable as expected.
- Requested Team B's device authorization in the local controls. After the user
  completed Twitch approval, verified both `your_channel_a` and `your_channel_b` have real
  chat and incoming-raid subscriptions connected, no pending authorizations and no
  connection errors. Both channels are non-Affiliate/Partner. Selected a type-race
  challenge for the offline two-account test.
- Verification: 50 mocked tests and strict TypeScript pass. Confirmed `.env` and
  token-file permissions are 0600, local token directory 0700, and both files remain
  Git-ignored. No real chat messages were sent by these checks.
- Completed a real, normal-speed offline round with the user: one initial message
  arrived from each channel while idle, scores stayed zero, and the user confirmed
  bot start announcements in both rooms. First round messages scored +4 each;
  later eligible messages scored +1. In rush, observed +2 / +0 / +2 with a
  sub-five-second middle message. Final score was Team A 10, Team B 7.
- Scores froze for verdict; a winning-room `!vote 2` selected the second approved
  voluntary penalty. Flash had no recognized correct answer; the user confirmed
  they missed the window or used different text and requested a repeat.
  Saved safe public-state evidence and result screenshots under ignored artifacts/.
- Restarted after the completed live round and verified both saved grants restore
  with chat and raids ready, no pending device flow and no repeated authorization.
  Began a type-race rematch at the user's request to repeat the missed flash check.
- Real flash rematch passed: both teams submitted the exact displayed phrase
  `the final push` within the window. Team B arrived first; at 120 seconds the
  one-to-one answer tie resolved to Team B and +25 changed its score from 5 to 30.
- User confirmed the flash prompt and challenge result appeared in both real chat
  rooms. The rematch completed at Team B 30, Team A 5. Its final chat messages
  arrived after the voting deadline, so no vote or penalty was recorded in that
  round; the first round had already verified a valid winning-room vote.
- Left the server running with both real channels ready and the final result in
  the controls. Added explicit remaining-time guidance to the offline test guide.
  Duplicate/losing-room vote rejection, multi-user combos, paid events and raid
  event ingestion remain covered by mocked tests rather than this two-account
  manual session. No secrets or token contents were printed or committed.

## 2026-10-26 — Submission preparation: initial snapshot

- Before changing project files, verified this repository had no commits and that
  `.env`, `.local/` and `artifacts/` are excluded by `.gitignore`; `.env.example`
  is intentionally included and contains names, blank values and a local path.
- Scanned all 51 candidate files against private credential values read locally
  without displaying them, and checked credential assignment/token patterns.
  No private value matched. The only pattern hit was the documented Client ID
  placeholder in the Twitch test guide. No secret or real Client ID is staged.
- Verified the current project before its initial commit: `npm test` passes all
  50 tests and `npm run typecheck` passes (host Node 24.21.0).
- Created the initial local snapshot of the existing project. No deployment,
  remote or push; game rules, config and Twitch behavior are unchanged.

### Step 1 — Fresh-clone check

- Cloned the initial commit into a temporary directory, initially without `.env`
  or `.local/`, and cleared Twitch configuration from the child environment.
- On Node 22.23.4, `npm ci`, `npm test` (50/50), `npm run typecheck` and
  `npm run sim` all passed. Install reported zero vulnerabilities.
- Started the actual `npm start` command on an isolated loopback port, confirmed
  both pages return HTTP 200 and ran a complete 12× round through flash, rush,
  verdict/vote and a penalty result in 17.5 seconds (over 3,000 events).
- No first-run code fix was needed. Added reproducible judge instructions in
  `docs/fresh-clone.md`. Startup may create ignored local storage without OAuth.
- Verification after this step: all 50 tests and strict TypeScript pass on Node 22.
  Temporary logs and evidence remain outside committed source. No deployment/push.

### Step 2 — README for judges

- Reordered the README around a one-paragraph pitch, credential-free 60-second
  quick start (`npm ci`, `npm start`, 12× simulator, OBS), then real-channel setup.
  Removed the machine-specific checkout path and internal milestone/roadmap copy.
- Added concrete Codex examples from this log and honest limitations: local-only
  controls without auth, one in-memory match, and features verified by mocks and
  simulation rather than a live multi-user test. Preserved the narrower real
  two-account evidence and the missed voting deadline.
- Verification: all 50 tests and strict TypeScript pass on Node 22. Documentation
  only; no scoring, timing, architecture or Twitch integration changes.

### Step 3 — Generic documentation

- Replaced personal channel logins throughout tracked text, including historical
  setup notes and popout-chat URLs, with `your_channel_a` / `your_channel_b`.
  These stand for the two human-controlled test accounts, not literal accounts
  that judges should authorize. The record of actual manual checks is preserved.
- Made the setup guide start from `.env.example` only when `.env` is absent and
  use the same `npm ci` / `npm start` path as the README. Left the private local
  configuration untouched. `.env.example` contains variable names, blank values
  and its documented local storage path only.
- Verification: tracked-text scan found no personal channel logins; all 50 tests
  and strict TypeScript pass on Node 22. No runtime behavior changed.

### Step 4 — License and content provenance

- Added the MIT license with Copyright (c) 2026 Matteo Colucci; set the package
  license to MIT in package.json and root lockfile metadata; updated README.
- Inspected the logo and its recorded generation prompt, the complete authored
  challenge generator and 160 generated EN/IT records, and all eight penalties.
  The logo is an original generated collision-bubble mark; challenge/penalty text
  is original project content. No third-party logo, character or branded challenge
  appears in those shipped assets. Generic words are used in their ordinary sense.
- Distinguished documentation's service references and runtime Twitch emote
  metadata from the project's original artwork/content. Dependencies keep their
  own licenses. No creative asset or game content needed replacement.
- Verification: all 50 tests and strict TypeScript pass on Node 22. Dependencies,
  challenge records, penalties and game configuration are unchanged.

### Step 5 — Live voting clarity

- Kept the existing 30-second vote window and server-owned countdown. Added a
  large bordered `VOTE CLOSES IN` timer beside the options, a mint top timer and
  `VERDICT · VOTE OPEN` banner. The extra timer hides after voting and for draws.
  Names and penalty text still use textContent. No new timers or scoring values.
- Existing chat instructions already included `30s`; made the duration explicit
  as `30 seconds` in the first verdict announcement to both rooms and `vote NOW`
  in the winning-room instructions, in English and Italian. Message routing,
  chunking, OAuth, EventSub and delivery behavior are unchanged.
- Extended mocked announcement checks for both languages, the config-derived
  duration, first message to both teams, winner-only options and 500-character
  chunks. Added a fake-clock regression for 30,000 → 1 → 0 ms, frozen scores,
  a final in-window vote and rejection exactly at the closing boundary.
- Browser-verified a full 12× simulator round in an isolated credential-free copy
  at 1920×1080: both prominent timers displayed 00:28 with visible vote options.
  Screenshot saved under ignored artifacts/submission/. No real chat was sent.
- Verification: all 51 tests and strict TypeScript pass on Node 22; overlay module
  syntax passes. data/config.json, game engine and Twitch transport are unchanged.

### Step 6 — Video readiness

- Used the better-ui skill for a scoped visual pass, retaining the existing design.
  Replayed full 12× rounds in the isolated simulator: 1920×1080 overlay and
  1280×720 laptop controls (measured DOM viewports).
- Inspected type-race and longer emote-target flash prompts, coral RUSH ×2,
  verdict/vote, the default three options and the maximum eight-option list,
  plus final penalty and control-panel status through every phase.
- Found the eight-option vote card overlapped the center logo after the new timer.
  Tightened only that card's spacing, made the vote banner mint, enlarged final
  penalty copy and added an explicit voluntary-result label. Increased the control
  round hint to 12px and named FLASH / RUSH ×2 in its status; removed milestone
  wording from the footer. No layout redesign or external assets/dependencies.
- Replayed the final UI: all eight options clear the logo/MVP panels, the flash
  prompt fits, and the result is distinct from voting. No browser errors/warnings.
  Saved local screenshots and the scoped report in docs/video-readiness.md.
- Verification: all 51 tests and strict TypeScript pass on Node 22; frontend
  module syntax passes. Actual OBS capture/compositing and compression remain
  manual recording checks. No real chat, deployment or push.

### Step 7 — English submission drafts

- Added docs/submission.md with tagline, features, engine/simulator/EventSub/
  public Device Code OAuth/overlay architecture, safety/privacy, original content,
  concrete Codex iterations from this log, judge testing and honest limitations.
  Left explicit TODOs for the repository URL, actual session ID and YouTube URL.
- Added a timestamped 2:45 shot-by-shot script, leaving margin under 2:50/3:00.
  It edits a normal-speed 3:30 real round with elapsed-time labels and covers
  real messages moving scores, flash, RUSH ×2, vote, penalty, OBS and actual Codex
  development/test evidence. No runtime or rules changes.
- Recording guidance requires own accounts, narration without music, crops that
  exclude third-party marks/other streamers and all credentials, and no simulated
  footage represented as live evidence. Session ID retrieval, recording/upload
  and the final Devpost form remain human tasks; nothing has been submitted.
- Verification: all 51 tests and strict TypeScript pass on Node 22. Script ends
  at 2:45 and includes each requested shot. No deployment, remote or push.

### Step 8 — Final safety pass

- Scanned all refs/reflogs, historical paths/blobs/commit metadata and project
  working-tree files, including ignored local evidence but excluding Git internals
  and installed dependencies. Compared actual local credential values without
  printing them and reviewed credential, OAuth/Bearer, token-like and key patterns.
- Pre-report scan: eight commits, 81 historical blobs, 87 working-tree files.
  No credential or real Client ID appeared in history or current tracked content;
  no private paths occurred in any historical tree. Reviewed placeholder and Git
  hash matches. Expected local credential matches were confined to ignored `.env`
  and `.local/twitch-tokens.json` (both 0600; local directory 0700).
- Reconfirmed `.gitignore` covers environment variants, `.local/` and artifacts/;
  index contains no private files. Local screenshots, including historical
  authorization UI evidence, remain ignored. Recorded scope in docs/security-check.md.
- Attempted local OCR of ignored screenshots; the host Vision service could not
  process them. Pixel content is not credential-cleared. Kept all screenshots out
  of Git and documented human review before reusing any historical capture.
- Compared protected source/config with the initial snapshot: game rules, values,
  engine, simulator, server and Twitch integration/transport are unchanged.
  The requested announcement copy is the only Twitch source diff.
- Verification: all 51 tests and strict TypeScript pass on Node 22; Git diff checks
  and repository integrity check pass. Repeat the safety scan after this commit
  to cover the final revision. No remote, push or deployment.
- Stopped the isolated review server and reset/closed temporary browser views.
  Human work remains: record/review/upload the video, get the actual session ID
  using /status, fill the draft links and complete/submit Devpost before the deadline.

### Follow-up — GitHub repository publication

- The user supplied https://github.com/clccmatteo/chat-clash.git after the request
  for a repository URL to add the remote and push. Verified the remote is empty
  and added it as origin without changing the prepared history.
- Filled the repository URL in docs/submission.md. The video URL and actual Codex
  session ID remain human-supplied fields.
- Verification: all 51 tests and strict TypeScript pass on Node 22.23.4; Git diff
  checks pass. Re-run the full credential/history scan after committing this
  documentation update, then publish main with git push --set-upstream origin main
  and verify the remote head matches the local head.
- This publishes source only. The app remains local-only; no deployment, runtime
  configuration changes, game changes or Twitch calls are part of this follow-up.

## 2026-10-26 — Showcase recording page

### Step 1 — Private simulator display feed

- Captured the original seed-42 CLI outcome before editing: Team A 2982–2971,
  3,350 events, robot penalty and fixed MVPs. Added a golden regression and varied
  cosmetic-seed comparison; scoring RNG draw order and all game rules stay intact.
- Added friendly original synthetic messages using an independent seeded RNG,
  Unicode combo glyphs and typed display rows for cheers, redemptions, raids,
  masked correct flash replies and votes. Each simulator owns its display writer.
- Server snapshots expose at most 40 simulator rows per team, gated by simulator
  mode. Idle/live feeds are empty; mocked real chat, including during simulation,
  cannot enter the feed. Completed demos retain their final synthetic rows.
- Verification: 53 tests pass; strict TypeScript and diff whitespace checks pass.
  CLI output retains the exact baseline. No game/config/Twitch source edits, no
  external runtime dependency, and no submission/video-script changes.

### Step 2 — Showcase page and recording controls

- Added /showcase/ with coral/mint generic dark chat columns, original CSS badges
  and spark art, Unicode combo waves, an always-visible simulated-viewer label,
  native fullscreen and 1x/4x/12x demo launch controls. All feed values use
  textContent; no external assets, fonts, frontend build or new runtime dependency.
- Embedded the existing overlay renderer with a scoped center-column layout;
  regular OBS styling and all game/phase/scoring logic are unchanged. Controls
  hide during play and preserve the final verdict, with a separate replay button.
- Display queues are bounded and drain at six rows per second per side, favoring
  special events. Live mode clears the columns to a private-chat placeholder.
  Demo launch uses only the safe catalog and server-provided demo approvals;
  saved live approvals remain false.
- Verification: all 54 tests, strict TypeScript, frontend syntax and diff checks
  pass. Added queue prioritization/dedup/reset checks, showcase HTTP/redirect
  coverage, and simulator-to-live feed isolation with mocked Twitch I/O.

### Step 3 — Recording review, readability and quick start

- Visual review caught combo traffic starving ordinary chat. Reserved queue space
  and every third display slot for readable messages; added a sustained-wave
  regression. Kept rare events prioritized and froze display scheduling at the
  final verdict. Fixed the showcase iframe canvas fallback and timer spacing.
- Updated README's credential-free quick start: npm ci → npm start → /showcase/
  → Start demo 4x, plus fullscreen, replay, speeds and privacy behavior.
- Ran a complete 4x browser round with the effective viewport measured at
  1920×1080 in every capture. Battle/special events at 2s, raid at 12s, masked
  flash at 24s, RUSH ×2 at 38.5s, verdict/vote countdown at 46.5s and completed
  result at 53.4s were visible. Launch controls stayed hidden throughout.
- Checked 1440×900: the 1440×810 canvas is centered with 45px letterboxing and
  no overflow. No browser errors or warnings. Native fullscreen was requested,
  but this embedded browser did not confirm the transition; verify Full screen
  in the actual recording browser at 100% zoom before recording.
- Verified live-mode placeholders and an updating center score in an isolated,
  mocked-Twitch preview: zero feed rows and no private message text in the DOM.
  Closed that preview and removed its temporary mock-token directory.
- Evidence stays ignored under artifacts/: showcase-1920-{battle,raid,flash,rush,
  vote,complete}.jpg; showcase-1440x900.jpg; showcase-live-private.jpg; and
  showcase-browser-check.json. Captures use native browser pixel density.
- Verification: all 55 tests, strict TypeScript, frontend syntax and whitespace
  checks pass, with additional Node 22 verification. The golden seed-42 CLI
  outcome remains exactly unchanged. Protected game/config/Twitch sources and
  docs/submission.md / docs/video-script.md are untouched. No runtime dependency
  was added. Publish only the three feature steps after the final checks pass.
