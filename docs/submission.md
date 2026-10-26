# Chat Clash — Devpost draft

Submission deadline supplied in the brief: **November 2, 2026, 2:00 PM PT**.
This is an English draft; complete the links and session ID before submitting.

- Code repository: **TODO — public GitHub repository URL**
- Demo video: **TODO — public or unlisted YouTube URL, under 3 minutes**
- Codex session ID: **TODO — copy the actual session ID using `/status`**

## Tagline

The most active community wins. Two Twitch chats, one three-minute clash.

## What it does

Chat Clash turns two communities into teams in a short, watchable contest.
Messages, first-time participants and coordinated emote combos move a shared
scoreboard. A bilingual flash challenge rewards quick thinking; the final
30-second RUSH ×2 gives both teams a comeback opportunity. Optional channel
points, Bits and incoming raids can contribute within configured caps.

After three minutes, scores freeze and the winning chat gets 30 seconds to vote
on a safe, voluntary penalty that both streamers approved before the round.
The result is displayed, never performed automatically. The transparent OBS
overlay shows scores, participant counts, MVPs, the challenge, phase banners and
a prominent vote countdown. Streamers use a local control panel with an embedded
preview, approvals, connection status and an activity log.

The aim is a shared moment between communities: participation and coordination
matter, and viewers can join through ordinary chat without buying anything.

## How it works

One Node.js 22 process runs strict TypeScript and holds one match in memory.
The pure game reducer takes normalized events and explicit timestamps, returning
new state. Scoring values, caps and phase durations live in one JSON config.
There are no AI calls at runtime.

A seeded simulator produces the same normalized event types for a repeatable,
credential-free demo. The control panel offers 1×, 4× and 12× simulation speeds;
a complete 12× round including voting takes about 17.5 seconds. Real Twitch
rounds always run at normal speed.

The Twitch adapter uses public-client Device Code OAuth, local token persistence
and refresh, and EventSub WebSockets. It deduplicates envelope and provider event
IDs, filters bot announcements and Shared Chat copies, and normalizes chat,
raids and optional paid events. The server stamps game events in server time.
Non-Affiliate channels retain chat and raid support. A lost chat connection stops
a live round so missing events cannot silently skew the result.

The server owns clocks, I/O and safe public snapshots. Plain HTML, CSS and browser
JavaScript render the controls and 1920×1080 overlay without a frontend build,
external font or CDN.

## Safety, privacy and original content

The app binds to loopback, validates same-origin controls and has no login system;
it must stay local-only. Tokens and device codes are excluded from public state,
logs and source control. Local token files use owner-only permissions under the
ignored `.local/` directory. No client secret or redirect flow is used.

Raw chat, accepted-answer arrays and private participant maps are never broadcast.
Names and approved penalties render through textContent. The penalty catalog is
safe and voluntary, requires both streamers' approval and is frozen during play.
Simulator approvals cannot authorize a real round, and simulator rounds send no
Twitch chat messages.

The generated collision-bubble mark, 160 authored bilingual challenge records
and eight authored penalties are original project content. Runtime Twitch emote
metadata is separate. Source and project assets are available under the MIT
license; dependency licenses remain their own.

## How Codex was used

Codex helped build and verify the project from an empty workspace. Its work
included the strict TypeScript scaffold, immutable reducer, deterministic
simulator, Twitch adapter, overlay, controls and original challenge library.
The [implementation log](codex-log.md) records concrete iterations:

- A privacy test initially used a prompt containing an accepted answer. Codex
  corrected the fixture so it could actually detect private answer leakage.
- Explicit timestamp tests caught same-millisecond challenge ties; first-arrival
  latches made the result deterministic.
- Browser review found an incorrect preview scale interpolation and an opaque
  canvas fallback that hid overlay transparency; both were fixed.
- Mocked OAuth → EventSub → score → challenge → vote tests exercise the full
  integration without sending real chat or exposing credentials.
- Human testing found late votes. Codex retained the 30-second rule, made the vote
  deadline prominent and added boundary/announcement regressions. Visual review
  then caught and fixed the eight-option vote card overlapping the logo.

Humans selected the rules, approved penalties, completed account authorization
and checked two real chat rooms. Codex is the development collaborator; runtime
play does not depend on an AI service.

## Try it as a judge

Use Node.js 22 in a fresh checkout:

```sh
npm ci
npm test
npm run typecheck
npm run sim
npm start
```

Open **http://127.0.0.1:3000/control/**, select **12×**, and click **Start simulator**.
Open **http://127.0.0.1:3000/overlay/** or add it to OBS as a 1920×1080 Browser
Source. No credentials, `.env`, Twitch account or broadcast is required for this
path. The [README](../README.md) and [fresh-clone check](fresh-clone.md) explain it.
For two real chats, follow [the Twitch guide](twitch-test.md).

At submission preparation, all **51 automated tests** and strict TypeScript pass.
A fresh clone passed install, tests, typecheck, terminal simulation and a complete
12× browser round on Node 22.23.4. Automated Twitch I/O is mocked.

## Limitations and validation

This is a local prototype with no authentication, one match per process and no
match persistence. It is not deployed. Both real accounts connected, restored
authorization after restart, and participated in manual checks of chat scoring,
cooldowns, rush, a type-race result and a successful penalty vote. Another round's
votes arrived late; the deadline UI has since been clarified.

Combos, emote targets, Bits, channel points and raids are verified only by mocked
tests and the simulator, not by a live multi-user test. OBS recording/compositing
and the final video still need human capture and review. This draft does not
claim that an uploaded video or completed Devpost submission already exists.
