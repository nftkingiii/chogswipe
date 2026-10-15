import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLIMB_TICKS,
  DOOR_STOP,
  GUARD,
  Input,
  LINKS,
  ROOM_W,
  VAULT_ROOM,
  createRaid,
  loadoutFor,
  makeBot,
  simulateRaid,
  step,
  validateHideout,
  HOUSE_PLAN,
  type FloorPlan,
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
    s.x = ROOM_W - 200;
    for (let i = 0; i < 40; i++) step(s, su, Input.RIGHT);
    expect(s.room).toBe(4);
    expect(s.x).toBe(ROOM_W - DOOR_STOP);
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
    s.room = LINKS[1]!.a.room;
    s.x = LINKS[1]!.a.x;
    step(s, su, Input.UP);
    expect(s.climb).not.toBeNull();
    for (let i = 0; i < CLIMB_TICKS + 5; i++) step(s, su, 0);
    expect(s.x).toBe(LINKS[1]!.b.x);
    expect(s.room).toBe(VAULT_ROOM);
  });
});

describe("guard", () => {
  const inKitchen = (su: RaidSetup, x: number) => {
    const s = createRaid(su);
    s.room = GUARD.room;
    s.x = x;
    return s;
  };

  it("patrols its beat and pauses at each end", () => {
    const su = setup([]);
    const s = createRaid(su);
    let paused = 0;
    for (let i = 0; i < 2_000; i++) {
      step(s, su, 0);
      expect(s.guards[0]!.x).toBeGreaterThanOrEqual(GUARD.x0);
      expect(s.guards[0]!.x).toBeLessThanOrEqual(GUARD.x1);
      if (s.guards[0]!.mode === "pause") paused++;
    }
    expect(paused).toBeGreaterThan(0);
  });

  it("catches a raider who walks into its face and ends the raid", () => {
    const su = setup([]);
    const s = inKitchen(su, GUARD.x0 + 44); // right in front of it
    s.facing = -1;
    step(s, su, Input.LEFT);
    expect(s.events.some((e) => e.type === "caught")).toBe(true);
    expect(s.result).toBe("caught");
  });

  it("spots a raider ahead and gives chase", () => {
    const su = setup([]);
    const s = inKitchen(su, GUARD.x0 + 200);
    step(s, su, 0);
    expect(s.events.some((e) => e.type === "spotted")).toBe(true);
    for (let i = 0; i < 60 && !s.result; i++) step(s, su, 0);
    expect(s.result).toBe("caught");
  });

  it("can be outrun back out of the room", () => {
    const su = setup([]);
    const s = inKitchen(su, 100);
    s.guards[0] = { x: 320, dir: -1, mode: "patrol", timer: 0, out: false };
    for (let i = 0; i < 200 && s.room === GUARD.room; i++) step(s, su, Input.LEFT);
    expect(s.result).toBeNull();
    expect(s.room).toBe(GUARD.room - 1);
  });

  it("can be jumped over", () => {
    const su = setup([]);
    const s = inKitchen(su, 120);
    s.guards[0] = { x: 260, dir: -1, mode: "chase", timer: 100, out: false };
    let jumped = false;
    for (let i = 0; i < 80 && !s.result; i++) {
      const close = !jumped && s.guards[0]!.x - s.x <= 70;
      if (close) jumped = true;
      step(s, su, Input.RIGHT | (close ? Input.JUMP : 0));
    }
    expect(s.result).toBeNull();
    expect(s.x).toBeGreaterThan(s.guards[0]!.x);
  });

  it("does not see a raider sneaking up behind it", () => {
    const su = setup([]);
    const s = inKitchen(su, 300);
    s.guards[0] = { x: 340, dir: 1, mode: "patrol", timer: 0, out: false }; // walking away
    for (let i = 0; i < 14; i++) step(s, su, Input.RIGHT);
    expect(s.x).toBeGreaterThan(s.guards[0]!.x);
    expect(s.events.some((e) => e.type === "caught")).toBe(false);
  });

  it("Second Life survives one catch", () => {
    const su = setup([], loadoutFor({ Tier: "Common", Accessory: "Heart" }));
    const s = inKitchen(su, GUARD.x0 + 44);
    s.facing = -1;
    step(s, su, Input.LEFT);
    expect(s.result).toBeNull();
    expect(s.secondLifeUsed).toBe(true);
  });

  it("Disguise passes unless carrying loot", () => {
    const disguised = setup([], loadoutFor({ Tier: "Common", Body: "Tuxedo" }));
    const d = inKitchen(disguised, GUARD.x0 + 44);
    d.facing = -1;
    step(d, disguised, Input.LEFT);
    expect(d.result).toBeNull();
    d.lootBps = 10_000;
    d.x = d.guards[0]!.x + 30 * d.guards[0]!.dir;
    d.facing = -d.guards[0]!.dir as 1 | -1;
    step(d, disguised, 0);
    expect(d.result).toBe("caught");
  });

  it("Stink Bomb knocks the guard out for the rest of the raid", () => {
    const su = setup([], loadoutFor({ Tier: "Common", Accessory: "SB" }));
    const s = inKitchen(su, 40);
    s.guards[0] = { x: 600, dir: 1, mode: "patrol", timer: 0, out: false };
    step(s, su, Input.SPECIAL);
    expect(s.guards[0]!.out).toBe(true);
    s.x = s.guards[0]!.x;
    step(s, su, 0);
    expect(s.result).toBeNull();
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
      { room: 5, x: 300, kind: "Crybaby Alarm" },
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
        { room: 2, x: 160, kind: "Tripwire" },
      ],
    });
    expect(errors.some((e) => e.includes("too many"))).toBe(true);
    expect(errors.some((e) => e.includes("not in loadout"))).toBe(true);
    expect(errors.some((e) => e.includes("bad room"))).toBe(true);
    expect(errors.some((e) => e.includes("blocks"))).toBe(true);
    expect(errors.some((e) => e.includes("too close"))).toBe(true);
  });
});

