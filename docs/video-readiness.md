# Video readiness check

Checked October 26, 2026 using the local app in an isolated copy with no `.env`
or Twitch authorization. A full 12× simulator round was replayed for each view.
The overlay DOM viewport was 1920×1080; the laptop controls were 1280×720.
Screenshots stay under ignored `artifacts/submission/` and are not submission assets.

| View | Evidence checked | Result |
| --- | --- | --- |
| Overlay | Flash prompt, including the longer emote-target prompt | Readable, contained in its card, distinct mint phase banner |
| Overlay | RUSH ×2 and countdown | Distinct coral banner, explicit doubled-points wording |
| Overlay | Verdict, vote clock, all eight approved options | Large countdown, options clear the logo and MVP panels |
| Overlay | Penalty result | Separate voluntary-result label, larger mint result text; vote clock hidden |
| Controls | Battle, flash, rush, voting and completion | Explicit status, timer, buttons and result readable at laptop size with normal vertical scrolling |
| Both | Browser warnings/errors | None reported during the reviewed rounds |

Small presentation fixes applied:

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `public/overlay/style.css:434` | Eight options plus the vote timer overlapped the central logo | Smaller padding and gaps for the many-option card | Borders and spacing keep separate surfaces legible |
| LOW | `public/overlay/style.css:459`, `public/overlay/app.js` | Final penalty shared the small instruction style | 28px mint result and an explicit voluntary-result label | Static text/color distinguish completion from voting |
| LOW | `public/control/style.css:483`, `public/control/app.js` | Small round hint and implicit phase wording | 12px hint, explicit FLASH and RUSH ×2 labels | Status remains recognizable without relying on animation |

Approve for the reviewed recording views. No redesign, external font, CDN,
scoring or timing change. Existing reduced-motion CSS remains in place.

Not verified here: an actual OBS recording/composite, video compression, live
multi-user Twitch activity, every hover/focus state, or motion replay at 10% speed.
Before recording, check the overlay against your own stream background in OBS and
keep the long flash prompt and vote timer readable at the final video resolution.
