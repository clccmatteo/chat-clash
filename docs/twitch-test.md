# Connect and test two real Twitch accounts

This test uses offline Twitch chat rooms. No OBS broadcast, stream key, Bits
purchase, Affiliate status, client secret or redirect server is required.
Keep the two channels out of a Shared Chat session for this first test.

## 1. Configure the public app

Copy `.env.example` to `.env` if you do not already have a local `.env`. It is
ignored by Git. Replace the placeholders with the **public Client ID** of your
Twitch app registered as **Public** and your two channel logins:

```dotenv
TWITCH_CLIENT_ID=your_actual_public_client_id
TWITCH_TEAM_A_LOGIN=your_channel_a
TWITCH_TEAM_B_LOGIN=your_channel_b
TWITCH_BOT_LOGIN=
TWITCH_TOKEN_FILE=.local/twitch-tokens.json
```

Blank `TWITCH_BOT_LOGIN` follows Team A. To use a separate bot account, put its
login there; that third account will need its own device authorization.
Never add a client secret. Do not replace an existing `.env` with the example file.
Finish creating the second account before its authorization step.

From the project directory, using Node 22:

```sh
npm ci
npm start
```

If the server is already running, stop that run first, then start it again and
refresh the control page. Environment changes are read at startup.

## 2. Prepare two browser sessions

