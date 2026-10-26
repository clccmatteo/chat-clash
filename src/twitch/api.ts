import type { TokenRecord } from "./token-store.js";
import {
  endpoints,
  object,
  TwitchError,
  type Fetcher,
  type Scheduler,
  scheduler,
} from "./runtime.js";

export type Identity = {
  id: string;
  login: string;
  displayName: string;
  broadcasterType: string;
};
export class TwitchApi {
  identity: Identity | null = null;
  private refreshing: Promise<void> | null = null;
  private checkedAt = -Infinity;
  private alive = true;
  constructor(
    private tokens: TokenRecord,
    private save: (tokens: TokenRecord) => Promise<void>,
    private http: Fetcher = fetch,
    private clock: Scheduler = scheduler,
  ) {}
  hasScopes(scopes: string[]) {
    return scopes.every((s) => this.tokens.scopes.includes(s));
  }
  dispose() {
    this.alive = false;
  }
  async settle() {
    await this.refreshing?.catch(() => {});
  }
  private async request(url: string, init: RequestInit): Promise<Response> {
    if (!this.alive) throw new TwitchError("Twitch account disconnected");
    try {
      return await this.http(url, {
        ...init,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new TwitchError(
        "Twitch is not reachable. Check the connection and retry.",
      );
    }
  }
  async validate(allowRefresh = true) {
    let response = await this.request(endpoints.validate, {
      headers: { Authorization: `OAuth ${this.tokens.accessToken}` },
    });
    if (response.status === 401 && allowRefresh) {
      await this.refresh();
      return;
    }
    if (!response.ok)
      throw new TwitchError(
        response.status === 401
          ? "Twitch authorization expired or was revoked. Authorize this account again."
          : "Twitch token validation failed. Retry shortly.",
        response.status,
      );
    const data = object(await response.json());
    if (
      !data ||
      data.client_id !== this.tokens.clientId ||
      data.user_id !== this.tokens.userId ||
      data.login !== this.tokens.login ||
      !Array.isArray(data.scopes) ||
      !Number.isFinite(data.expires_in)
    )
      throw new TwitchError(
        "Twitch token identity does not match this account",
        401,
      );
    this.tokens.scopes = data.scopes;
    this.tokens.expiresAt = this.clock.now() + data.expires_in * 1000;
    this.checkedAt = this.clock.now();
    await this.save(this.tokens);
  }
  async maintain() {
    if (this.tokens.expiresAt - this.clock.now() <= 60000) await this.refresh();
    else if (this.clock.now() - this.checkedAt >= 3600000)
      await this.validate();
  }
  private async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const response = await this.request(endpoints.token, {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.tokens.clientId,
          grant_type: "refresh_token",
          refresh_token: this.tokens.refreshToken,
        }),
      });
      const data = object(await response.json());
      if (
        !response.ok ||
        !data?.access_token ||
        !data.refresh_token ||
        !Array.isArray(data.scope) ||
        !Number.isFinite(data.expires_in)
      )
        throw new TwitchError(
          "Twitch refresh failed. Authorize this account again.",
          response.status === 400 ? 401 : response.status,
        );
      // Public-client refresh tokens are single-use. Persist the rotation before
      // issuing any requests with it, and share this promise across all callers.
      this.tokens = {
        ...this.tokens,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        scopes: data.scope,
        expiresAt: this.clock.now() + data.expires_in * 1000,
      };
      await this.save(this.tokens);
      await this.validate(false);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  async helix(path: string, init: RequestInit = {}, isCurrent = () => true) {
    await this.maintain();
    const token = this.tokens.accessToken;
    const request = () => {
      if (!isCurrent())
        throw new TwitchError("Announcement cancelled", 0, "cancelled");
      return this.request(endpoints.helix + path, {
        ...init,
        headers: {
          ...init.headers,
          "Client-Id": this.tokens.clientId,
          Authorization: `Bearer ${this.tokens.accessToken}`,
          "Content-Type": "application/json",
        },
      });
    };
    let response = await request();
    if (response.status === 401) {
      if (token === this.tokens.accessToken) await this.refresh();
      else if (this.refreshing) await this.refreshing;
      response = await request();
    }
    if (!response.ok)
      throw new TwitchError(
        `Twitch API request failed (${response.status})`,
        response.status,
      );
    return response.status === 204
      ? {}
      : ((await response.json()) as Record<string, any>);
  }
  async loadIdentity() {
    await this.validate();
    const result = await this.helix("users");
    const user = result.data?.[0];
    if (
      !user ||
      user.id !== this.tokens.userId ||
      user.login !== this.tokens.login
    )
      throw new TwitchError(
        "Twitch broadcaster identity did not match the token",
        401,
      );
    this.identity = {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      broadcasterType: user.broadcaster_type,
    };
    return this.identity;
  }
}
