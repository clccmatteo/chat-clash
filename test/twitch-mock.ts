import {
  FakeClock,
  FakeSocket,
  welcome,
  notification,
  chatEvent,
} from "./twitch-helpers.js";
import type { Fetcher } from "../src/twitch/runtime.js";
import { CHAT } from "../src/twitch/normalize.js";
type User = {
  id: string;
  login: string;
  display_name: string;
  broadcaster_type: string;
};
export class MockTwitch {
  clock = new FakeClock();
  users: Record<string, User> = {
    alpha: {
      id: "100",
      login: "alpha",
      display_name: "Alpha",
      broadcaster_type: "affiliate",
    },
    beta: {
      id: "200",
      login: "beta",
      display_name: "Beta",
      broadcaster_type: "",
    },
    helper: {
      id: "500",
      login: "helper",
      display_name: "Helper",
      broadcaster_type: "",
    },
  };
  nextLogin = "alpha";
  expirySeconds = 14400;
  refreshes = 0;
  private id = 0;
  private grants = new Map<string, { user: User; scopes: string[] }>();
  private devices = new Map<string, { user: User; scopes: string[] }>();
  private refreshTokens = new Map<string, { user: User; scopes: string[] }>();
  requests: { url: string; body: Record<string, any> }[] = [];
  sent: { broadcaster_id: string; sender_id: string; message: string }[] = [];
  sockets: { socket: FakeSocket; sessionId: string; subscriptions: any[] }[] =
    [];
  socketFactory = () => {
    const entry = {
      socket: new FakeSocket(),
      sessionId: `session-${++this.id}`,
      subscriptions: [],
    };
    this.sockets.push(entry);
    queueMicrotask(() => entry.socket.sendPacket(welcome(entry.sessionId)));
    return entry.socket;
  };
  private issue(grant: { user: User; scopes: string[] }) {
    const access_token = `private-access-${++this.id}`,
      refresh_token = `private-refresh-${this.id}`;
    this.grants.set(access_token, grant);
    this.refreshTokens.set(refresh_token, grant);
    return {
      access_token,
      refresh_token,
      scope: grant.scopes,
      expires_in: this.expirySeconds,
    };
  }
  http: Fetcher = async (input, init = {}) => {
    const url = String(input),
      body =
        init.body instanceof URLSearchParams
          ? Object.fromEntries(init.body)
          : typeof init.body === "string"
            ? JSON.parse(init.body)
            : {};
    this.requests.push({ url, body });
    if ("client_secret" in body)
      throw new Error("PUBLIC clients must never send a client secret");
    if (url.endsWith("/device")) {
      const device = `secret-device-${++this.id}`;
      this.devices.set(device, {
        user: this.users[this.nextLogin],
        scopes: body.scopes.split(" "),
      });
      return Response.json({
        device_code: device,
        user_code: `USERCODE${this.id}`,
        verification_uri: "https://www.twitch.tv/activate?public=true",
        expires_in: 1800,
        interval: 5,
      });
    }
    if (url.endsWith("/token")) {
      if (body.grant_type === "refresh_token") {
        this.refreshes++;
        const grant = this.refreshTokens.get(body.refresh_token);
        if (!grant)
          return Response.json(
            { message: "Invalid refresh token" },
            { status: 400 },
          );
        this.refreshTokens.delete(body.refresh_token);
        return Response.json(this.issue(grant));
      }
      const grant = this.devices.get(body.device_code);
      if (!grant)
        return Response.json(
          { message: "invalid device code" },
          { status: 400 },
        );
      this.devices.delete(body.device_code);
      return Response.json(this.issue(grant));
    }
    const token = new Headers(init.headers)
        .get("Authorization")
        ?.replace(/^(OAuth|Bearer) /, ""),
      grant = this.grants.get(token ?? "");
    if (!grant) return Response.json({}, { status: 401 });
    if (url.endsWith("/validate"))
      return Response.json({
        client_id: "publicclient123",
        user_id: grant.user.id,
        login: grant.user.login,
        scopes: grant.scopes,
        expires_in: this.expirySeconds,
      });
    if (url.endsWith("/users")) return Response.json({ data: [grant.user] });
    if (url.includes("/custom_rewards")) {
      if (!grant.user.broadcaster_type)
        return Response.json({}, { status: 403 });
      return Response.json({
        data: [
          {
            id: "reward-1",
            title: "Reinforcement",
            cost: 100,
            is_enabled: true,
            is_paused: false,
          },
          {
            id: "reward-2",
            title: "Other reward",
            cost: 50,
            is_enabled: true,
            is_paused: false,
          },
        ],
      });
    }
    if (url.endsWith("/chat/emotes/global"))
      return Response.json({ data: [{ id: "25", name: "Kappa" }] });
    if (url.endsWith("/eventsub/subscriptions")) {
      const entry = this.sockets.find(
        (s) => s.sessionId === body.transport.session_id,
      );
      if (!entry) throw new Error("Unknown socket session");
      if (body.type === CHAT && body.condition.user_id !== grant.user.id)
        throw new Error("Chat must use bot's own user token");
      if (
        body.type.includes("redemption") &&
        body.condition.broadcaster_user_id !== grant.user.id
      )
        throw new Error("Points must use broadcaster's own token");
      entry.subscriptions.push(body);
      return Response.json(
        { data: [{ id: `sub-${++this.id}`, status: "enabled" }] },
        { status: 202 },
      );
    }
    if (url.endsWith("/chat/messages")) {
      if (body.sender_id !== grant.user.id)
        throw new Error("Wrong chat sender token");
      this.sent.push(body);
      this.emit(
        body.broadcaster_id,
        CHAT,
        chatEvent({
          chatter_user_id: body.sender_id,
          message_id: `system-${++this.id}`,
          message: { text: body.message, fragments: [] },
        }),
      );
      return Response.json({
        data: [{ message_id: `sent-${++this.id}`, is_sent: true }],
      });
    }
    throw new Error(`Unexpected mock endpoint ${url}`);
  };
  emit(
    target: string,
    type: string,
    event: Record<string, unknown>,
    envelopeId = `envelope-${++this.id}`,
  ) {
    for (const entry of this.sockets.filter((s) => !s.socket.closed)) {
      const sub = entry.subscriptions.find(
        (s) =>
          s.type === type &&
          (s.condition.broadcaster_user_id === target ||
            s.condition.to_broadcaster_user_id === target),
      );
      if (!sub) continue;
      const packet = notification(
        type,
        this.clock,
        { ...event, broadcaster_user_id: target },
        envelopeId,
        sub.condition,
      );
      entry.socket.sendPacket(packet);
    }
  }
  keepalive() {
    for (const entry of this.sockets.filter((s) => !s.socket.closed))
      entry.socket.sendPacket({
        metadata: { message_type: "session_keepalive" },
        payload: {},
      });
  }
}
export async function eventually(test: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!test()) {
    if (Date.now() > deadline)
      throw new Error("Mock Twitch state did not settle");
    await new Promise((r) => setTimeout(r, 2));
  }
}
