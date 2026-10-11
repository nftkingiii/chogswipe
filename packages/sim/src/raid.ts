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
export const CLIMB_TICKS = 40;
const VENT_TICKS = 36;
const DOOR_TICKS = 90;
const LOCKPICK_DOOR_TICKS = 30;
const GUARD_REACH = 40;
const GUARD_COOLDOWN = 90;
/** How far ahead the guard can see, how long it stares before giving chase, and how long it chases. */
export const GUARD_SIGHT = 260;
const GUARD_ALERT_TICKS = 14;
const GUARD_CHASE_SPEED = 6;
const GUARD_CHASE_TICKS = 120;
const GUARD_TURN_TICKS = 12;
/** At each end of its beat the guard stops and looks around: the moment to slip past. */
const GUARD_PAUSE_TICKS = 24;
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
  | { t: number; type: "spotted" }
  | { t: number; type: "lost" }
  | { t: number; type: "guard-out"; by: string }
  | { t: number; type: "grab" }
  | { t: number; type: "drop"; lootBps: number }
  | { t: number; type: "second-life" }
  | { t: number; type: "special"; kind: string }
  | { t: number; type: "end"; result: RaidResultKind };

export type RaidResultKind = "escaped" | "knocked-out" | "caught" | "timeout";

export type GuardMode = "patrol" | "pause" | "alert" | "chase" | "return";

export interface GuardState {
  x: number;
  dir: 1 | -1;
  mode: GuardMode;
  /** ticks left in the current pause, alert or chase */
  timer: number;
}

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
  guard: GuardState;
  blinkCooldown: number;
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

