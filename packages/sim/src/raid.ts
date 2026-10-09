// Deterministic raid simulation. Integer math and a seeded RNG only, so the
// browser (rendering) and the referee server (verification) reach the same
// outcome from the same setup and input log.

import type { Loadout, TrapKind } from "./loadout.js";
import {
  COLS,
  ENTRY_ROOM,
  GUARD,
  LINKS,
  LINK_REACH,
  LOCKED_DOOR,
  ROOMS,
  ROOM_W,
  VAULT_ROOM,
  VAULT_X,
  blockedSpots,
  colOf,
} from "./map.js";
import { rng } from "./rng.js";

export { ROOMS, ROOM_W, VAULT_X, VAULT_ROOM };

export const TICK_HZ = 30;
export const RAID_TICKS = 120 * TICK_HZ;

const TRAP_REACH = 24;
const JUMP_TICKS = 18;
const BASE_SPEED = 8;
const BASE_HP = 3;
const GRAB_TICKS = 45;
const LOCKPICK_GRAB_TICKS = 15;
export const CLIMB_TICKS = 24;
const VENT_TICKS = 36;
const DOOR_TICKS = 90;
const LOCKPICK_DOOR_TICKS = 30;
const GUARD_REACH = 46;
const GUARD_COOLDOWN = 90;
const FULL = 10_000; // loot in basis points of the capped amount

export const Input = {
  LEFT: 1,
  RIGHT: 2,
  JUMP: 4,
  SCOUT: 8,
  SPECIAL: 16,
  GRAB: 32,
  UP: 64,
  DOWN: 128,
} as const;
export const INPUT_MASK_MAX = 255;

/** Input changes: [tick, mask], ticks strictly increasing. A mask holds until the next entry. */
export type InputLog = ReadonlyArray<readonly [number, number]>;

export interface TrapPlacement {
  room: number;
  x: number;
  kind: TrapKind;
}

export interface Hideout {
  defender: Loadout;
  traps: readonly TrapPlacement[];
}

export interface RaidSetup {
  seed: number;
  raider: Loadout;
  hideout: Hideout;
}

export type RaidEvent =
  | { t: number; type: "trap"; trap: number; kind: TrapKind }
  | { t: number; type: "blocked"; trap: number; by: string }
  | { t: number; type: "reveal"; traps: number[]; by: string }
  | { t: number; type: "disarm"; trap: number; by: string }
  | { t: number; type: "hunch"; trap: number }
  | { t: number; type: "room"; room: number; via: "walk" | "stairs" | "vent" | "spring" }
  | { t: number; type: "climb"; kind: "stairs" | "vent"; from: number; to: number }
  | { t: number; type: "door"; by: "pick" | "Lockpick" | "Rage Horns" }
  | { t: number; type: "caught" }
  | { t: number; type: "guard-out"; by: string }
  | { t: number; type: "grab" }
  | { t: number; type: "drop"; lootBps: number }
  | { t: number; type: "second-life" }
  | { t: number; type: "special"; kind: string }
  | { t: number; type: "end"; result: RaidResultKind };

export type RaidResultKind = "escaped" | "knocked-out" | "timeout";

interface TrapState extends TrapPlacement {
  armed: boolean;
  revealed: boolean;
  hunched: boolean;
}

export interface Climb {
  kind: "stairs" | "vent";
  from: { room: number; x: number };
  to: { room: number; x: number };
  left: number;
  total: number;
}

export interface RaidState {
  t: number;
  room: number;
  x: number;
  facing: 1 | -1;
  air: number;
  hp: number;
  stun: number;
  invert: number;
  boost: number;
  timeLeft: number;
  grab: number;
  lootBps: number;
  scoutCharges: number;
  specialUsed: boolean;
  guardUsed: boolean;
  secondLifeUsed: boolean;
  alarmImmune: boolean;
  climb: Climb | null;
  doorOpen: boolean;
  doorWork: number;
  guardOut: boolean;
  guardCooldown: number;
  prevMask: number;
  traps: TrapState[];
  events: RaidEvent[];
  result: RaidResultKind | null;
}

export interface RaidOutcome {
  result: RaidResultKind;
  lootBps: number;
  ticks: number;
  hp: number;
  events: RaidEvent[];
}

const SCOUT_CHARGES: Record<Loadout["scout"], number> = {
  Hunch: 0,
  "X-Ray": 3,
  "Laser Eyes": 2,
  Peek: 1,
  "Tear Sense": 4,
  "Wild Glance": 3,
};

