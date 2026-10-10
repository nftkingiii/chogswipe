import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { PgStore } from "../src/pgStore.js";
import type { RaidRecord } from "../src/store.js";

async function store() {
  const { Pool } = newDb().adapters.createPg();
  const s = new PgStore(new Pool() as unknown as Pool);
  await s.migrate();
  return s;
}

describe("PgStore", () => {
  it("issues nonces once", async () => {
    const s = await store();
    await s.putNonce("n1", Date.now() + 60_000);
    expect(await s.takeNonce("n1", Date.now())).toBe(true);
    expect(await s.takeNonce("n1", Date.now())).toBe(false);
  });

  it("expires sessions", async () => {
    const s = await store();
    await s.putSession("t1", "0x0000000000000000000000000000000000000001", Date.now() + 60_000);
    await s.putSession("t2", "0x0000000000000000000000000000000000000002", Date.now() - 1);
    expect(await s.getSession("t1", Date.now())).toBe("0x0000000000000000000000000000000000000001");
    expect(await s.getSession("t2", Date.now())).toBeNull();
  });

  it("upserts layouts", async () => {
    const s = await store();
    await s.putLayout(7, [{ room: 0, x: 300, kind: "Tripwire" }]);
    await s.putLayout(7, [{ room: 1, x: 300, kind: "Tripwire" }]);
    expect(await s.getLayout(7)).toEqual([{ room: 1, x: 300, kind: "Tripwire" }]);
    expect(await s.allLayouts()).toEqual([7]);
  });

  it("stores raids, counts daily starts and lists finished raids against a hideout", async () => {
    const s = await store();
    const base: RaidRecord = {
      id: "0x01",
      raider: "0x0000000000000000000000000000000000000001",
      raiderToken: 1,
      targetToken: 2,
      seed: 5,
      traps: [],
      capAmount: "100",
      startedAt: 1_000,
      day: "2026-10-10",
    };
    await s.putRaid(base);
    await s.putRaid({ ...base, id: "0x02", startedAt: 2_000 });
    expect(await s.raidsStarted(1, "2026-10-10")).toBe(2);
    expect(await s.raidsAgainst(2, 10)).toHaveLength(0);
    await s.putRaid({ ...base, finishedAt: 1_500, amount: "10" });
    const list = await s.raidsAgainst(2, 10);
    expect(list).toHaveLength(1);
    expect(list[0]!.amount).toBe("10");
    expect((await s.getRaid("0x01"))!.finishedAt).toBe(1_500);
  });
});
