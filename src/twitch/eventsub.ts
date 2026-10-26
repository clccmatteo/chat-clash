import { WebSocket } from "ws";
import { Deduplicator } from "./dedup.js";
import { normalizeNotification } from "./normalize.js";
import { object, scheduler, type Scheduler } from "./runtime.js";
import {
  subscriptionKey,
  type SubscriptionSpec,
  type TwitchConnection,
  type TwitchEvent,
  type TwitchSource,
} from "./types.js";

export interface EventSocket {
  on(event: "message", listener: (data: Buffer) => void): unknown;
  on(event: "close", listener: (code: number) => void): unknown;
  on(event: "error", listener: () => void): unknown;
  close(): void;
  terminate(): void;
}
export type SourceState = {
  status: "connecting" | "connected" | "reconnecting" | "disconnected";
  subscriptions: Record<string, "pending" | "enabled" | "error">;
};
type Slot = {
  socket: EventSocket;
  id?: string;
  cancelTimer?: () => void;
  timeoutMs: number;
  migration: boolean;
};
type Options = {
  specs: SubscriptionSpec[];
  connections: TwitchConnection[];
  botId?: string;
  subscribe: (sessionId: string, spec: SubscriptionSpec) => Promise<void>;
  onEvent: (event: TwitchEvent) => void;
  onState: (state: SourceState) => void;
  onIssue: (message: string) => void;
  onRevoked: () => void;
  clock?: Scheduler;
  socketFactory?: (url: string) => EventSocket;
  initialUrl?: string;
  dedup?: Deduplicator;
};