export function initialGuard(): GuardState {
  return { x: GUARD.x0, dir: 1, mode: "patrol", timer: 0 };
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
    guard: initialGuard(),
    blinkCooldown: 0,
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
  if (s.blinkCooldown > 0) s.blinkCooldown -= 1;

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

  moveGuard(s, setup);
  if (!s.climb && s.air === 0) {
    hunch(s, setup);
    triggerTraps(s, setup);
  }
  if (catchRaider(s, setup)) return;

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

/** A closed locked door stops the raider this far from the wall, so it stands in front of it. */
export const DOOR_STOP = 90;

function atLockedDoor(s: RaidState): boolean {
  return (s.room === LOCKED_DOOR.left && s.x >= ROOM_W - DOOR_STOP - 20) || (s.room === LOCKED_DOOR.right && s.x <= DOOR_STOP + 20);
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
  if (!s.doorOpen) {
    if (s.room === LOCKED_DOOR.left) s.x = Math.min(s.x, ROOM_W - DOOR_STOP);
    if (s.room === LOCKED_DOOR.right) s.x = Math.max(s.x, DOOR_STOP);
  }

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

/** The guard ignores a raider in Disguise until it carries loot, and everyone while knocked out or distracted. */
function guardBlind(s: RaidState, setup: RaidSetup): boolean {
  return s.guardOut || s.guardCooldown > 0 || (setup.raider.body === "Disguise" && s.lootBps === 0);
}

/** The raider is in the guard's room, on the floor, where the guard could reach it. */
function inGuardRoom(s: RaidState): boolean {
  return s.room === GUARD.room && !s.climb;
}

/** Patrol the beat, pause at each end, spot raiders in front, chase them, then walk back. */
function moveGuard(s: RaidState, setup: RaidSetup): void {
  const g = s.guard;
  if (s.guardOut) return;
  const blind = guardBlind(s, setup);
  const ahead = inGuardRoom(s) && (s.x - g.x) * g.dir >= 0 && Math.abs(s.x - g.x) <= GUARD_SIGHT;
  if (!blind && ahead && (g.mode === "patrol" || g.mode === "pause" || g.mode === "return")) {
    g.mode = "alert";
    g.timer = GUARD_ALERT_TICKS;
    s.events.push({ t: s.t, type: "spotted" });
    return;
  }
  switch (g.mode) {
    case "patrol": {
      g.x += g.dir * GUARD.speed;
      if (g.x >= GUARD.x1 || g.x <= GUARD.x0) {
        g.x = Math.max(GUARD.x0, Math.min(GUARD.x1, g.x));
        g.mode = "pause";
        g.timer = GUARD_PAUSE_TICKS;
      }
      return;
    }
    case "pause":
      // looks back the way it came halfway through, then sets off
      if (--g.timer === Math.floor(GUARD_PAUSE_TICKS / 2)) g.dir = -g.dir as 1 | -1;
      if (g.timer <= 0) g.mode = "patrol";
      return;
    case "alert":
      if (--g.timer <= 0) {
        g.mode = "chase";
        g.timer = GUARD_CHASE_TICKS;
      }
      return;
    case "chase": {
      if (blind || !inGuardRoom(s) || --g.timer <= 0) {
        g.mode = "return";
        s.events.push({ t: s.t, type: "lost" });
        return;
      }
      if ((s.x - g.x) * g.dir < 0) {
        // the raider got past (jumped over or ducked behind): skid, turn round, then chase again
        g.dir = -g.dir as 1 | -1;
        g.mode = "alert";
        g.timer = GUARD_TURN_TICKS;
        return;
      }
      const step = Math.min(GUARD_CHASE_SPEED, Math.abs(s.x - g.x));
      g.x = Math.max(40, Math.min(ROOM_W - 40, g.x + g.dir * step));
      return;
    }
    case "return": {
      const home = Math.max(GUARD.x0, Math.min(GUARD.x1, g.x));
      if (home === g.x) {
        g.mode = "patrol";
        return;
      }
      g.dir = home > g.x ? 1 : -1;
      g.x += g.dir * Math.min(GUARD.speed, Math.abs(home - g.x));
      return;
    }
  }
}

/** Getting grabbed by the guard ends the raid. Second Life saves you once. */
function catchRaider(s: RaidState, setup: RaidSetup): boolean {
  const g = s.guard;
  if (guardBlind(s, setup) || !inGuardRoom(s) || s.air > 0) return false;
  const dx = s.x - g.x;
  if (Math.abs(dx) > GUARD_REACH) return false;
  // a chasing guard grabs; otherwise only a raider walking into its face. Overtaking its back slips by.
  const faceOn = dx * g.dir >= 0 && s.facing === -g.dir;
  if (g.mode !== "chase" && !faceOn) return false;
  s.events.push({ t: s.t, type: "caught" });
  if (setup.raider.special === "Second Life" && !s.secondLifeUsed) {
    s.secondLifeUsed = true;
    s.events.push({ t: s.t, type: "second-life" });
    s.guardCooldown = GUARD_COOLDOWN;
    s.stun = Math.max(s.stun, scaled(30, setup));
    s.x = Math.max(0, Math.min(ROOM_W, s.x + (dx < 0 ? -200 : 200)));
    g.mode = "return";
    return false;
  }
  end(s, "caught", 0);
  return true;
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

const BLINK_DIST = 220;
const BLINK_COOLDOWN = 150;

/** Blink (Body): a short teleport forward, on a cooldown. Stops at a closed locked door. */
function blink(s: RaidState): boolean {
  if (s.blinkCooldown > 0 || s.air > 0) return false;
  let x = s.x + s.facing * BLINK_DIST;
  if (!s.doorOpen && s.room === LOCKED_DOOR.left) x = Math.min(x, ROOM_W - DOOR_STOP);
  if (!s.doorOpen && s.room === LOCKED_DOOR.right) x = Math.max(x, DOOR_STOP);
  s.x = Math.max(0, Math.min(ROOM_W, x));
  s.blinkCooldown = BLINK_COOLDOWN;
  s.events.push({ t: s.t, type: "special", kind: "Blink" });
  return true;
}

function special(s: RaidState, setup: RaidSetup): void {
  // with no one-shot special to use, Blink bodies teleport instead
  if (setup.raider.body === "Blink" && (!setup.raider.special || s.specialUsed || setup.raider.special === "Second Life")) {
    blink(s);
    return;
  }
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
        s.guard.mode = "return";
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
    if (raider.head === "Prank Card" && (tr.kind === "Jack-in-the-Box" || tr.kind === "Spring Plate")) {
      s.events.push({ t: s.t, type: "blocked", trap: i, by: "Prank Card" });
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
