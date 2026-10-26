import { resolve, relative, isAbsolute } from "node:path";
import type { Challenge, Team } from "../game/types.js";
import { DeviceAuth, type AuthRole } from "./device-auth.js";
import { TokenStore, type TokenRecord } from "./token-store.js";
import { TwitchApi } from "./api.js";
import {
  BOT_SCOPES,
  BROADCASTER_SCOPES,
  endpoints,
  object,
  loginValid,
  idValid,
  TwitchError,
  scheduler,
  type Fetcher,
  type Scheduler,
} from "./runtime.js";
import {
  EventSubSource,
  type EventSocket,
  type SourceState,
} from "./eventsub.js";
import { Deduplicator } from "./dedup.js";
import { CHAT, CHEER, RAID, REDEMPTION, SYSTEM_PREFIX } from "./normalize.js";
import { ChatOutbox } from "./outbox.js";
import {
  subscriptionKey,
  type SubscriptionSpec,
  type TwitchConnection,
  type TwitchEvent,
  type TwitchChat,
} from "./types.js";

export type TwitchOptions = {
  clientId: string;
  tokenFile: string;
  teamLogins: Record<Team, string>;
  botLogin?: string;
  http?: Fetcher;
  clock?: Scheduler;
  socketFactory?: (url: string) => EventSocket;
};
type Reward = { id: string; title: string; cost: number; enabled: boolean };
type Group = { api: TwitchApi; source: EventSubSource; state: SourceState };
type Callbacks = {
  onEvent: (event: TwitchEvent) => void;
  onChange: () => void;
  onIssue: (message: string) => void;
  canChange: () => boolean;
};
export class TwitchManager implements TwitchChat {
  private store: TokenStore;
  private auth: DeviceAuth;
  private accounts = new Map<string, TwitchApi>();
  private errors = new Map<string, string>();
  private rewards = new Map<string, Reward[]>();
  private rewardIds = new Map<string, string>();
  private groups: Group[] = [];
  private connections: TwitchConnection[] = [];
  private dedup = new Deduplicator();
  private emotes: { id: string; name: string }[] = [];
  private outbox: ChatOutbox;
  private closed = false;
  private initializing = true;
  private globalError = "";
  private cancelMaintenance?: () => void;
  private received: Record<Team, number> = { A: 0, B: 0 };
  private lastEvent: Record<Team, number | null> = { A: null, B: null };
  private http: Fetcher;
  private clock: Scheduler;
  constructor(
    private options: TwitchOptions,
    private callbacks: Callbacks,
  ) {
    this.http = options.http ?? fetch;
    this.clock = options.clock ?? scheduler;
    const filename = resolve(options.tokenFile),
      privateRoot = resolve(".local"),
      rel = relative(privateRoot, filename);
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
      throw new TwitchError(
        "TWITCH_TOKEN_FILE must be inside the gitignored .local/ directory",
      );
    this.store = new TokenStore(filename);
    this.auth = new DeviceAuth(
      options.clientId,
      (role, login, tokens, current) =>
        this.authorized(role, login, tokens, current),
      () => this.changed(),
      this.http,
      this.clock,
    );
    this.outbox = new ChatOutbox(
      (team, text, current) => this.deliver(team, text, current),
      this.clock,
    );
  }
  private changed() {
    if (!this.closed) this.callbacks.onChange();
  }
  private guard() {
    if (!this.callbacks.canChange())
      throw new TwitchError(
        "Stop or finish the round before changing Twitch connections",
      );
  }
  private botLogin() {
    return this.options.botLogin || this.options.teamLogins.A;
  }
  private scopesFor(login: string) {
    return [
      ...new Set([
        ...(Object.values(this.options.teamLogins).includes(login)
          ? BROADCASTER_SCOPES
          : []),
        ...(this.botLogin() === login ? BOT_SCOPES : []),
      ]),
    ];
  }
  private roleLogin(role: AuthRole) {
    return role === "bot" ? this.botLogin() : this.options.teamLogins[role];
  }
  private configured() {
    return /^[a-zA-Z0-9]{10,128}$/.test(this.options.clientId);
  }
  private enabled(team: Team, type: string) {
    return this.groups.some(
      (g) =>
        g.state.status === "connected" &&
        g.state.subscriptions[subscriptionKey({ team, type })] === "enabled",
    );
  }
  status() {
    const bot = this.accounts.get(this.botLogin());
    const teams = Object.fromEntries(
      (["A", "B"] as const).map((team) => {
        const login = this.options.teamLogins[team],
          api = this.accounts.get(login),
          partner =
            !!api?.identity &&
            ["affiliate", "partner"].includes(api.identity.broadcasterType);
        const rewardId = api?.identity
          ? (this.rewardIds.get(api.identity.id) ?? "")
          : "";
        return [
          team,
          {
            login,
            authorized: !!api,
            displayName: api?.identity?.displayName ?? login,
            chatReady: this.enabled(team, CHAT),
            raidsReady: this.enabled(team, RAID),
            channelPoints: !api
              ? "authorize"
              : !partner
                ? "unsupported"
                : !this.enabled(team, REDEMPTION)
                  ? "unavailable"
                  : rewardId
                    ? "enabled"
                    : "unmapped",
            bits: !api
              ? "authorize"
              : !partner
                ? "unsupported"
                : this.enabled(team, CHEER)
                  ? "enabled"
                  : "unavailable",
            rewardId,
            rewards: this.rewards.get(login) ?? [],
            error: this.errors.get(login) ?? "",
            eventsReceived: this.received[team],
            lastEventAt: this.lastEvent[team],
          },
        ];
      }),
    ) as Record<
      Team,
      {
        login: string;
        authorized: boolean;
        displayName: string;
        chatReady: boolean;
        raidsReady: boolean;
        channelPoints: string;
        bits: string;
        rewardId: string;
        rewards: Reward[];
        error: string;
        eventsReceived: number;
        lastEventAt: number | null;
      }
    >;
    return {
      configured: this.configured(),
      initializing: this.initializing,
      error: this.globalError,
      ready:
        teams.A.chatReady &&
        teams.B.chatReady &&
        !!bot &&
        bot.hasScopes(BOT_SCOPES) &&
        !this.auth.hasPending(),
      pendingRoles: this.auth
        .status()
        .filter((p) => p.status !== "error")
        .map((p) => p.role),
      teams,
      bot: {
        login: this.botLogin(),
        followsTeamA: !this.options.botLogin,
        authorized: !!bot && bot.hasScopes(BOT_SCOPES),
        error: this.errors.get(this.botLogin()) ?? "",
      },
      emoteTargetsReady: this.emotes.length > 0,
    };
  }
  /** Codes are only returned to direct control-panel requests, never WebSockets. */
  deviceStatus() {
    return this.auth.status();
  }
  async initialize() {
    try {
      if (this.configured()) {
        await this.store.load();
        await this.restore();
        this.rebuild();
        this.maintainLater();
      }
    } catch (error) {
      this.globalError =
        error instanceof TwitchError
          ? error.message
          : "Cannot initialize Twitch connections";
    } finally {
      this.initializing = false;
      this.changed();
    }
  }
  private async restore() {
    for (const login of new Set([
      ...Object.values(this.options.teamLogins),
      this.botLogin(),
    ])) {
      if (this.accounts.has(login)) continue;
      const record = this.store.get(this.options.clientId, login);
      if (!record) continue;
      const api = new TwitchApi(
        record,
        (r) => this.store.put(r),
        this.http,
        this.clock,
      );
      try {
        await api.loadIdentity();
        if (!api.hasScopes(this.scopesFor(login)))
          throw new TwitchError(
            "Authorize this account again to grant the required Twitch scopes.",
            401,
          );
        this.accounts.set(login, api);
        this.errors.delete(login);
        await this.loadExtras(api);
      } catch (error) {
        api.dispose();
        this.errors.set(
          login,
          error instanceof TwitchError
            ? error.message
            : "Reconnect Twitch to retry",
        );
      }
    }
  }
  async configure(teamLogins: Record<Team, string>, botLogin: string) {
    this.guard();
    if (
      !loginValid(teamLogins.A) ||
      !loginValid(teamLogins.B) ||
      teamLogins.A === teamLogins.B ||
      (botLogin && !loginValid(botLogin))
    )
      throw new TwitchError(
        "Choose two different valid Twitch channel logins and a valid bot login",
      );
    if (
      teamLogins.A === this.options.teamLogins.A &&
      teamLogins.B === this.options.teamLogins.B &&
      botLogin === (this.options.botLogin ?? "")
    )
      return;
    this.auth.close();
    this.options.teamLogins = { ...teamLogins };
    this.options.botLogin = botLogin;
    // Never silently reuse a grant that lacks the new role's permissions.
    for (const [login, api] of this.accounts)
      if (
        !this.scopesFor(login).length ||
        !api.hasScopes(this.scopesFor(login))
      ) {
        api.dispose();
        this.accounts.delete(login);
      }
    if (this.configured()) {
      await this.restore();
      this.rebuild();
    }
    this.changed();
  }
  async authorize(role: AuthRole) {
    this.guard();
    if (!this.configured())
      throw new TwitchError(
        "Set TWITCH_CLIENT_ID in .env and restart the server first",
      );
    if (this.initializing || this.globalError)
      throw new TwitchError(this.globalError || "Twitch is still initializing");
    const login = this.roleLogin(role);
    if (!loginValid(login))
      throw new TwitchError("Save a valid Twitch channel login first");
    if (
      this.auth.status().some((p) => p.login === login && p.status !== "error")
    )
      return;
    await this.auth.begin(role, login, this.scopesFor(login));
  }
  cancelAuthorization(role: AuthRole) {
    this.guard();
    this.auth.cancel(role);
  }
  private async authorized(
    role: AuthRole,
    expected: string,
    tokens: Omit<TokenRecord, "userId" | "login">,
    current: () => boolean,
  ) {
    this.guard();
    if (this.closed || !current() || this.roleLogin(role) !== expected)
      throw new TwitchError(
        "Twitch connection settings changed. Request a new device code.",
      );
    const response = await this.http(endpoints.validate, {
      headers: { Authorization: `OAuth ${tokens.accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    const identity = object(await response.json());
    if (
      !response.ok ||
      identity?.client_id !== this.options.clientId ||
      !idValid(identity?.user_id) ||
      identity.login !== expected
    )
      throw new TwitchError(
        `Authorize as @${expected}. The account used for this device code did not match.`,
        401,
      );
    if (
      !Array.isArray(identity.scopes) ||
      !this.scopesFor(expected).every((scope) =>
        identity.scopes.includes(scope),
      )
    )
      throw new TwitchError(
        "Twitch did not grant all required scopes. Authorize this account again.",
        401,
      );
    let committed = false;
    const api = new TwitchApi(
      { ...tokens, userId: identity.user_id, login: identity.login },
      (r) => {
        if (!committed && (!current() || this.closed))
          throw new TwitchError("Authorization cancelled");
        return this.store.put(r);
      },
      this.http,
      this.clock,
    );
    try {
      await api.loadIdentity();
      this.guard();
      if (this.closed || !current() || this.roleLogin(role) !== expected)
        throw new TwitchError("Twitch settings changed during authorization");
      this.errors.delete(expected);
      await this.loadExtras(api);
      if (!current() || this.closed)
        throw new TwitchError("Authorization cancelled");
      this.accounts.get(expected)?.dispose();
      this.accounts.set(expected, api);
      committed = true;
      this.rebuild();
      this.changed();
    } catch (error) {
      if (this.accounts.get(expected) !== api) api.dispose();
      throw error;
    }
  }
  private async loadExtras(api: TwitchApi) {
    const identity = api.identity!;
    if (
      ["affiliate", "partner"].includes(identity.broadcasterType) &&
      api.hasScopes(["channel:read:redemptions"]) &&
      Object.values(this.options.teamLogins).includes(identity.login)
    ) {
      try {
        const result = await api.helix(
          `channel_points/custom_rewards?broadcaster_id=${identity.id}`,
        );
        const rewards: Reward[] = (result.data ?? [])
          .filter(
            (r: any) => typeof r.id === "string" && typeof r.title === "string",
          )
          .map((r: any) => ({
            id: r.id,
            title: r.title,
            cost: r.cost,
            enabled: !!r.is_enabled && !r.is_paused,
          }));
        this.rewards.set(identity.login, rewards);
        let rewardId = this.store.getReward(identity.id);
        if (
          rewardId === undefined ||
          (rewardId && !rewards.some((r) => r.id === rewardId && r.enabled))
        ) {
          const matches = rewards.filter(
            (r) =>
              r.enabled && r.title.trim().toLowerCase() === "reinforcement",
          );
          rewardId = matches.length === 1 ? matches[0].id : "";
        }
        this.rewardIds.set(identity.id, rewardId);
        await this.store.setReward(identity.id, rewardId);
      } catch {
        this.errors.set(
          identity.login,
          "Channel points rewards are unavailable. Chat and raids can continue.",
        );
      }
    }
    if (identity.login === this.botLogin() && !this.emotes.length) {
      try {
        const result = await api.helix("chat/emotes/global");
        this.emotes = (result.data ?? [])
          .filter(
            (e: any) =>
              typeof e.id === "string" &&
              typeof e.name === "string" &&
              e.name.length < 40,
          )
          .map((e: any) => ({ id: e.id, name: e.name }));
      } catch {
        /* Live text challenges still work; do not pick unusable emote targets. */
      }
    }
  }
  private rebuild() {
    if (this.closed) return;
    for (const group of this.groups) group.source.disconnect();
    this.groups = [];
    this.connections = (["A", "B"] as const).flatMap((team) => {
      const api = this.accounts.get(this.options.teamLogins[team]);
      return api?.identity
        ? [
            {
              team,
              broadcasterId: api.identity.id,
              reinforcementRewardId: this.rewardIds.get(api.identity.id) ?? "",
            },
          ]
        : [];
    });
    const specs = new Map<TwitchApi, SubscriptionSpec[]>(),
      add = (api: TwitchApi, spec: SubscriptionSpec) => {
        const group = specs.get(api) ?? [];
        group.push(spec);
        specs.set(api, group);
      };
    const bot = this.accounts.get(this.botLogin());
    for (const c of this.connections) {
      const broadcaster = this.accounts.get(this.options.teamLogins[c.team])!;
      if (bot?.identity && bot.hasScopes(BOT_SCOPES)) {
        add(bot, {
          team: c.team,
          type: CHAT,
          condition: {
            broadcaster_user_id: c.broadcasterId,
            user_id: bot.identity.id,
          },
        });
        add(bot, {
          team: c.team,
          type: RAID,
          condition: { to_broadcaster_user_id: c.broadcasterId },
        });
      }
      if (
        ["affiliate", "partner"].includes(broadcaster.identity!.broadcasterType)
      ) {
        add(broadcaster, {
          team: c.team,
          type: CHEER,
          condition: { broadcaster_user_id: c.broadcasterId },
        });
        add(broadcaster, {
          team: c.team,
          type: REDEMPTION,
          condition: { broadcaster_user_id: c.broadcasterId },
        });
      }
    }
    for (const [api, subscriptions] of specs) {
      const group = {} as Group;
      group.api = api;
      group.state = { status: "connecting", subscriptions: {} };
      group.source = new EventSubSource({
        specs: subscriptions,
        connections: this.connections,
        botId: bot?.identity?.id,
        dedup: this.dedup,
        clock: this.clock,
        socketFactory: this.options.socketFactory,
        subscribe: async (sessionId, spec) => {
          try {
            await api.helix("eventsub/subscriptions", {
              method: "POST",
              body: JSON.stringify({
                type: spec.type,
                version: "1",
                condition: spec.condition,
                transport: { method: "websocket", session_id: sessionId },
              }),
            });
          } catch (error) {
            if (error instanceof TwitchError && error.status === 401)
              void this.invalidate(api);
            throw error;
          }
        },
        onState: (state) => {
          group.state = state;
          this.changed();
        },
        onEvent: (event) => {
          if (this.groups.includes(group)) {
            this.received[event.team]++;
            this.lastEvent[event.team] = this.clock.now();
            this.callbacks.onEvent(event);
          }
        },
        onIssue: (message) => this.callbacks.onIssue(message),
        onRevoked: () => {
          void this.invalidate(api);
        },
      });
      this.groups.push(group);
      group.source.connect();
    }
    this.changed();
  }
  private async invalidate(api: TwitchApi) {
    const login = api.identity?.login;
    if (!login || this.accounts.get(login) !== api) return;
    api.dispose();
    this.accounts.delete(login);
    this.errors.set(
      login,
      "Twitch authorization was revoked or expired. Authorize again.",
    );
    for (const group of this.groups.filter((g) => g.api === api))
      group.source.disconnect();
    this.changed();
    await this.store.remove(this.options.clientId, login).catch(() => {
      this.globalError = "Could not remove the revoked local Twitch token";
    });
  }
  private maintainLater() {
    this.cancelMaintenance?.();
    this.cancelMaintenance = this.clock.after(30000, () => {
      void (async () => {
        for (const api of this.accounts.values()) {
          try {
            await api.maintain();
          } catch (error) {
            if (error instanceof TwitchError && error.status === 401)
              await this.invalidate(api);
            else
              this.callbacks.onIssue(
                "Twitch token validation could not complete. Retrying shortly.",
              );
          }
        }
        if (!this.closed) this.maintainLater();
      })();
    });
  }
  async reconnect() {
    this.guard();
    if (this.auth.hasPending())
      throw new TwitchError("Finish or cancel device authorization first");
    if (!this.configured())
      throw new TwitchError("Set TWITCH_CLIENT_ID in .env and restart first");
    await this.restore();
    this.rebuild();
  }
  async disconnect(role: AuthRole) {
    this.guard();
    this.auth.cancel(role);
    const login = this.roleLogin(role),
      api = this.accounts.get(login);
    api?.dispose();
    this.accounts.delete(login);
    this.errors.delete(login);
    await this.store.remove(this.options.clientId, login);
    this.rebuild();
  }
  async mapReward(team: Team, rewardId: string) {
    this.guard();
    const api = this.accounts.get(this.options.teamLogins[team]);
    if (
      !api?.identity ||
      !["affiliate", "partner"].includes(api.identity.broadcasterType)
    )
      throw new TwitchError(
        "Channel points require an Affiliate or Partner broadcaster",
      );
    if (
      rewardId &&
      !this.rewards
        .get(api.identity.login)
        ?.some((r) => r.id === rewardId && r.enabled)
    )
      throw new TwitchError(
        "Choose an enabled reward from this broadcaster's reward list",
      );
    await this.store.setReward(api.identity.id, rewardId);
    this.rewardIds.set(api.identity.id, rewardId);
    for (const c of this.connections)
      if (c.broadcasterId === api.identity.id)
        c.reinforcementRewardId = rewardId;
    this.changed();
  }
  prepareChallenge(challenge: Challenge, seed: number) {
    if (challenge.type !== "emote-target") return challenge;
    if (!this.emotes.length)
      throw new TwitchError(
        "Global emotes are not available yet. Reconnect Twitch and retry.",
      );
    const emote = this.emotes[Math.abs(seed) % this.emotes.length],
      c = structuredClone(challenge);
    c.prompt.en = c.prompt.en.replaceAll(c.emote!, emote.name);
    c.prompt.it = c.prompt.it.replaceAll(c.emote!, emote.name);
    c.emote = emote.id;
    return c;
  }
  sendSystemMessage(
    team: Team,
    text: string,
    current: () => boolean = () => true,
  ) {
    if (!text.startsWith(SYSTEM_PREFIX))
      return Promise.reject(
        new TwitchError("Only Chat Clash system announcements may be sent"),
      );
    return this.outbox.enqueue(team, text, current);
  }
  private async deliver(team: Team, text: string, current: () => boolean) {
    const api = this.accounts.get(this.botLogin()),
      target = this.accounts.get(this.options.teamLogins[team]);
    if (!api?.identity || !target?.identity)
      throw new TwitchError("Bot or broadcaster is not authorized");
    const senderId = api.identity.id,
      broadcasterId = target.identity.id;
    try {
      const result = await api.helix(
        "chat/messages",
        {
          method: "POST",
          body: JSON.stringify({
            sender_id: senderId,
            broadcaster_id: broadcasterId,
            message: text,
          }),
        },
        () =>
          current() &&
          this.accounts.get(this.botLogin()) === api &&
          this.accounts.get(this.options.teamLogins[team])?.identity?.id ===
            broadcasterId,
      );
      if (result.data?.[0]?.is_sent !== true)
        throw new TwitchError(
          "Twitch did not deliver the system message. Check chat restrictions.",
        );
    } catch (error) {
      if (error instanceof TwitchError && error.code === "cancelled") return;
      if (error instanceof TwitchError && error.status === 401)
        await this.invalidate(api);
      throw error;
    }
  }
  async close() {
    this.closed = true;
    this.cancelMaintenance?.();
    this.auth.close();
    this.outbox.close();
    for (const group of this.groups) group.source.disconnect();
    for (const api of this.accounts.values()) api.dispose();
    await Promise.all([...this.accounts.values()].map((api) => api.settle()));
  }
}
