import type { Address, Hex } from "viem";
import type { InputLog, RaidOutcome, TrapPlacement } from "@chogswipe/sim";

export interface RaidRecord {
  id: Hex;
  raider: Address;
  raiderToken: number;
  targetToken: number;
  seed: number;
  traps: TrapPlacement[];
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

/** Persistence for the referee. MemoryStore for local runs and tests; a Postgres store replaces it on deploy. */
export interface Store {
  putNonce(nonce: string, expiresAt: number): Promise<void>;
  takeNonce(nonce: string, now: number): Promise<boolean>;
  putSession(token: string, address: Address, expiresAt: number): Promise<void>;
  getSession(token: string, now: number): Promise<Address | null>;
  getLayout(tokenId: number): Promise<TrapPlacement[] | null>;
  putLayout(tokenId: number, traps: TrapPlacement[]): Promise<void>;
  putRaid(raid: RaidRecord): Promise<void>;
  getRaid(id: Hex): Promise<RaidRecord | null>;
  raidsStarted(raiderToken: number, day: string): Promise<number>;
  raidsAgainst(targetToken: number, limit: number): Promise<RaidRecord[]>;
  allLayouts(): Promise<number[]>;
}

export class MemoryStore implements Store {
  private nonces = new Map<string, number>();
  private sessions = new Map<string, { address: Address; expiresAt: number }>();
  private layouts = new Map<number, TrapPlacement[]>();
  private raids = new Map<string, RaidRecord>();

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
  async putLayout(tokenId: number, traps: TrapPlacement[]) {
    this.layouts.set(tokenId, traps);
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
}
