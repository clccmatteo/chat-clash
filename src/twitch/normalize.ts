import type { TwitchConnection, TwitchEvent } from "./types.js";
import { idValid, object } from "./runtime.js";
export const CHAT = "channel.chat.message";
export const REDEMPTION = "channel.channel_points_custom_reward_redemption.add";
export const CHEER = "channel.cheer";
export const RAID = "channel.raid";
export const SYSTEM_PREFIX = "[Chat Clash] ";

export function normalizeNotification(
  raw: unknown,
  connections: TwitchConnection[],
  now: number,
  botId?: string,
): { event: TwitchEvent; keys: string[] } | null {
  const packet = object(raw),
    metadata = object(packet?.metadata),
    payload = object(packet?.payload);
  const sub = object(payload?.subscription),
    e = object(payload?.event);
  if (
    !metadata ||
    !sub ||
    !e ||
    metadata.message_type !== "notification" ||
    typeof metadata.message_id !== "string" ||
    !metadata.message_id ||
    metadata.subscription_type !== sub.type ||
    metadata.subscription_version !== "1" ||
    sub.version !== "1"
  )
    return null;
  const providerTs = Date.parse(metadata.message_timestamp);
  if (
    !Number.isFinite(providerTs) ||
    now - providerTs > 600000 ||
    providerTs - now > 60000
  )
    return null;
  const target =
    sub.type === RAID ? e.to_broadcaster_user_id : e.broadcaster_user_id;
  const connection = connections.find((c) => c.broadcasterId === target);
  if (
    !connection ||
    !object(sub.condition) ||
    (sub.type === RAID
      ? sub.condition.to_broadcaster_user_id
      : sub.condition.broadcaster_user_id) !== target
  )
    return null;
  const base = { team: connection.team, ts: now, providerTs };
  const keys = [`envelope:${target}:${metadata.message_id}`];
  if (sub.type === CHAT) {
    if (e.source_broadcaster_user_id && e.source_broadcaster_user_id !== target)
      return null;
    if (
      !idValid(e.chatter_user_id) ||
      typeof e.chatter_user_name !== "string" ||
      !e.chatter_user_name ||
      typeof e.message_id !== "string" ||
      !e.message_id ||
      !object(e.message) ||
      typeof e.message.text !== "string"
    )
      return null;
    if (e.chatter_user_id === botId && e.message.text.startsWith(SYSTEM_PREFIX))
      return null;
    const fragments: Record<string, any>[] = Array.isArray(e.message.fragments)
      ? e.message.fragments
      : [];
    const emotes: string[] = fragments
      .filter((f) => f?.type === "emote" && typeof f.emote?.id === "string")
      .map((f) => f.emote.id);
    keys.push(`chat:${target}:${e.message_id}`);
    return {
      keys,
      event: {
        ...base,
        type: "chat",
        userId: e.chatter_user_id,
        userName: e.chatter_user_name.slice(0, 40),
        text: e.message.text.slice(0, 1000),
        emotes: [...new Set(emotes)],
      },
    };
  }
  if (sub.type === REDEMPTION) {
    if (
      !connection.reinforcementRewardId ||
      e.reward?.id !== connection.reinforcementRewardId ||
      !idValid(e.user_id) ||
      typeof e.user_name !== "string" ||
      !e.user_name ||
      typeof e.id !== "string" ||
      !e.id ||
      e.status === "canceled"
    )
      return null;
    keys.push(`redemption:${target}:${e.id}`);
    return {
      keys,
      event: {
        ...base,
        type: "redemption",
        userId: e.user_id,
        userName: e.user_name.slice(0, 40),
      },
    };
  }
  if (sub.type === CHEER) {
    // Anonymous cheers cannot obey per-user caps or receive honest MVP credit.
    if (
      e.is_anonymous ||
      !idValid(e.user_id) ||
      typeof e.user_name !== "string" ||
      !e.user_name ||
      !Number.isSafeInteger(e.bits) ||
      e.bits <= 0
    )
      return null;
    return {
      keys,
      event: {
        ...base,
        type: "cheer",
        userId: e.user_id,
        userName: e.user_name.slice(0, 40),
        amount: e.bits,
      },
    };
  }
  if (sub.type === RAID) {
    if (
      !idValid(e.from_broadcaster_user_id) ||
      typeof e.from_broadcaster_user_name !== "string" ||
      !e.from_broadcaster_user_name ||
      !Number.isSafeInteger(e.viewers) ||
      e.viewers <= 0
    )
      return null;
    return {
      keys,
      event: {
        ...base,
        type: "raid",
        userId: e.from_broadcaster_user_id,
        userName: e.from_broadcaster_user_name.slice(0, 40),
        amount: e.viewers,
      },
    };
  }
  return null;
}
