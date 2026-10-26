import type { Team } from "../game/types.js";
import { scheduler, type Scheduler } from "./runtime.js";
type Job = {
  text: string;
  current: () => boolean;
  resolve: () => void;
  reject: (error: unknown) => void;
};
export class ChatOutbox {
  private queues: Record<Team, Job[]> = { A: [], B: [] };
  private running = new Set<Team>();
  private nextAt: Record<Team, number> = { A: 0, B: 0 };
  private waits = new Set<{ cancel: () => void; resolve: () => void }>();
  private closed = false;
  constructor(
    private send: (
      team: Team,
      text: string,
      current: () => boolean,
    ) => Promise<void>,
    private clock: Scheduler = scheduler,
  ) {}
  enqueue(team: Team, text: string, current: () => boolean) {
    if (this.closed || !current()) return Promise.resolve();
    if (text.length > 500)
      return Promise.reject(
        new Error("System message exceeds Twitch's 500-character limit"),
      );
    if (this.queues[team].length >= 24)
      return Promise.reject(new Error("Chat announcement queue is full"));
    return new Promise<void>((resolve, reject) => {
      this.queues[team].push({ text, current, resolve, reject });
      void this.drain(team);
    });
  }
  private async drain(team: Team) {
    if (this.running.has(team)) return;
    this.running.add(team);
    try {
      while (!this.closed && this.queues[team].length) {
        const job = this.queues[team].shift()!;
        if (!job.current()) {
          job.resolve();
          continue;
        }
        const delay = this.nextAt[team] - this.clock.now();
        if (delay > 0)
          await new Promise<void>((resolve) => {
            const wait = { cancel: () => {}, resolve };
            wait.cancel = this.clock.after(delay, () => {
              this.waits.delete(wait);
              resolve();
            });
            this.waits.add(wait);
          });
        if (this.closed || !job.current()) {
          job.resolve();
          continue;
        }
        this.nextAt[team] = this.clock.now() + 1100;
        try {
          await this.send(team, job.text, job.current);
          job.resolve();
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      this.running.delete(team);
    }
  }
  close() {
    this.closed = true;
    for (const wait of this.waits) {
      wait.cancel();
      wait.resolve();
    }
    this.waits.clear();
    for (const team of ["A", "B"] as const)
      for (const job of this.queues[team].splice(0)) job.resolve();
  }
}
