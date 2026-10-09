import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GUARD,
  Input,
  LINKS,
  ROOM_W,
  VAULT_ROOM,
  createRaid,
  guardX,
  loadoutFor,
  makeBot,
  simulateRaid,
  step,
  validateHideout,
  type BotOptions,
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

const run = (su: RaidSetup, opts: BotOptions = {}) => simulateRaid(su, record(su, makeBot(opts)));

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

describe("map routes", () => {
  it("escapes an empty hideout through the kitchen with all the loot", () => {
    const out = run(setup([]), { route: "kitchen" });
    expect(out.result).toBe("escaped");
    expect(out.lootBps).toBe(10_000);
    expect(out.events.filter((e) => e.type === "climb")).toHaveLength(2);
  });

  it("escapes upstairs after picking the locked door", () => {
    const out = run(setup([]), { route: "upstairs" });
    expect(out.result).toBe("escaped");
    expect(out.events.some((e) => e.type === "door" && e.by === "pick")).toBe(true);
  });

  it("Rage Horns smash the door instantly, Lockpick is faster than picking", () => {
    const horns = run(setup([], loadoutFor({ Tier: "Common", Head: "Red Horn" })), { route: "upstairs" });
    const pick = run(setup([], loadoutFor({ Tier: "Common", Head: "Robber" })), { route: "upstairs" });
    const plainRun = run(setup([]), { route: "upstairs" });
    expect(horns.events.some((e) => e.type === "door" && e.by === "Rage Horns")).toBe(true);
    const doorAt = (o: typeof horns) => o.events.find((e) => e.type === "door")!.t;
    expect(doorAt(horns)).toBeLessThan(doorAt(pick));
    expect(doorAt(pick)).toBeLessThan(doorAt(plainRun));
  });

  it("the locked door blocks walking through until opened", () => {
    const su = setup([]);
    const s = createRaid(su);
    s.room = 4;
    s.x = ROOM_W - 20;
    for (let i = 0; i < 30; i++) step(s, su, Input.RIGHT);
    expect(s.room).toBe(4);
    expect(s.x).toBe(ROOM_W);
  });

  it("vents only work with Vent Crawl", () => {
    const vent = LINKS.find((l) => l.kind === "vent")!;
    for (const [head, expected] of [["Plumber", 4], ["MCGA", 1]] as const) {
      const su = setup([], loadoutFor({ Tier: "Common", Head: head }));
      const s = createRaid(su);
      s.room = vent.a.room;
      s.x = vent.a.x;
      step(s, su, Input.UP);
      for (let i = 0; i < 40; i++) step(s, su, 0);
      expect(s.room).toBe(expected);
    }
  });

  it("stairs take the raider between floors", () => {
    const su = setup([]);
    const s = createRaid(su);
    s.room = 2;
    s.x = 180;
    step(s, su, Input.UP);
    expect(s.climb).not.toBeNull();
    for (let i = 0; i < 30; i++) step(s, su, 0);
    expect(s.room).toBe(VAULT_ROOM);
  });
});

describe("guard", () => {
  it("patrols deterministically between its bounds", () => {
    for (let t = 0; t < 2_000; t += 7) {
      expect(guardX(t)).toBeGreaterThanOrEqual(GUARD.x0);
      expect(guardX(t)).toBeLessThanOrEqual(GUARD.x1);
    }
  });

  it("catches a raider who walks into it, but Disguise passes unless carrying loot", () => {
    const su = setup([]);
    const s = createRaid(su);
    s.room = GUARD.room;
    s.x = guardX(1);
    step(s, su, 0);
    expect(s.events.some((e) => e.type === "caught")).toBe(true);
    expect(s.hp).toBe(2);

    const disguised = setup([], loadoutFor({ Tier: "Common", Body: "Tuxedo" }));
    const d = createRaid(disguised);
    d.room = GUARD.room;
    d.x = guardX(1);
    step(d, disguised, 0);
    expect(d.events.some((e) => e.type === "caught")).toBe(false);
    d.lootBps = 10_000;
    d.x = guardX(2);
    step(d, disguised, 0);
    expect(d.events.some((e) => e.type === "caught")).toBe(true);
  });

  it("Stink Bomb knocks the guard out for the rest of the raid", () => {
    const su = setup([], loadoutFor({ Tier: "Common", Accessory: "SB" }));
    const s = createRaid(su);
    s.room = GUARD.room;
    s.x = 100;
    step(s, su, Input.SPECIAL);
    expect(s.guardOut).toBe(true);
    s.x = guardX(s.t + 1);
    step(s, su, 0);
    expect(s.events.some((e) => e.type === "caught")).toBe(false);
  });
});

