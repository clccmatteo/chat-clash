import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { TwitchError } from "./runtime.js";

export type TokenRecord = {
  clientId: string;
  userId: string;
  login: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: number;
};
export class TokenStore {
  private records = new Map<string, TokenRecord>();
  private rewards = new Map<string, string>();
  private writes: Promise<void> = Promise.resolve();
  constructor(private filename: string) {}
  async load() {
    try {
      const doc = JSON.parse(await readFile(this.filename, "utf8"));
      if (doc.version !== 1 || !Array.isArray(doc.accounts)) throw new Error();
      for (const record of doc.accounts) {
        if (
          !["clientId", "userId", "login", "accessToken", "refreshToken"].every(
            (k) => typeof record[k] === "string",
          ) ||
          !Array.isArray(record.scopes) ||
          !record.scopes.every((s: unknown) => typeof s === "string") ||
          !Number.isFinite(record.expiresAt)
        )
          throw new Error();
        this.records.set(`${record.clientId}:${record.login}`, record);
      }
      for (const [id, reward] of Object.entries(doc.rewards ?? {}))
        if (typeof reward === "string") this.rewards.set(id, reward);
      await chmod(this.filename, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new TwitchError(
          "Cannot read local Twitch tokens. Check the token file and its permissions.",
        );
    }
  }
  get(clientId: string, login: string) {
    const r = this.records.get(`${clientId}:${login}`);
    return r ? structuredClone(r) : undefined;
  }
  getReward(userId: string) {
    return this.rewards.get(userId);
  }
  async put(record: TokenRecord) {
    this.records.set(
      `${record.clientId}:${record.login}`,
      structuredClone(record),
    );
    await this.flush();
  }
  async remove(clientId: string, login: string) {
    this.records.delete(`${clientId}:${login}`);
    await this.flush();
  }
  async setReward(userId: string, reward: string) {
    this.rewards.set(userId, reward);
    await this.flush();
  }
  private async flush() {
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        try {
          await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 });
          const temporary = `${this.filename}.${randomUUID()}.tmp`;
          await writeFile(
            temporary,
            JSON.stringify({
              version: 1,
              accounts: [...this.records.values()],
              rewards: Object.fromEntries(this.rewards),
            }),
            { mode: 0o600, flag: "wx" },
          );
          await rename(temporary, this.filename);
          await chmod(this.filename, 0o600);
        } catch {
          throw new TwitchError(
            "Cannot save local Twitch tokens. Check the token directory permissions.",
          );
        }
      });
    await this.writes;
  }
}
