import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  Input,
  ROOMS,
  ROOM_W,
  VAULT_X,
  createRaid,
  loadoutFor,
  simulateRaid,
  step,
  validateHideout,
  type InputLog,
  type Loadout,
  type RaidSetup,
  type RaidState,
  type TrapPlacement,
} from "../src/index.js";

const chog1462 = loadoutFor({
  Tier: "Uncommon",
  Mouth: "Flat",
  Eyes: "BTC Glass",
  Head: "MCGA",
  Body: "Yellow 143 Jersey",
  Accessory: "Fwog",
  Side: "Left",
});

const plain: Loadout = loadoutFor({ Tier: "Common", Eyes: "Happy", Mouth: "Sad" });

function setup(traps: TrapPlacement[], raider: Loadout = plain, defender: Loadout = plain): RaidSetup {
  return { seed: 42, raider, hideout: { defender, traps } };
}

type Policy = (s: RaidState) => number;

/** Run a policy and record its input log (only mask changes). */
function record(su: RaidSetup, policy: Policy): InputLog {
  const s = createRaid(su);
  const log: [number, number][] = [];
  let prev = -1;
  while (!s.result) {
    const mask = policy(s);
    if (mask !== prev) log.push([s.t, mask]);
    prev = mask;
    step(s, su, mask);
  }
  return log;
}

/** Walks to the vault, grabs, walks home. `jump` jumps over every armed trap. */
function runner({ jump = false } = {}): Policy {
  return (s) => {
    const home = s.lootBps > 0;
    let mask: number = home ? Input.LEFT : Input.RIGHT;
    const atVault = s.room === ROOMS - 1 && s.x >= VAULT_X - 40;
    if (!home && atVault) mask = Input.GRAB;
    const dir = home ? -1 : 1;
    if (jump && s.air === 0 && s.stun === 0) {
      const near = s.traps.some((tr) => tr.armed && tr.room === s.room && (tr.x - s.x) * dir > 0 && (tr.x - s.x) * dir <= 40);
      if (near && !(s.prevMask & Input.JUMP)) mask |= Input.JUMP;
    }
    return mask;
  };
}

describe("loadout", () => {
  it("maps Chog #1 (metadata 1462) traits", () => {
    expect(chog1462).toMatchObject({
      tier: "Uncommon",
      trap: "Spring Plate",
      scout: "X-Ray",
      head: "Brim Shade",
      body: "Sprint",
      special: "Pet Scout",
      aura: null,
      entrySide: "Left",
    });
    expect(chog1462.stats.trapSlots).toBe(4);
  });

  it("gives every Chog in the snapshot a complete loadout", () => {
    const files = JSON.parse(readFileSync(new URL("../../../data/chog-metadata.json", import.meta.url), "utf8")).files;
    const all = Object.values(files) as Record<string, string>[];
    expect(all.length).toBeGreaterThan(1900);
    for (const t of all) {
      const l = loadoutFor(t);
      expect(l.stats.trapSlots).toBeGreaterThanOrEqual(3);
      expect(l.trap).toBeTruthy();
      expect(l.scout).toBeTruthy();
    }
  });
});