// ------------------------------------------------------------------ guard

/** Guard x on a deterministic back-and-forth patrol. */
export function guardX(t: number): number {
  const span = GUARD.x1 - GUARD.x0;
  const p = (t * GUARD.speed) % (span * 2);
  return p <= span ? GUARD.x0 + p : GUARD.x1 - (p - span);
}

export function guardFacing(t: number): 1 | -1 {
  const span = GUARD.x1 - GUARD.x0;
  return (t * GUARD.speed) % (span * 2) < span ? 1 : -1;
}

// ------------------------------------------------------------------ layout

export function validateHideout(h: Hideout): string[] {
  const errors: string[] = [];
  if (h.traps.length > h.defender.stats.trapSlots) {
    errors.push(`too many traps: ${h.traps.length} > ${h.defender.stats.trapSlots}`);
  }
  const blocked = blockedSpots();
  h.traps.forEach((tr, i) => {
    if (tr.kind !== "Tripwire" && tr.kind !== h.defender.trap) errors.push(`trap ${i}: ${tr.kind} not in loadout`);
    if (!Number.isInteger(tr.room) || tr.room < 0 || tr.room >= ROOMS) errors.push(`trap ${i}: bad room`);
    if (!Number.isInteger(tr.x) || tr.x < 60 || tr.x > ROOM_W - 60) errors.push(`trap ${i}: x out of bounds`);
    if (blocked.some((b) => b.room === tr.room && Math.abs(b.x - tr.x) < b.r)) errors.push(`trap ${i}: blocks a doorway, stairs, vent or the vault`);
    h.traps.forEach((other, j) => {
      if (j > i && other.room === tr.room && Math.abs(other.x - tr.x) < 64) errors.push(`traps ${i} and ${j} too close`);
    });
  });
  return errors;
}

// ------------------------------------------------------------------- setup

export function createRaid(setup: RaidSetup): RaidState {
  const { raider, hideout } = setup;
  const fog = hideout.defender.aura === "Fog" ? 1 : 0;
  const charges = SCOUT_CHARGES[raider.scout];
  return {
    t: 0,
    room: ENTRY_ROOM,
    x: 0,
    facing: 1,
    air: 0,
    hp: BASE_HP + (raider.body === "Armor Plate" ? 1 : 0),
    stun: hideout.defender.aura === "Zap" ? scaled(60, setup) : 0,
    invert: 0,
    boost: 0,
    timeLeft: RAID_TICKS,
    grab: 0,
    lootBps: 0,
    scoutCharges: charges === 0 ? 0 : Math.max(1, charges - fog),
    specialUsed: false,
    guardUsed: false,
    secondLifeUsed: false,
    alarmImmune: false,
    climb: null,
    doorOpen: false,
    doorWork: 0,
    guardOut: false,
    guardCooldown: 0,
    prevMask: 0,
    traps: hideout.traps.map((tr) => ({ ...tr, armed: true, revealed: false, hunched: false })),
    events: [],
    result: null,
  };
}

/** Defender trap durations scale with the defender's tier power. */
function scaled(ticks: number, setup: RaidSetup): number {
  return Math.floor((ticks * setup.hideout.defender.stats.power) / 100);
}

// -------------------------------------------------------------------- step

export function step(s: RaidState, setup: RaidSetup, mask: number): void {
  if (s.result) return;
  const { raider, hideout } = setup;
  const pressed = mask & ~s.prevMask;
  s.prevMask = mask;
  s.t += 1;
  s.timeLeft -= 1;
  if (s.boost > 0) s.boost -= 1;
  if (s.invert > 0) s.invert -= 1;
  if (s.guardCooldown > 0) s.guardCooldown -= 1;

  if (s.climb) {
    s.climb.left -= 1;
    if (s.climb.left <= 0) {
      s.room = s.climb.to.room;
      s.x = s.climb.to.x;
      s.events.push({ t: s.t, type: "room", room: s.room, via: s.climb.kind });
      s.climb = null;
    }
  } else if (s.stun > 0) {
    s.stun -= 1;
  } else {
    if (pressed & Input.SCOUT) scout(s, setup);
    if (pressed & Input.SPECIAL) special(s, setup);
    if (!tryClimb(s, setup, pressed)) move(s, setup, mask, pressed);
  }

  if (!s.climb && s.air === 0) {
    hunch(s, setup);
    triggerTraps(s, setup);
    guard(s, setup);
  }

  if (s.hp <= 0) {
    if (raider.special === "Second Life" && !s.secondLifeUsed) {
      s.secondLifeUsed = true;
      s.hp = 1;
      s.events.push({ t: s.t, type: "second-life" });
    } else {
      return end(s, "knocked-out", 0);
    }
  }

  if (s.room === ENTRY_ROOM && s.x <= 0 && s.lootBps > 0 && !s.climb) {
    let loot = s.lootBps;
    if (hideout.defender.aura === "Burn") loot = Math.floor((loot * 9_000) / FULL);
    if (hideout.defender.head === "Hex") loot = Math.floor((loot * 9_000) / FULL);
    return end(s, "escaped", loot);
  }
  if (s.timeLeft <= 0) end(s, "timeout", 0);
}

