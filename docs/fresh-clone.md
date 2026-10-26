# Fresh-clone verification

From a new checkout, use Node.js 22 and npm. No `.env`, `.local/`, Twitch account,
Client ID or credentials are needed for the simulator.

```sh
npm ci
npm test
npm run typecheck
npm run sim
npm start
```

Open [the controls](http://127.0.0.1:3000/control/), select **12×** under simulator
speed, and click **Start simulator**. Open [the overlay](http://127.0.0.1:3000/overlay/)
or add it to OBS as a 1920 × 1080 Browser Source. The round takes about 17.5 seconds
including voting. Expect battle, flash, battle again, RUSH ×2, verdict/vote, then a
selected voluntary penalty. Scores freeze during the vote. Simulator approvals
are demo approvals; no Twitch messages are sent.

Verified October 26, 2026 in a temporary local clone with neither `.env` nor
`.local/` present initially, with all `TWITCH_*` environment variables removed:

- Node 22.23.4; `npm ci` succeeded with zero reported vulnerabilities.
- All 50 tests passed; strict TypeScript and the seeded terminal simulation passed.
- `npm start` served `/control/` and `/overlay/` with HTTP 200.
- A real-clock 12× simulator round visited every phase, processed over 3,000 events
  and displayed a penalty result after approximately 17.5 seconds.
- Startup created the ignored local storage directory. No authorization was used.

No application fix was required. The full check used an isolated loopback port;
3000 is the default shown above. Stop the server with Ctrl+C when finished.