export class EventSubSource implements TwitchSource {
  private current?: Slot;
  private replacement?: Slot;
  private cancelRetry?: () => void;
  private stopped = true;
  private attempts = 0;
  private state: SourceState = { status: "disconnected", subscriptions: {} };
  private readonly clock: Scheduler;
  private readonly dedup: Deduplicator;
  private readonly url: string;
  constructor(private options: Options) {
    this.clock = options.clock ?? scheduler;
    this.dedup = options.dedup ?? new Deduplicator();
    this.url = options.initialUrl ?? "wss://eventsub.wss.twitch.tv/ws";
  }
  private changed() {
    this.options.onState(structuredClone(this.state));
  }
  connect() {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempts = 0;
    this.open(this.url, false);
  }
  disconnect() {
    this.stopped = true;
    this.cancelRetry?.();
    const slots = [this.current, this.replacement];
    this.current = undefined;
    this.replacement = undefined;
    for (const slot of slots) {
      slot?.cancelTimer?.();
      slot?.socket.terminate();
    }
    this.state = { status: "disconnected", subscriptions: {} };
    this.changed();
  }
  private open(url: string, migration: boolean) {
    if (this.stopped) return;
    let socket: EventSocket;
    try {
      socket = this.options.socketFactory
        ? this.options.socketFactory(url)
        : new WebSocket(url, { maxPayload: 262144, handshakeTimeout: 10000 });
    } catch {
      this.retry();
      return;
    }
    const slot: Slot = { socket, migration, timeoutMs: 10000 };
    if (migration) this.replacement = slot;
    else {
      this.current = slot;
      this.state = {
        status: this.attempts ? "reconnecting" : "connecting",
        subscriptions: Object.fromEntries(
          this.options.specs.map((s) => [subscriptionKey(s), "pending"]),
        ),
      };
      this.changed();
    }
    this.arm(slot);
    socket.on("message", (data) => {
      void this.receive(slot, data);
    });
    socket.on("error", () => this.lost(slot));
    socket.on("close", () => this.lost(slot));
  }
  private arm(slot: Slot) {
    slot.cancelTimer?.();
    slot.cancelTimer = this.clock.after(slot.timeoutMs, () => this.lost(slot));
  }
  private lost(slot: Slot) {
    slot.cancelTimer?.();
    if (this.stopped || (this.current !== slot && this.replacement !== slot))
      return;
    const slots = [this.current, this.replacement];
    this.current = undefined;
    this.replacement = undefined;
    for (const old of slots) {
      old?.cancelTimer?.();
      old?.socket.terminate();
    }
    this.retry();
  }
  private retry() {
    if (this.stopped) return;
    this.state = {
      status: "reconnecting",
      subscriptions: Object.fromEntries(
        this.options.specs.map((s) => [subscriptionKey(s), "pending"]),
      ),
    };
    this.changed();
    this.options.onIssue(
      "Twitch EventSub disconnected; reconnecting. Events during an unexpected outage cannot be replayed.",
    );
    const wait = Math.min(30000, 500 * 2 ** Math.min(this.attempts++, 6));
    this.cancelRetry?.();
    this.cancelRetry = this.clock.after(wait, () => this.open(this.url, false));
  }
  private async receive(slot: Slot, data: Buffer) {
    if (this.stopped || (this.current !== slot && this.replacement !== slot))
      return;
    try {
      const packet = object(JSON.parse(String(data))),
        metadata = object(packet?.metadata),
        payload = object(packet?.payload);
      if (!metadata || !payload) return;
      const type = metadata.message_type;
      if (type === "session_welcome") {
        if (
          slot.id ||
          !object(payload.session) ||
          typeof payload.session.id !== "string"
        )
          return;
        slot.id = payload.session.id;
        const seconds = payload.session.keepalive_timeout_seconds;
        slot.timeoutMs =
          Number.isFinite(seconds) && seconds >= 10 && seconds <= 600
            ? seconds * 1000 + 1000
            : 11000;
        this.arm(slot);
        if (slot.migration) {
          const old = this.current;
          this.current = slot;
          this.replacement = undefined;
          old?.cancelTimer?.();
          old?.socket.close();
          this.state.status = "connected";
          this.changed();
          return; // Twitch transfers subscriptions; DO NOT create them again.
        }
        this.attempts = 0;
        await Promise.all(
          this.options.specs.map(async (spec) => {
            try {
              await this.options.subscribe(slot.id!, spec);
              if (this.current === slot && !this.stopped)
                this.state.subscriptions[subscriptionKey(spec)] = "enabled";
            } catch {
              if (this.current === slot && !this.stopped) {
                this.state.subscriptions[subscriptionKey(spec)] = "error";
                this.options.onIssue(
                  `Twitch subscription unavailable: ${spec.type} for Team ${spec.team}. Chat can continue if its subscription is enabled.`,
                );
              }
            }
            if (this.current === slot && !this.stopped) this.changed();
          }),
        );
        if (this.current === slot && !this.stopped) {
          if (!Object.values(this.state.subscriptions).includes("enabled")) {
            this.disconnect();
            return;
          }
          this.state.status = "connected";
          this.changed();
        }
      } else if (type === "session_keepalive" && slot.id) this.arm(slot);
      else if (type === "notification" && slot.id) {
        this.arm(slot);
        const notification = normalizeNotification(
          packet,
          this.options.connections,
          this.clock.now(),
          this.options.botId,
        );
        if (!notification) return;
        const spec = this.options.specs.find(
          (s) =>
            s.type === payload.subscription?.type &&
            s.team === notification.event.team,
        );
        if (
          !spec ||
          Object.entries(spec.condition).some(
            ([key, value]) => payload.subscription.condition?.[key] !== value,
          )
        )
          return;
        if (this.dedup.accept(notification.keys, this.clock.now()))
          this.options.onEvent(notification.event);
      } else if (
        type === "session_reconnect" &&
        slot === this.current &&
        !this.replacement
      ) {
        const candidate = new URL(payload.session?.reconnect_url),
          original = new URL(this.url);
        if (
          candidate.origin !== original.origin ||
          candidate.username ||
          candidate.password ||
          candidate.hash
        ) {
          this.options.onIssue("Rejected an invalid Twitch reconnect URL");
          return;
        }
        this.open(candidate.href, true); // Leave old socket open until welcome.
      } else if (type === "revocation") {
        const sub = object(payload.subscription);
        if (!sub) return;
        if (
          sub.status === "authorization_revoked" ||
          sub.status === "user_removed"
        ) {
          this.options.onRevoked();
          this.disconnect();
          return;
        }
        for (const spec of this.options.specs)
          if (spec.type === sub.type)
            this.state.subscriptions[subscriptionKey(spec)] = "error";
        this.options.onIssue(
          "A Twitch subscription was revoked. Reconnect the account.",
        );
        this.changed();
      }
    } catch {
      /* Malformed upstream frames never reach scoring or public logs. */
    }
  }
}
