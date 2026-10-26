# Chat Clash

Hackathon deadline: November 2, 2026. A three-minute battle between two Twitch
communities where participation drives the score. No AI calls at runtime.

## Project boundaries
- Node.js 22 + strict TypeScript, one server process, in-memory match state.
- `src/game/` is pure: no filesystem, network, timers, randomness or wall clock.
  Pass timestamps and random seeds in; return new state without mutating input.
- Keep every scoring value, cap, threshold and phase duration in `data/config.json`.
- `src/sim/` produces normalized events; `src/twitch/` owns Twitch Device Code OAuth,
  token persistence/refresh, EventSub WebSockets, deduplication and chat delivery.
- The server owns clocks, I/O and safe public snapshots. Never broadcast raw chat
  text, accepted challenge answers, private participant maps or environment values.
- Use DOM textContent for user-provided names and approved penalty text.
- Penalties must be safe, voluntary and approved by both streamers before a round.
  Freeze the list during a round; do not execute penalties automatically.
- Keep dependencies small. No frontend build step or external fonts/CDNs.
- All controls are local-only. Do not deploy without auth.
- Use only official Twitch documentation. This is a PUBLIC OAuth client: Device
  Code Grant, no client secret, no redirects or app-access/client-credentials flow.
- Tokens and device codes never enter logs, overlays, browser state broadcasts or
  source control. Local token files stay under ignored `.local/`, mode 0600.
- Deduplicate EventSub envelope and provider event IDs across reconnects. Stamp
  game events in server time, and filter Shared Chat copies and bot announcements.
- Affiliate-only channel points/Bits are optional; chat/raids must still work.
- Mock all Twitch I/O in automated tests. Do not send real chat from tests.
- Never commit secrets; `.env.example` contains names and placeholders only.

## Development
`npm install`, then `npm run dev`. Control: http://127.0.0.1:3000/control/;
OBS: http://127.0.0.1:3000/overlay/ at 1920 × 1080.

Run `npm test` after each meaningful implementation step and `npm run typecheck`
before finishing. Tests use Node's test runner and explicit fake-clock timestamps.
`npm run sim` runs a seeded, accelerated round in the terminal without a server.
Record meaningful implementation work, verification and limitations in
`docs/codex-log.md`. Prefer small, reviewable changes.
