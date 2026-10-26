import { randomUUID } from "node:crypto";
import {
  endpoints,
  object,
  TwitchError,
  scheduler,
  type Fetcher,
  type Scheduler,
} from "./runtime.js";
import type { TokenRecord } from "./token-store.js";
export type AuthRole = "A" | "B" | "bot";
export type DeviceStatus = {
  role: AuthRole;
  login: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  status: "pending" | "checking" | "error";
  error?: string;
};
type Pending = DeviceStatus & {
  deviceCode: string;
  scopes: string[];
  interval: number;
  cancel?: () => void;
  generation: string;
};

export class DeviceAuth {
  private pending = new Map<AuthRole, Pending>();
  constructor(
    private clientId: string,
    private complete: (
      role: AuthRole,
      login: string,
      tokens: Omit<TokenRecord, "userId" | "login">,
      current: () => boolean,
    ) => Promise<void>,
    private changed: () => void,
    private http: Fetcher = fetch,
    private clock: Scheduler = scheduler,
  ) {}
  status() {
    return [...this.pending.values()].map(
      ({
        role,
        login,
        userCode,
        verificationUri,
        expiresAt,
        status,
        error,
      }) => ({
        role,
        login,
        userCode,
        verificationUri,
        expiresAt,
        status,
        error,
      }),
    );
  }
  hasPending() {
    return [...this.pending.values()].some((p) => p.status !== "error");
  }
  async begin(role: AuthRole, login: string, scopes: string[]) {
    this.cancel(role);
    // Reserve the role before I/O so double clicks cannot create orphan polls.
    const generation = randomUUID();
    const pending: Pending = {
      role,
      login,
      scopes,
      generation,
      deviceCode: "",
      interval: 5000,
      userCode: "",
      verificationUri: "",
      expiresAt: this.clock.now() + 60000,
      status: "checking",
    };
    this.pending.set(role, pending);
    this.changed();
    try {
      const response = await this.http(endpoints.device, {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.clientId,
          scopes: scopes.join(" "),
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = object(await response.json());
      if (
        !response.ok ||
        !data?.device_code ||
        typeof data.user_code !== "string" ||
        !Number.isFinite(data.expires_in)
      )
        throw new TwitchError(
          "Cannot start Twitch authorization. Check the public Client ID and retry.",
        );
      const uri = new URL(data.verification_uri);
      if (
        uri.protocol !== "https:" ||
        !["www.twitch.tv", "twitch.tv"].includes(uri.hostname) ||
        (uri.port && uri.port !== "443") ||
        uri.pathname !== "/activate" ||
        uri.username ||
        uri.password ||
        uri.hash
      )
        throw new TwitchError("Twitch returned an invalid activation URL");
      if (this.pending.get(role) !== pending) return;
      Object.assign(pending, {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: uri.href,
        interval: Math.max(1000, Number(data.interval || 5) * 1000),
        expiresAt: this.clock.now() + data.expires_in * 1000,
        status: "pending",
      });
      this.schedule(pending);
      this.changed();
    } catch (error) {
      if (this.pending.get(role) === pending) {
        pending.status = "error";
        pending.error =
          error instanceof TwitchError
            ? error.message
            : "Cannot reach Twitch authorization. Retry shortly.";
        this.changed();
      }
    }
  }
  private schedule(p: Pending) {
    p.cancel = this.clock.after(
      Math.min(p.interval, Math.max(0, p.expiresAt - this.clock.now())),
      () => {
        void this.poll(p);
      },
    );
  }
  private async poll(p: Pending) {
    if (this.pending.get(p.role) !== p) return;
    try {
      if (this.clock.now() >= p.expiresAt)
        throw new TwitchError("Device code expired. Request a new code.");
      const response = await this.http(endpoints.token, {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.clientId,
          device_code: p.deviceCode,
          scopes: p.scopes.join(" "),
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = object(await response.json());
      if (this.pending.get(p.role) !== p) return;
      if (!response.ok) {
        if (response.status >= 500 || response.status === 408) {
          p.error =
            "Twitch is temporarily unavailable; retrying authorization.";
          this.schedule(p);
          this.changed();
          return;
        }
        p.error = undefined;
        if (
          data?.message === "authorization_pending" ||
          data?.error === "authorization_pending"
        ) {
          this.schedule(p);
          return;
        }
        if (
          data?.message === "slow_down" ||
          data?.error === "slow_down" ||
          response.status === 429
        ) {
          p.interval += 5000;
          this.schedule(p);
          return;
        }
        throw new TwitchError(
          "Twitch authorization was denied or expired. Request a new code.",
        );
      }
      if (
        typeof data?.access_token !== "string" ||
        typeof data.refresh_token !== "string" ||
        !Array.isArray(data.scope) ||
        !Number.isFinite(data.expires_in)
      )
        throw new TwitchError("Twitch returned an invalid token response");
      p.status = "checking";
      this.changed();
      await this.complete(
        p.role,
        p.login,
        {
          clientId: this.clientId,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          scopes: data.scope,
          expiresAt: this.clock.now() + data.expires_in * 1000,
        },
        () => this.pending.get(p.role) === p,
      );
      if (this.pending.get(p.role) === p) this.pending.delete(p.role);
      this.changed();
    } catch (error) {
      if (this.pending.get(p.role) === p) {
        if (
          !(error instanceof TwitchError) &&
          p.status !== "checking" &&
          this.clock.now() < p.expiresAt
        ) {
          p.error = "Connection interrupted; retrying authorization.";
          this.schedule(p);
        } else {
          p.status = "error";
          p.error =
            error instanceof TwitchError
              ? error.message
              : "Twitch authorization failed. Retry shortly.";
        }
        this.changed();
      }
    }
  }
  cancel(role: AuthRole) {
    this.pending.get(role)?.cancel?.();
    this.pending.delete(role);
    this.changed();
  }
  close() {
    for (const role of [...this.pending.keys()]) this.cancel(role);
  }
}