describe("lore locations", () => {
  it("every preset heist has a valid layout and can be beaten", async () => {
    const { LOCATIONS } = await import("../src/index.js");
    for (const loc of LOCATIONS) {
      const defender = loadoutFor(loc.traits);
      expect(validateHideout({ defender, traps: loc.traps, plan: loc.plan }), loc.slug).toEqual([]);
      const su = setup(loc.traps, loadoutFor({ Tier: "Legendary", Head: "Spartan Helmet", Body: "Golden Armor" }), defender);
      su.hideout.plan = loc.plan;
      const out = run(su, { plan: loc.plan, seeTraps: true });
      const why = out.events.filter((e) => ["caught", "trap", "scald", "end"].includes(e.type)).map((e) => `${e.type}@${e.t}`).join(" ");
      expect(out.result, `${loc.slug}: ${why}`).toBe("escaped");
    }
  });
});

describe("Blink and Prank Card", () => {
  it("Blink teleports forward once per cooldown", () => {
    const su = setup([], loadoutFor({ Tier: "Common", Body: "Wizard" }));
    const s = createRaid(su);
    s.x = 100;
    step(s, su, Input.SPECIAL);
    expect(s.x).toBe(320);
    step(s, su, 0);
    step(s, su, Input.SPECIAL);
    expect(s.x).toBe(320); // still cooling down
  });

  it("Blink can't pass a closed locked door", () => {
    const su = setup([], loadoutFor({ Tier: "Common", Body: "Wizard" }));
    const s = createRaid(su);
    s.room = 4;
    s.x = ROOM_W - 200;
    step(s, su, Input.SPECIAL);
    expect(s.room).toBe(4);
    expect(s.x).toBe(ROOM_W - DOOR_STOP);
  });

  it("Prank Card ignores Spring Plate and Jack-in-the-Box", () => {
    const defender = loadoutFor({ Tier: "Common", Mouth: "Smile" });
    const su = setup([{ room: 0, x: 300, kind: "Spring Plate" }], loadoutFor({ Tier: "Common", Head: "Clown Nose" }), defender);
    const s = createRaid(su);
    s.x = 300;
    step(s, su, 0);
    expect(s.events.some((e) => e.type === "blocked" && e.by === "Prank Card")).toBe(true);
    expect(s.x).toBe(300);
  });
});

