# Final submission safety pass

Checked locally on October 26, 2026. No remote was added, no push was performed,
and nothing was deployed.

## Scope and result

- Enumerated every revision reachable from all refs and reflogs, every historical
  path, and all historical blobs and commit metadata. `git fsck --full --no-reflogs`
  reported no repository integrity issues or dangling objects requiring review.
- Compared historical content and the project working tree against the actual
  local Client ID/token values, read only for comparison and never printed.
  Also scanned OAuth/Bearer literals, credential assignments, long token-like
  strings and private-key/common secret formats. Git metadata hashes and the
  documented Client ID placeholder were reviewed as expected pattern matches.
- No token, client secret, private device code or real Client ID was found in
  committed content or current tracked files. No `.env`, `.local/` or `artifacts/`
  path exists in any historical tree. `.env.example` is intentionally tracked
  and contains names, blank placeholders and the documented local token path.
- The byte scan of the working tree included ignored project files, excluding
  `.git` internals and installed `node_modules` dependencies. Actual credential
  values matched only the expected ignored `.env` and `.local/twitch-tokens.json`.
  Both are mode **0600**; the `.local/` directory is **0700**. Private local
  configuration was left intact. Historical authorization UI screenshots and
  other local evidence remain under ignored `artifacts/`, outside every commit.
- Verified ignore rules for `.env`, `.env.*` (except `.env.example`), `.local/`
  and `artifacts/`, including sample nested files. The Git index contains none
  of those private paths. Current tracked text has generic channel placeholders.

The pre-report scan covered eight commits, 81 historical blobs and 87 project
working-tree files. The same history/working-tree check is repeated after the
safety-report commit so that the final revision is covered too. These are local
static checks, not a claim that arbitrary future files cannot contain credentials.
Automated OCR of ignored screenshots was unavailable, so their pixel content is
not credential-cleared. They remain excluded from every commit and must not be
used as submission footage without human review. The tracked logo/favicon assets
were inspected separately and contain only the original project mark.

## Scope preservation

Compared with the initial commit, `data/`, `src/game/`, `src/sim/`, `src/server.ts`
and all Twitch OAuth, token storage, EventSub, normalization, deduplication and
chat-delivery modules are unchanged. Only the requested vote announcement wording
changed in `src/twitch/announcements.ts`; its routing and timing are unchanged.
Other runtime changes are small overlay/control presentation and wording fixes.
The test additions cover the existing deadline and explicit announcement duration.

All 51 tests and `npm run typecheck` pass on Node 22. No real Twitch I/O was used
by automated tests. The isolated browser-review server was stopped and temporary
browser viewport overrides were reset. The user's existing local setup was not
reconfigured.
