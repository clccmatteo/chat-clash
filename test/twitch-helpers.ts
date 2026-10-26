import { EventEmitter } from "node:events";
import type { Scheduler } from "../src/twitch/runtime.js";
import type { EventSocket } from "../src/twitch/eventsub.js";
export class FakeClock implements Scheduler {
  time = Date.parse("2026-10-25T12:00:00Z");
  private id = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  after(ms: number, callback: () => void) {
    const id = ++this.id;
    this.timers.set(id, { at: this.time + ms, callback });
    return () => {
      this.timers.delete(id);
    };
  }
  async advance(ms: number) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await drain();
    }
    this.time = end;
    await drain();
  }
}
export const drain = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
export class FakeSocket extends EventEmitter implements EventSocket {
  closed = false;
  sendPacket(packet: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(packet)));
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.emit("close", 1000);
    }
  }
  terminate() {
    this.close();
  }
}
export function welcome(id = "session-1") {
  return {
    metadata: { message_type: "session_welcome" },
    payload: { session: { id, keepalive_timeout_seconds: 10 } },
  };
}
export function notification<T extends Record<string, unknown>>(
  type: string,
  clock: FakeClock,
  event: T,
  messageId = "envelope-1",
  extraCondition = {},
) {
  return {
    metadata: {
      message_type: "notification",
      message_id: messageId,
      message_timestamp: new Date(clock.now()).toISOString(),
      subscription_type: type,
      subscription_version: "1",
    },
    payload: {
      subscription: {
        type,
        version: "1",
        condition: { broadcaster_user_id: "100", ...extraCondition },
      },
      event: { broadcaster_user_id: "100", ...event },
    },
  };
}
export function chatEvent(extras = {}) {
  return {
    chatter_user_id: "300",
    chatter_user_name: "Viewer",
    message_id: "chat-1",
    message: { text: "hello", fragments: [] },
    ...extras,
  };
}