function end(s: RaidState, result: RaidResultKind, lootBps: number): void {
  s.result = result;
  s.lootBps = lootBps;
  s.events.push({ t: s.t, type: "end", result });
}

function speedOf(s: RaidState, setup: RaidSetup): number {
  const { raider, hideout } = setup;
  let v = BASE_SPEED;
  if (raider.body === "Sprint") v += 2;
  if (raider.body === "Streaker") v += 4;
  if (raider.head === "Dash Band") v += 1;
  if (s.boost > 0) v += 4;
  if (hideout.defender.aura === "Chill") v -= 2;
  if (hideout.defender.special === "Dump") v -= 1;
  return v;
}

/** UP at a lower link end or DOWN at an upper one starts a climb. Vents need Vent Crawl. */
function tryClimb(s: RaidState, setup: RaidSetup, pressed: number): boolean {
  if (s.air > 0 || !(pressed & (Input.UP | Input.DOWN))) return false;
  for (const l of LINKS) {
    if (l.kind === "vent" && setup.raider.head !== "Vent Crawl") continue;
    const up = pressed & Input.UP && l.a.room === s.room && Math.abs(l.a.x - s.x) <= LINK_REACH;
    const down = pressed & Input.DOWN && l.b.room === s.room && Math.abs(l.b.x - s.x) <= LINK_REACH;
    if (!up && !down) continue;
    const [from, to] = up ? [l.a, l.b] : [l.b, l.a];
    const total = l.kind === "vent" ? VENT_TICKS : CLIMB_TICKS;
    s.climb = { kind: l.kind, from: { room: s.room, x: s.x }, to: { ...to }, left: total, total };
    s.events.push({ t: s.t, type: "climb", kind: l.kind, from: from.room, to: to.room });
    return true;
  }
  return false;
}

function atLockedDoor(s: RaidState): boolean {
  return (s.room === LOCKED_DOOR.left && s.x >= ROOM_W - 60) || (s.room === LOCKED_DOOR.right && s.x <= 60);
}

function move(s: RaidState, setup: RaidSetup, mask: number, pressed: number): void {
  let dir = (mask & Input.RIGHT ? 1 : 0) - (mask & Input.LEFT ? 1 : 0);
  if (s.invert > 0) dir = -dir;
  if (dir !== 0) s.facing = dir as 1 | -1;

  if (s.air > 0) s.air -= 1;
  else if (pressed & Input.JUMP) s.air = JUMP_TICKS;

  // working the locked door: hold GRAB next to it
  if (!s.doorOpen && atLockedDoor(s) && mask & Input.GRAB && s.air === 0) {
    if (setup.raider.head === "Rage Horns") {
      s.doorOpen = true;
      s.events.push({ t: s.t, type: "door", by: "Rage Horns" });
    } else {
      s.doorWork += 1;
      const need = setup.raider.head === "Lockpick" ? LOCKPICK_DOOR_TICKS : DOOR_TICKS;
      if (s.doorWork >= need) {
        s.doorOpen = true;
        s.events.push({ t: s.t, type: "door", by: setup.raider.head === "Lockpick" ? "Lockpick" : "pick" });
      }
    }
    return;
  }

  s.x += dir * speedOf(s, setup);

  const col = colOf(s.room);
  if (s.x > ROOM_W) {
    const blocked = s.room === LOCKED_DOOR.left && !s.doorOpen;
    if (col < COLS - 1 && !blocked) {
      s.room += 1;
      s.x = 0;
      s.events.push({ t: s.t, type: "room", room: s.room, via: "walk" });
    } else s.x = ROOM_W;
  } else if (s.x < 0) {
    const blocked = s.room === LOCKED_DOOR.right && !s.doorOpen;
    if (col > 0 && !blocked) {
      s.room -= 1;
      s.x = ROOM_W;
      s.events.push({ t: s.t, type: "room", room: s.room, via: "walk" });
    } else s.x = 0;
  }

  const atVault = s.room === VAULT_ROOM && s.x >= VAULT_X - 40;
  if (atVault && s.lootBps === 0 && mask & Input.GRAB && s.air === 0) {
    s.grab += 1;
    const need = setup.raider.head === "Lockpick" ? LOCKPICK_GRAB_TICKS : GRAB_TICKS;
    if (s.grab >= need) {
      s.lootBps = FULL;
      s.events.push({ t: s.t, type: "grab" });
    }
  } else if (s.lootBps === 0) {
    s.grab = 0;
  }
}