describe("raid", () => {
  it("is deterministic for the same setup and inputs", () => {
    const su = setup([{ room: 1, x: 300, kind: "Tripwire" }]);
    const log = record(su, makeBot());
    expect(JSON.stringify(simulateRaid(su, log))).toBe(JSON.stringify(simulateRaid(su, log)));
  });

  it("matches the live step-by-step run", () => {
    const su = setup([
      { room: 0, x: 300, kind: "Tripwire" },
      { room: 5, x: 500, kind: "Crybaby Alarm" },
    ]);
    const live = createRaid(su);
    const bot = makeBot();
    while (!live.result) step(live, su, bot(live));
    const replay = run(su);
    expect(replay.result).toBe(live.result);
    expect(replay.ticks).toBe(live.t);
    expect(replay.events).toEqual(live.events);
  });

  it("stuns and damages when walking into a tripwire", () => {
    const out = run(setup([{ room: 0, x: 300, kind: "Tripwire" }]));
    expect(out.events.some((e) => e.type === "trap" && e.kind === "Tripwire")).toBe(true);
    expect(out.hp).toBeLessThanOrEqual(2);
  });

  it("jumping over a trap avoids it", () => {
    const out = run(setup([{ room: 0, x: 300, kind: "Tripwire" }]), { seeTraps: true });
    expect(out.events.some((e) => e.type === "trap")).toBe(false);
  });

  it("knocks out a raider who walks into two chompers", () => {
    const defender = loadoutFor({ Tier: "Common", Mouth: "Grit" });
    const out = run(
      setup(
        [
          { room: 0, x: 300, kind: "Chomper" },
          { room: 1, x: 300, kind: "Chomper" },
        ],
        plain,
        defender,
      ),
    );
    expect(out.result).toBe("knocked-out");
    expect(out.lootBps).toBe(0);
  });

  it("Guard blocks the first trap", () => {
    const raider = loadoutFor({ Tier: "Common", Head: "Spartan Helmet" });
    const out = run(setup([{ room: 0, x: 300, kind: "Tripwire" }], raider));
    expect(out.events.some((e) => e.type === "blocked" && e.by === "Guard")).toBe(true);
  });

  it("higher tier power makes stuns longer", () => {
    const common = loadoutFor({ Tier: "Common", Mouth: "Bubblegum" });
    const legendary = loadoutFor({ Tier: "Legendary", Mouth: "Bubblegum" });
    const traps: TrapPlacement[] = [{ room: 0, x: 300, kind: "Gum Snare" }];
    const a = setup(traps, plain, common);
    const b = setup(traps, plain, legendary);
    const sa = createRaid(a);
    const sb = createRaid(b);
    sa.x = sb.x = 300;
    step(sa, a, 0);
    step(sb, b, 0);
    expect(sb.stun - sa.stun).toBe(Math.floor((60 * 175) / 100) - 60);
  });

  it("Crybaby Alarm cuts the clock", () => {
    const su = setup([{ room: 0, x: 300, kind: "Crybaby Alarm" }]);
    const s = createRaid(su);
    s.x = 300;
    step(s, su, 0);
    expect(s.timeLeft).toBeLessThan(120 * 30 - 200);
  });

  it("X-Ray reveals traps in the current room only", () => {
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
  });

  it("standing still times out with nothing", () => {
    const out = simulateRaid(setup([]), []);
    expect(out.result).toBe("timeout");
    expect(out.lootBps).toBe(0);
  });

  it("rejects malformed input logs", () => {
    expect(() => simulateRaid(setup([]), [[5, 2], [5, 1]])).toThrow();
    expect(() => simulateRaid(setup([]), [[1, 999]])).toThrow();
  });
});

describe("hideout validation", () => {
  it("accepts a valid layout", () => {
    expect(
      validateHideout({
        defender: chog1462,
        traps: [
          { room: 0, x: 300, kind: "Spring Plate" },
          { room: 4, x: 300, kind: "Tripwire" },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects too many traps, foreign kinds, bad positions, blocked spots and crowding", () => {
    const errors = validateHideout({
      defender: plain,
      traps: [
        { room: 0, x: 300, kind: "Chomper" },
        { room: 0, x: 330, kind: "Tripwire" },
        { room: 6, x: 300, kind: "Tripwire" },
        { room: 2, x: 180, kind: "Tripwire" },
      ],
    });
    expect(errors.some((e) => e.includes("too many"))).toBe(true);
    expect(errors.some((e) => e.includes("not in loadout"))).toBe(true);
    expect(errors.some((e) => e.includes("bad room"))).toBe(true);
    expect(errors.some((e) => e.includes("blocks"))).toBe(true);
    expect(errors.some((e) => e.includes("too close"))).toBe(true);
  });
});