Open [the control panel](http://127.0.0.1:3000/control/).
Check Team A's channel is `your_channel_a`, Team B's is `your_channel_b`, and the bot field
is blank. Change any login in the control panel and click **Save settings**.
Control-panel changes apply to this server session; `.env` supplies startup defaults.

Use one browser profile logged in as `your_channel_a` and another profile/private window
logged in as `your_channel_b`. Open both accounts' offline chat rooms, for example
the normal channel pages and their **Chat** tabs, or Twitch's popout chat:

- [Team A chat](https://www.twitch.tv/popout/your_channel_a/chat?popout=)
- [Team B chat](https://www.twitch.tv/popout/your_channel_b/chat?popout=)

Use normal open chat for this test: follower/subscriber-only, slow, emote-only,
unique-chat, bans and timeouts can prevent test messages or bot posts from landing.
The bot does **not** need to be made a moderator. Chat restrictions still apply.

## 3. Authorize Team A and the default bot

Click **Authorize Team A**. The control panel displays a user code and an
**Open twitch.tv/activate** link. Open that link in the `your_channel_a` browser session,
enter the displayed code if asked, review the permissions and approve it yourself.

This single grant includes the broadcaster's `channel:bot`,
`channel:read:redemptions`, and `bits:read`, plus the default bot's
`user:bot`, `user:read:chat` and `user:write:chat`.
The server checks the actual token identity against the saved login. Using the
wrong account shows an error instead of silently connecting it.

No access token, refresh token or private device code is displayed. The user code
shown in the controls is the code Twitch expects you to type at activation.

## 4. Authorize Team B

Click **Authorize Team B**, then activate **its** displayed code in the
`your_channel_b` browser session. It needs only the broadcaster scopes above.
With the default bot, there are **two distinct account authorizations total**.
If the bot is a third account, use its additional **Authorize bot** button once.

Wait for both cards to show **CHAT CONNECTED** and the heading to show
**BOTH CHATS READY**. Try a regular message in each room. The corresponding card's
received-event count should rise even before a round starts; scores stay at zero.

For a non-Affiliate/non-Partner account, Bits and channel points explicitly show
as unavailable. This does not prevent the chat connection or a round.

## 5. Configure a test round

Choose **Type race · ideal for two-account test** under **Next flash challenge**.
Choose a few safe penalties and check both approval boxes. Save settings if you
changed any channel or bot login, then click **Start round**.

Use **Start round** for real chat. **Start simulator** deliberately ignores Twitch
events and never sends announcements, even when accounts remain connected.
Live rounds always run at normal speed; the speed selector affects simulations only.

## 6. Check ordinary scoring and the cooldown

Using the second account, send a normal message in Team A's room. A user's first
participation there should add **4 points**: +3 first participation and +1 message.
Send another message immediately: **0 more points**. Wait at least five seconds
and send a third: **+1**.

Do the same in Team B's room using the other account. Counters are independent
between teams. Bot system announcements begin with `[Chat Clash]` and contribute
no points. Raw chat text must not appear in the overlay or activity log; usernames
and system activity labels may appear.

You can watch the embedded preview or open
[the transparent overlay](http://127.0.0.1:3000/overlay/) directly. Going live is
unnecessary.

## 7. Win the flash challenge

The round timer counts **down**: flash runs from **1:30 to 1:00 remaining**,
and rush starts at **0:30 remaining**. Keep the controls and Twitch chats visible
side by side; copy only the requested phrase, without the prompt prefix or quotes.

At **1:30**, the exact same type-race prompt should appear on the overlay and in
**both** chat rooms. Type the requested phrase first in Team A's room, before
answering it in Team B's room. At **2:00**, Team A should receive the **+25 bonus**
and the challenge result should be announced. Ordinary eligible message points
still apply. Type-race judging ignores case, accents and whitespace; punctuation
must match.

If you repeat the test with trivia, math or anagrams, the most distinct correct
users wins; a tie goes to the first correct answer. With only two accounts, use the
same number of correct users in each chat to exercise the arrival-order tiebreak.

## 8. Check the final rush

At **2:30**, the overlay and both chats announce the rush. A message from an already
participating user who is outside their five-second cooldown adds **2 points**.
A first-time participant in that team adds **8 points**. Keep an obvious lead for
one team so the penalty vote has a winner.

## 9. Check the vote

At **3:00**, scores freeze. Both rooms receive the verdict. The winning room gets
the approved options and the `!vote NUMBER` instructions, split into messages of
at most 500 characters when necessary.

In the winning room, send `!vote 2`. Send `!vote 1` again as the same account: the
first valid vote should remain. A vote sent in the losing room should not count.
The vote has its own **30-second** countdown. Messages arriving after it closes
do not count. At **3:30** elapsed, the winning penalty appears and is announced. Penalties are always
voluntary and are never executed by the program. A tied match or no votes selects
no penalty.

## 10. Check restoration and optional features

Stop and restart the server, then reload the controls. Both accounts should restore
from `.local/twitch-tokens.json` and reconnect without another activation code.
Tokens are validated at startup and hourly, refreshed automatically, and rotated
refresh tokens are saved with owner-only permissions. Expired/revoked refresh
grants require a new device authorization; an inactive public refresh token expires
after 30 days.

If a channel is Affiliate/Partner and already has an enabled **Reinforcement**
custom reward, it is auto-mapped by exact title when unique. Otherwise choose an
enabled reward in that channel's **Reinforcement reward** selector while idle.
The adapter checks the reward **ID**, not the title or user input. Changing the
reward title does not reroute points. The app does not create or modify rewards.
An explicit **No reward mapped** choice survives restart.

Two accounts cannot exercise a five-distinct-user combo or ten-distinct-user emote
target. Non-Affiliates cannot exercise paid features. Cover those without spending
money or going live using:

```sh
npm test
npm run typecheck
npm run sim
```

The automated tests inject native-shaped redemption, cheer, raid and emote payloads
and duplicate EventSub deliveries, run full rounds on a fake clock, and never contact
Twitch or send real chat. The simulator still includes every scoring event type.

## Connection recovery and limitations

- Planned Twitch socket handoffs preserve subscriptions and the dedup cache.
  Unexpected connection losses reconnect with backoff and create fresh subscriptions.
- A live round stops if a chat connection is lost, because Twitch does not replay
  missed events. It never silently resumes an unfair score. Reconnect and start
  a fresh round. Optional points/Bits failures do not stop otherwise healthy chat.
- **Reconnect sockets** retries connections without deleting stored tokens.
  **Disconnect** removes the selected account's local tokens; if the account is
  both broadcaster and bot, both roles disconnect. Twitch's own connection settings
  can revoke the grant entirely.
- Shared Chat copies from other source channels are excluded from scoring. Twitch
  user-token sends fan out to all rooms in a Shared Chat session; this is why the
  first test uses independent chat rooms. Voting is still limited to the winning
  source room.
- Live emote targets use real global Twitch emote IDs with readable names in the
  prompt. Synthetic simulator targets are never selected as live emotes. If global
  emote metadata cannot load, live random selection temporarily uses text challenges.
- Match state remains in memory. Startup login defaults remain in `.env`; only
  OAuth grants and reward mappings persist in the ignored local token file.

## Official Twitch references

- [Public-client Device Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow)
- [Refresh tokens](https://dev.twitch.tv/docs/authentication/refresh-tokens/)
- [Required token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [EventSub WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [Chat authentication and EventSub](https://dev.twitch.tv/docs/chat/authenticating/)
- [Sending and receiving chat](https://dev.twitch.tv/docs/chat/send-receive-messages/)
- [Send Chat Message API](https://dev.twitch.tv/docs/api/reference/#send-chat-message)
- [Subscription types and scopes](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
