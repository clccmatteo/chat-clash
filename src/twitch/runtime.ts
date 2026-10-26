export interface Scheduler {
  now(): number;
  after(ms: number, callback: () => void): () => void;
}
export const scheduler: Scheduler = {
  now: () => Date.now(),
  after(ms, callback) {
    const timer = setTimeout(callback, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};
export class TwitchError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "",
  ) {
    super(message);
  }
}
export type Fetcher = typeof fetch;
export const endpoints = {
  device: "https://id.twitch.tv/oauth2/device",
  token: "https://id.twitch.tv/oauth2/token",
  validate: "https://id.twitch.tv/oauth2/validate",
  helix: "https://api.twitch.tv/helix/",
};
export function object(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}
export const loginValid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9_]{1,25}$/.test(value);
export const idValid = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);
export const BOT_SCOPES = ["user:read:chat", "user:write:chat", "user:bot"];
export const BROADCASTER_SCOPES = [
  "channel:bot",
  "channel:read:redemptions",
  "bits:read",
];
