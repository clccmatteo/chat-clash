# Codex build log

## 2026-10-25 — Milestone 1

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
connection, OAuth, chat sending, persistence or public deployment in milestone 1.
Penalty outcomes are display-only and voluntary. Emote targets use synthetic
metadata until the real adapter resolves native emotes. No runtime AI calls.

## 2026-10-25 — Milestone 2

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
  Updated the ignored startup default for Team B to `ilcoluc_test` and aligned the
  offline guide with the user's new account name.
- Confirmed the saved `ilcoluc` grant restores successfully: real EventSub chat and
  incoming-raid subscriptions are connected. Twitch reports the channel as
  non-Affiliate/Partner; optional Bits and points are unavailable as expected.
- Requested Team B's device authorization in the local controls. After the user
  completed Twitch approval, verified both `ilcoluc` and `ilcoluc_test` have real
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
