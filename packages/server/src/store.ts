import type { Address, Hex } from "viem";
import type { InputLog, RaidOutcome, TrapPlacement } from "@chogswipe/sim";

export interface RaidRecord {
  id: Hex;
  raider: Address;
  raiderToken: number;
  targetToken: number;
  seed: number;
  traps: TrapPlacement[];
  /** the hideout's floor plan id (player hideouts); lore houses use their own */
  plan?: string;
  capAmount: string; // wei, decimal string
  startedAt: number;
  day: string;
  finishedAt?: number;
  inputs?: InputLog;
  outcome?: Omit<RaidOutcome, "events">;
  amount?: string;
  signature?: Hex;
  shieldSecs?: number;
  deadline?: number;
}

/** A best daily-heist run, kept per player name per day. */
export interface DailyRun {
  day: string;
  name: string;
  chogId: number;
  ticks: number;
  stars: number;
  at: number;
}

export interface Feedback {
  at: number;
  text: string;
  contact?: string;
  where?: string;
}

/** One anonymous analytics event: a page visit, a heist started or finished. */
export interface GameEvent {
  at: number;
  type: string;
  /** random id kept in the player's browser; no wallet, no IP */
  visitor: string;
  data: Record<string, string | number>;
}

/** Persistence for the referee. MemoryStore for local runs and tests; a Postgres store replaces it on deploy. */
export interface Store {
  putNonce(nonce: string, expiresAt: number): Promise<void>;
  takeNonce(nonce: string, now: number): Promise<boolean>;
  putSession(token: string, address: Address, expiresAt: number): Promise<void>;
  getSession(token: string, now: number): Promise<Address | null>;
  getLayout(tokenId: number): Promise<TrapPlacement[] | null>;
  putLayout(tokenId: number, traps: TrapPlacement[], plan?: string): Promise<void>;
  /** the floor plan id saved with a layout, if any */
  getPlan(tokenId: number): Promise<string | null>;
  putRaid(raid: RaidRecord): Promise<void>;
  getRaid(id: Hex): Promise<RaidRecord | null>;
  raidsStarted(raiderToken: number, day: string): Promise<number>;
  raidsAgainst(targetToken: number, limit: number): Promise<RaidRecord[]>;
  allLayouts(): Promise<number[]>;
  /** keeps the faster of this run and the name's earlier best that day */
  putDailyRun(run: DailyRun): Promise<void>;
  dailyTop(day: string, limit: number): Promise<DailyRun[]>;
  putFeedback(f: Feedback): Promise<void>;
  listFeedback(limit: number): Promise<Feedback[]>;
  putEvent(e: GameEvent): Promise<void>;
  /** events at or after `since`, oldest first, at most `limit` */
  eventsSince(since: number, limit: number): Promise<GameEvent[]>;
}

const faster = (a: DailyRun, b: DailyRun) => a.ticks - b.ticks || a.at - b.at;

export class MemoryStore implements Store {
  private nonces = new Map<string, number>();
  private sessions = new Map<string, { address: Address; expiresAt: number }>();
  private layouts = new Map<number, TrapPlacement[]>();
  private plans = new Map<number, string>();
  private raids = new Map<string, RaidRecord>();
  private daily = new Map<string, DailyRun>();
  private feedback: Feedback[] = [];
  private events: GameEvent[] = [];

  async putNonce(nonce: string, expiresAt: number) {
    this.nonces.set(nonce, expiresAt);
  }
  async takeNonce(nonce: string, now: number) {
    const exp = this.nonces.get(nonce);
    this.nonces.delete(nonce);
    return exp !== undefined && exp > now;
  }
  async putSession(token: string, address: Address, expiresAt: number) {
    this.sessions.set(token, { address, expiresAt });
  }
  async getSession(token: string, now: number) {
    const s = this.sessions.get(token);
    return s && s.expiresAt > now ? s.address : null;
  }
  async getLayout(tokenId: number) {
    return this.layouts.get(tokenId) ?? null;
  }
  async putLayout(tokenId: number, traps: TrapPlacement[], plan?: string) {
    this.layouts.set(tokenId, traps);
    if (plan) this.plans.set(tokenId, plan);
    else this.plans.delete(tokenId);
  }
  async getPlan(tokenId: number) {
    return this.plans.get(tokenId) ?? null;
  }
  async putRaid(raid: RaidRecord) {
    this.raids.set(raid.id, raid);
  }
  async getRaid(id: Hex) {
    return this.raids.get(id) ?? null;
  }
  async raidsStarted(raiderToken: number, day: string) {
    return [...this.raids.values()].filter((r) => r.raiderToken === raiderToken && r.day === day).length;
  }
  async raidsAgainst(targetToken: number, limit: number) {
    return [...this.raids.values()]
      .filter((r) => r.targetToken === targetToken && r.finishedAt)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }
  async allLayouts() {
    return [...this.layouts.keys()];
  }
  async putDailyRun(run: DailyRun) {
    const key = `${run.day}|${run.name.toLowerCase()}`;
    const old = this.daily.get(key);
    if (!old || run.ticks < old.ticks) this.daily.set(key, run);
  }
  async dailyTop(day: string, limit: number) {
    return [...this.daily.values()].filter((r) => r.day === day).sort(faster).slice(0, limit);
  }
  async putFeedback(f: Feedback) {
    this.feedback.push(f);
  }
  async listFeedback(limit: number) {
    return this.feedback.slice(-limit).reverse();
  }
  async putEvent(e: GameEvent) {
    this.events.push(e);
  }
  async eventsSince(since: number, limit: number) {
    return this.events.filter((e) => e.at >= since).slice(0, limit);
  }
}