describe("floor plans", () => {
  const plan = (over: Partial<FloorPlan>): FloorPlan => ({ ...HOUSE_PLAN, guards: [], ...over });
  const at = (p: FloorPlan, room: number, x: number) => {
    const su = setup([]);
    su.hideout.plan = p;
    const s = createRaid(su);
    s.room = room;
    s.x = x;
    return { su, s };
  };

  it("a launch pad goes up but not back down", () => {
    const p = plan({ links: [{ kind: "launch", a: { room: 2, x: 700 }, b: { room: 5, x: 600 } }] });
    const { su, s } = at(p, 2, 700);
    step(s, su, Input.UP);
    for (let i = 0; i < 40; i++) step(s, su, 0);
    expect(s.room).toBe(5);
    step(s, su, Input.DOWN);
    expect(s.climb).toBeNull();
  });

  it("a portal works from both ends with UP", () => {
    const p = plan({ links: [{ kind: "portal", a: { room: 0, x: 240 }, b: { room: 5, x: 220 } }] });
    const { su, s } = at(p, 0, 240);
    step(s, su, Input.UP);
    for (let i = 0; i < 40; i++) step(s, su, 0);
    expect([s.room, s.x]).toEqual([5, 220]);
    step(s, su, Input.UP);
    for (let i = 0; i < 40; i++) step(s, su, 0);
    expect([s.room, s.x]).toEqual([0, 240]);
  });

  it("steam scalds while it blasts, and is safe between bursts", () => {
    const p = plan({ hazards: [{ kind: "steam", room: 4, x0: 500, x1: 800, period: 100, on: 30, offset: 0 }] });
    const { su, s } = at(p, 4, 600);
    step(s, su, 0); // t = 1: blasting
    expect(s.events.some((e) => e.type === "scald")).toBe(true);
    const quiet = at(p, 4, 600);
    quiet.s.t = 49; // t = 50: off
    step(quiet.s, quiet.su, 0);
    expect(quiet.s.events.some((e) => e.type === "scald")).toBe(false);
  });

  it("water slows the raider", () => {
    const p = plan({ hazards: [{ kind: "water", room: 0, x0: 100, x1: 500 }] });
    const dry = at(plan({}), 0, 200);
    const wet = at(p, 0, 200);
    step(dry.s, dry.su, Input.RIGHT);
    step(wet.s, wet.su, Input.RIGHT);
    expect(wet.s.x - 200).toBeLessThan(dry.s.x - 200);
  });

  it("a flying guard can't be jumped", () => {
    const p = plan({ guards: [{ room: 2, x0: 300, x1: 700, speed: 3, flies: true }] });
    const { su, s } = at(p, 2, 100);
    s.guards[0] = { x: 240, dir: -1, mode: "chase", timer: 100, out: false };
    let jumped = false;
    for (let i = 0; i < 60 && !s.result; i++) {
      const close = !jumped && s.guards[0]!.x - s.x <= 70;
      if (close) jumped = true;
      step(s, su, Input.RIGHT | (close ? Input.JUMP : 0));
    }
    expect(s.result).toBe("caught");
  });

  it("every guard post patrols on its own", () => {
    const p = plan({ guards: [{ room: 1, x0: 240, x1: 720, speed: 4 }, { room: 4, x0: 200, x1: 620, speed: 4 }] });
    const { su, s } = at(p, 0, 100);
    for (let i = 0; i < 50; i++) step(s, su, 0);
    expect(s.guards).toHaveLength(2);
    expect(s.guards[0]!.x).not.toBe(240);
    expect(s.guards[1]!.x).not.toBe(200);
  });
});

describe("stars and the daily heist", () => {
  it("the autopilot earns all three stars on every heist, so par is always reachable", async () => {
    const { LOCATIONS, DEMO_ROSTER, starsFor } = await import("../src/index.js");
    for (const loc of LOCATIONS) {
      const su = setup(loc.traps, loadoutFor(DEMO_ROSTER[0]!.traits), loadoutFor(loc.traits));
      su.hideout.plan = loc.plan;
      const out = run(su, { plan: loc.plan, seeTraps: true, scout: true });
      expect(starsFor(out, loc), loc.slug).toBeGreaterThanOrEqual(2);
      expect(out.ticks, loc.slug).toBeLessThanOrEqual(loc.par * 30);
    }
  });

  it("stars: none for a failed run, one lost for each trap or a slow time", async () => {
    const { LOCATIONS, starsFor } = await import("../src/index.js");
    const loc = LOCATIONS[0]!;
    expect(starsFor({ result: "caught", lootBps: 0, ticks: 100, events: [] }, loc)).toBe(0);
    expect(starsFor({ result: "escaped", lootBps: 500, ticks: 100, events: [] }, loc)).toBe(3);
    expect(starsFor({ result: "escaped", lootBps: 500, ticks: 100, events: [{ t: 5, type: "scald" }] }, loc)).toBe(2);
    expect(starsFor({ result: "escaped", lootBps: 500, ticks: loc.par * 30 + 1, events: [{ t: 5, type: "scald" }] }, loc)).toBe(1);
  });

  it("the daily heist is the same all day and changes each day", async () => {
    const { dailyHeist, LOCATIONS } = await import("../src/index.js");
    expect(dailyHeist("2026-10-15")).toEqual(dailyHeist("2026-10-15"));
    const week = Array.from({ length: LOCATIONS.length }, (_, i) => dailyHeist(`2026-10-${String(10 + i).padStart(2, "0")}`));
    expect(new Set(week.map((d) => d.location.slug)).size).toBe(LOCATIONS.length);
    expect(new Set(week.map((d) => d.seed)).size).toBe(LOCATIONS.length);
    expect(() => dailyHeist("not a day")).toThrow();
  });
});