describe("raid", () => {
  it("escapes an empty hideout with all the loot", () => {
    const su = setup([]);
    const out = simulateRaid(su, record(su, runner()));
    expect(out.result).toBe("escaped");
    expect(out.lootBps).toBe(10_000);
  });

  it("is deterministic for the same setup and inputs", () => {
    const su = setup([{ room: 1, x: 400, kind: "Tripwire" }]);
    const log = record(su, runner());
    expect(JSON.stringify(simulateRaid(su, log))).toBe(JSON.stringify(simulateRaid(su, log)));
  });

  it("matches the live step-by-step run", () => {
    const su = setup([{ room: 0, x: 300, kind: "Tripwire" }, { room: 2, x: 500, kind: "Crybaby Alarm" }]);
    const policy = runner();
    const live = createRaid(su);
    while (!live.result) step(live, su, policy(live));
    const replay = simulateRaid(su, record(su, runner()));
    expect(replay.result).toBe(live.result);
    expect(replay.ticks).toBe(live.t);
    expect(replay.events).toEqual(live.events);
  });

  it("stuns and damages when walking into a tripwire", () => {
    const su = setup([{ room: 0, x: 300, kind: "Tripwire" }]);
    const out = simulateRaid(su, record(su, runner()));
    expect(out.events.some((e) => e.type === "trap" && e.kind === "Tripwire")).toBe(true);
    expect(out.hp).toBe(2);
  });

  it("jumping over a trap avoids it", () => {
    const su = setup([{ room: 0, x: 300, kind: "Tripwire" }]);
    const out = simulateRaid(su, record(su, runner({ jump: true })));
    expect(out.events.some((e) => e.type === "trap")).toBe(false);
    expect(out.hp).toBe(3);
  });

  it("knocks out a raider who walks into two chompers", () => {
    const defender = loadoutFor({ Tier: "Common", Mouth: "Grit" });
    const su = setup(
      [
        { room: 0, x: 300, kind: "Chomper" },
        { room: 1, x: 300, kind: "Chomper" },
      ],
      plain,
      defender,
    );
    const out = simulateRaid(su, record(su, runner()));
    expect(out.result).toBe("knocked-out");
    expect(out.lootBps).toBe(0);
  });

  it("Guard blocks the first trap", () => {
    const raider = loadoutFor({ Tier: "Common", Head: "Spartan Helmet" });
    const su = setup([{ room: 0, x: 300, kind: "Tripwire" }], raider);
    const out = simulateRaid(su, record(su, runner()));
    expect(out.events.some((e) => e.type === "blocked" && e.by === "Guard")).toBe(true);
    expect(out.hp).toBe(3);
  });

  it("Slick Floor on the way home drops loot", () => {
    const defender = loadoutFor({ Tier: "Common", Mouth: "Drooling" });
    const su = setup([{ room: 2, x: 400, kind: "Slick Floor" }], plain, defender);
    // walk over it on the way in by jumping, then hit it on the way home
    const policy: Policy = (s) => {
      const base = runner()(s);
      if (s.lootBps === 0 && s.room === 2 && s.x >= 360 && s.x < 400 && s.air === 0 && !(s.prevMask & Input.JUMP)) {
        return base | Input.JUMP;
      }
      return base;
    };
    const out = simulateRaid(su, record(su, policy));
    expect(out.result).toBe("escaped");
    expect(out.lootBps).toBe(7_000);
  });

  it("higher tier power makes stuns longer", () => {
    const common = loadoutFor({ Tier: "Common", Mouth: "Bubblegum" });
    const legendary = loadoutFor({ Tier: "Legendary", Mouth: "Bubblegum" });
    const traps: TrapPlacement[] = [{ room: 0, x: 300, kind: "Gum Snare" }];
    const a = setup(traps, plain, common);
    const b = setup(traps, plain, legendary);
    const ta = simulateRaid(a, record(a, runner())).ticks;
    const tb = simulateRaid(b, record(b, runner())).ticks;
    expect(tb - ta).toBe(Math.floor((60 * 175) / 100) - 60);
  });

  it("Crybaby Alarm cuts the clock", () => {
    const su = setup([{ room: 0, x: 300, kind: "Crybaby Alarm" }]);
    const s = createRaid(su);
    const policy = runner();
    while (!s.result && !s.events.some((e) => e.type === "trap")) step(s, su, policy(s));
    expect(s.timeLeft).toBeLessThan(90 * 30 - s.t - 200);
  });

  it("X-Ray reveals traps in the current room", () => {
    const raider = loadoutFor({ Tier: "Common", Eyes: "Plasma visor" });
    const su = setup(
      [
        { room: 0, x: 300, kind: "Tripwire" },
        { room: 1, x: 300, kind: "Tripwire" },
      ],
      raider,
    );
    const s = createRaid(su);
    step(s, su, Input.SCOUT);
    expect(s.traps.map((t) => t.revealed)).toEqual([true, false]);
    expect(s.scoutCharges).toBe(1);
  });

  it("standing still times out with nothing", () => {
    const out = simulateRaid(setup([]), []);
    expect(out.result).toBe("timeout");
    expect(out.lootBps).toBe(0);
  });

  it("rejects input logs with non-increasing ticks", () => {
    expect(() => simulateRaid(setup([]), [[5, 2], [5, 1]])).toThrow();
  });
});

describe("hideout validation", () => {
  it("accepts a valid layout", () => {
    expect(
      validateHideout({
        defender: chog1462,
        traps: [
          { room: 0, x: 300, kind: "Spring Plate" },
          { room: 1, x: 500, kind: "Tripwire" },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects too many traps, foreign kinds, bad positions and crowding", () => {
    const errors = validateHideout({
      defender: plain,
      traps: [
        { room: 0, x: 300, kind: "Chomper" },
        { room: 0, x: 330, kind: "Tripwire" },
        { room: 3, x: 300, kind: "Tripwire" },
        { room: 2, x: ROOM_W - 10, kind: "Tripwire" },
      ],
    });
    expect(errors.some((e) => e.includes("too many"))).toBe(true);
    expect(errors.some((e) => e.includes("not in loadout"))).toBe(true);
    expect(errors.some((e) => e.includes("bad room"))).toBe(true);
    expect(errors.some((e) => e.includes("out of bounds"))).toBe(true);
    expect(errors.some((e) => e.includes("too close"))).toBe(true);
  });
});