function guard(s: RaidState, setup: RaidSetup): void {
  if (s.guardOut || s.room !== GUARD.room || s.guardCooldown > 0) return;
  if (setup.raider.body === "Disguise" && s.lootBps === 0) return; // looks like staff until it's carrying loot
  const gx = guardX(s.t);
  if (Math.abs(gx - s.x) > GUARD_REACH) return;
  s.events.push({ t: s.t, type: "caught" });
  s.guardCooldown = GUARD_COOLDOWN;
  s.stun = Math.max(s.stun, scaled(45, setup));
  s.hp -= 1;
  // thrown back the way it came
  s.x = Math.max(0, Math.min(ROOM_W, s.x + (s.x < gx ? -140 : 140)));
}

/** Armed traps in the current room, ordered by distance in the facing direction. */
function ahead(s: RaidState, range: number): number[] {
  return s.traps
    .map((tr, i) => ({ tr, i, d: (tr.x - s.x) * s.facing }))
    .filter(({ tr, d }) => tr.armed && tr.room === s.room && d >= 0 && d <= range)
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ i }) => i);
}

function reveal(s: RaidState, ids: number[], by: string): void {
  const fresh = ids.filter((i) => !s.traps[i]!.revealed);
  fresh.forEach((i) => (s.traps[i]!.revealed = true));
  s.events.push({ t: s.t, type: "reveal", traps: fresh, by });
}

function disarm(s: RaidState, i: number, by: string): void {
  s.traps[i]!.armed = false;
  s.traps[i]!.revealed = true;
  s.events.push({ t: s.t, type: "disarm", trap: i, by });
}

function scout(s: RaidState, setup: RaidSetup): void {
  if (s.scoutCharges <= 0) return;
  const kind = setup.raider.scout;
  const armed = s.traps.map((tr, i) => ({ tr, i })).filter(({ tr }) => tr.armed);
  switch (kind) {
    case "X-Ray":
      reveal(s, armed.filter(({ tr }) => tr.room === s.room).map(({ i }) => i), kind);
      break;
    case "Peek":
      reveal(s, armed.map(({ i }) => i), kind);
      break;
    case "Tear Sense":
      reveal(s, ahead(s, ROOM_W).slice(0, 1), kind);
      break;
    case "Laser Eyes": {
      const target = ahead(s, 320)[0];
      if (target === undefined) return; // no charge spent on a miss
      disarm(s, target, kind);
      break;
    }
    case "Wild Glance": {
      const hidden = armed.filter(({ tr }) => !tr.revealed).map(({ i }) => i);
      if (hidden.length === 0) return;
      const r = rng((setup.seed ^ s.t) >>> 0)();
      reveal(s, [hidden[r % hidden.length]!], kind);
      break;
    }
    case "Hunch":
      return;
  }
  s.scoutCharges -= 1;
}

function special(s: RaidState, setup: RaidSetup): void {
  const kind = setup.raider.special;
  if (!kind || s.specialUsed || kind === "Second Life") return;
  switch (kind) {
    case "Cut Wire": {
      const target = ahead(s, 160)[0];
      if (target === undefined) return;
      disarm(s, target, kind);
      break;
    }
    case "Pet Scout": {
      const target = ahead(s, ROOM_W)[0];
      if (target === undefined) return;
      disarm(s, target, kind);
      break;
    }
    case "Decoy Coin": {
      if (s.room === GUARD.room && !s.guardOut) {
        s.guardCooldown = 180; // guard goes after the coin
        break;
      }
      const target = ahead(s, 320).find((i) => s.traps[i]!.kind === "Bait Coin");
      if (target === undefined) return;
      disarm(s, target, kind);
      break;
    }
    case "Stink Bomb":
      if (s.room === GUARD.room && !s.guardOut) {
        s.guardOut = true;
        s.events.push({ t: s.t, type: "guard-out", by: kind });
      }
      s.traps.forEach((tr, i) => {
        if (tr.armed && tr.room === s.room && Math.abs(tr.x - s.x) <= 120) disarm(s, i, kind);
      });
      break;
    case "Pump":
      s.boost = 90;
      break;
    case "Smoke Bomb":
      s.alarmImmune = true;
      break;
    case "Dump":
      return; // defender-side gadget
  }
  s.specialUsed = true;
  s.events.push({ t: s.t, type: "special", kind });
}

