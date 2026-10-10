// Postgres persistence for the referee. Used when DATABASE_URL is set.
import type { Pool } from "pg";
import type { Address, Hex } from "viem";
import type { TrapPlacement } from "@chogswipe/sim";
import type { RaidRecord, Store } from "./store.js";

export const SCHEMA = `
create table if not exists nonces (nonce text primary key, expires_at bigint not null);
create table if not exists sessions (token text primary key, address text not null, expires_at bigint not null);
create table if not exists layouts (token_id integer primary key, traps jsonb not null, updated_at bigint not null);
create table if not exists raids (
  id text primary key,
  raider_token integer not null,
  target_token integer not null,
  day text not null,
  started_at bigint not null,
  finished_at bigint,
  record jsonb not null
);
create index if not exists raids_raider_day on raids (raider_token, day);
create index if not exists raids_target on raids (target_token, started_at);
`;

export class PgStore implements Store {
  constructor(private pool: Pool) {}

  async migrate() {
    await this.pool.query(SCHEMA);
  }

  async putNonce(nonce: string, expiresAt: number) {
    await this.pool.query("insert into nonces (nonce, expires_at) values ($1, $2)", [nonce, expiresAt]);
  }

  async takeNonce(nonce: string, now: number) {
    const r = await this.pool.query<{ expires_at: string }>("delete from nonces where nonce = $1 returning expires_at", [nonce]);
    return r.rowCount === 1 && Number(r.rows[0]!.expires_at) > now;
  }

  async putSession(token: string, address: Address, expiresAt: number) {
    await this.pool.query("insert into sessions (token, address, expires_at) values ($1, $2, $3)", [token, address, expiresAt]);
  }

  async getSession(token: string, now: number) {
    const r = await this.pool.query<{ address: Address; expires_at: string }>("select address, expires_at from sessions where token = $1", [token]);
    const row = r.rows[0];
    return row && Number(row.expires_at) > now ? row.address : null;
  }

  async getLayout(tokenId: number) {
    const r = await this.pool.query<{ traps: TrapPlacement[] }>("select traps from layouts where token_id = $1", [tokenId]);
    return r.rows[0]?.traps ?? null;
  }

  async putLayout(tokenId: number, traps: TrapPlacement[]) {
    await this.pool.query(
      "insert into layouts (token_id, traps, updated_at) values ($1, $2, $3) on conflict (token_id) do update set traps = excluded.traps, updated_at = excluded.updated_at",
      [tokenId, JSON.stringify(traps), Date.now()],
    );
  }

  async putRaid(raid: RaidRecord) {
    await this.pool.query(
      `insert into raids (id, raider_token, target_token, day, started_at, finished_at, record)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set finished_at = excluded.finished_at, record = excluded.record`,
      [raid.id, raid.raiderToken, raid.targetToken, raid.day, raid.startedAt, raid.finishedAt ?? null, JSON.stringify(raid)],
    );
  }

  async getRaid(id: Hex) {
    const r = await this.pool.query<{ record: RaidRecord }>("select record from raids where id = $1", [id]);
    return r.rows[0]?.record ?? null;
  }

  async raidsStarted(raiderToken: number, day: string) {
    const r = await this.pool.query<{ n: string }>("select count(*) as n from raids where raider_token = $1 and day = $2", [raiderToken, day]);
    return Number(r.rows[0]!.n);
  }

  async raidsAgainst(targetToken: number, limit: number) {
    const r = await this.pool.query<{ record: RaidRecord }>(
      "select record from raids where target_token = $1 and finished_at is not null order by started_at desc limit $2",
      [targetToken, limit],
    );
    return r.rows.map((x) => x.record);
  }

  async allLayouts() {
    const r = await this.pool.query<{ token_id: number }>("select token_id from layouts");
    return r.rows.map((x) => x.token_id);
  }
}
