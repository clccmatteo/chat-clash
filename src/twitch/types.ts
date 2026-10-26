import type { ClashEvent, Team } from "../game/types.js";

/** EventSub emits through its constructor's onEvent callback. No game I/O. */
export interface TwitchSource {
  connect(): void;
  disconnect(): void;
}
export interface TwitchChat {
  /** Announce only system text, including flash prompts and !vote instructions. */
  sendSystemMessage(
    team: Team,
    text: string,
    current?: () => boolean,
  ): Promise<void>;
}

/** Adapter must verify channel/team, deduplicate provider event IDs, resolve emote
 * IDs, filter the configured Reinforcement reward and stamp events in server time.
 * Never trust a chatter-supplied team, username, timestamp or reward amount.
 * An individual channel-point redemption becomes one `redemption` event.
 */
export interface TwitchConnection {
  team: Team;
  broadcasterId: string;
  reinforcementRewardId: string;
}

export type TwitchEvent = ClashEvent & { providerTs: number };
export type SubscriptionSpec = {
  team: Team;
  type: string;
  condition: Record<string, string>;
};
export const subscriptionKey = (s: Pick<SubscriptionSpec, "team" | "type">) =>
  `${s.team}:${s.type}`;