function hunch(s: RaidState, setup: RaidSetup): void {
  if (setup.raider.scout !== "Hunch") return;
  s.traps.forEach((tr, i) => {
    if (tr.armed && !tr.revealed && !tr.hunched && tr.room === s.room && Math.abs(tr.x - s.x) <= 120) {
      tr.hunched = true;
      s.events.push({ t: s.t, type: "hunch", trap: i });
    }
  });
}

function triggerTraps(s: RaidState, setup: RaidSetup): void {
  const { raider } = setup;
  s.traps.forEach((tr, i) => {
    if (!tr.armed || tr.room !== s.room || Math.abs(tr.x - s.x) > TRAP_REACH) return;
    tr.armed = false;
    tr.revealed = true;

    if (raider.head === "Guard" && !s.guardUsed) {
      s.guardUsed = true;
      s.events.push({ t: s.t, type: "blocked", trap: i, by: "Guard" });
      return;
    }
    if (raider.body === "Costume Immunity" && tr.kind === "Slick Floor") {
      s.events.push({ t: s.t, type: "blocked", trap: i, by: "Costume Immunity" });
      return;
    }
    if (raider.head === "Brim Shade" && tr.kind === "Jack-in-the-Box") {
      s.events.push({ t: s.t, type: "blocked", trap: i, by: "Brim Shade" });
      return;
    }
    if (s.alarmImmune && tr.kind === "Crybaby Alarm") {
      s.events.push({ t: s.t, type: "blocked", trap: i, by: "Smoke Bomb" });
      return;
    }

    s.events.push({ t: s.t, type: "trap", trap: i, kind: tr.kind });
    const stun = (ticks: number) => {
      const t = scaled(ticks, setup);
      s.stun = Math.max(s.stun, raider.body === "Escape Artist" ? Math.floor(t / 2) : t);
    };
    switch (tr.kind) {
      case "Tripwire":
        stun(30);
        s.hp -= 1;
        break;
      case "Gum Snare":
        stun(60);
        break;
      case "Spring Plate":
        s.x = Math.max(40, s.x - s.facing * 260);
        s.x = Math.min(ROOM_W - 40, s.x);
        s.events.push({ t: s.t, type: "room", room: s.room, via: "spring" });
        break;
      case "Slick Floor": {
        stun(15);
        if (s.lootBps > 0) {
          const keep = raider.aura === "Luck" ? 8_500 : 7_000;
          s.lootBps = Math.floor((s.lootBps * keep) / FULL);
          s.events.push({ t: s.t, type: "drop", lootBps: s.lootBps });
        }
        break;
      }
      case "Bait Coin":
        stun(30);
        s.hp -= 1;
        break;
      case "Chomper":
        stun(45);
        s.hp -= 2;
        break;
      case "Crybaby Alarm":
        s.timeLeft -= scaled(240, setup);
        break;
      case "Jack-in-the-Box":
        s.invert = scaled(90, setup);
        break;
    }
  });
}

// --------------------------------------------------------------------- run

/** Replay a full raid from its input log. Used by the referee to verify results. */
export function simulateRaid(setup: RaidSetup, inputs: InputLog): RaidOutcome {
  const s = createRaid(setup);
  let idx = 0;
  let mask = 0;
  let last = -1;
  for (const [t, m] of inputs) {
    if (!Number.isInteger(t) || t <= last) throw new Error("input log ticks must be increasing integers");
    if (!Number.isInteger(m) || m < 0 || m > INPUT_MASK_MAX) throw new Error("bad input mask");
    last = t;
  }
  while (!s.result) {
    while (idx < inputs.length && inputs[idx]![0] <= s.t) mask = inputs[idx++]![1];
    step(s, setup, mask);
  }
  return { result: s.result, lootBps: s.lootBps, ticks: s.t, hp: s.hp, events: s.events };
}
