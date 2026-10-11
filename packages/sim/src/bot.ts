// A simple autopilot that plays a raid by following a route of waypoints.
// Used for demos and tests; real players send their own inputs.
import { COLS, LINKS, LOCKED_DOOR, ROOM_W, VAULT_ROOM, VAULT_X, colOf, floorOf } from "./map.js";
import { GUARD } from "./map.js";
import { DOOR_STOP, Input, type RaidState } from "./raid.js";

const LOUNGE = LINKS[0]!;
const KITCHEN = LINKS[1]!;

type Step =
  | { go: [room: number, x: number] }
  | { climb: "up" | "down" }
  | { grab: "vault" | "door" };

export type Route = "kitchen" | "upstairs";

const ROUTES: Record<Route, Step[]> = {
  // straight through the guarded kitchen, up the back stairs to the vault
  kitchen: [
    { go: [KITCHEN.a.room, KITCHEN.a.x] },
    { climb: "up" },
    { go: [VAULT_ROOM, VAULT_X] },
    { grab: "vault" },
    { go: [KITCHEN.b.room, KITCHEN.b.x] },
    { climb: "down" },
    { go: [0, 0] },
  ],
  // up the lounge stairs, through the locked bedroom door
  upstairs: [
    { go: [LOUNGE.a.room, LOUNGE.a.x] },
    { climb: "up" },
    { go: [LOCKED_DOOR.left, ROOM_W - DOOR_STOP] },
    { grab: "door" },
    { go: [VAULT_ROOM, VAULT_X] },
    { grab: "vault" },
    { go: [LOCKED_DOOR.left, 300] },
    { go: [LOUNGE.b.room, LOUNGE.b.x] },
    { climb: "down" },
    { go: [0, 0] },
  ],
};

export interface BotOptions {
  route?: Route;
  /** jump every armed trap, even unrevealed ones (tests); otherwise only revealed ones */
  seeTraps?: boolean;
  /** use the scout gadget on entering each room */
  scout?: boolean;
}

export function makeBot(opts: BotOptions = {}) {
  const steps = ROUTES[opts.route ?? "kitchen"];
  let i = 0;
  let floorAtClimb = -1;
  let scoutedRoom = -1;

  return (s: RaidState): number => {
    if (s.climb) return 0;
    let step = steps[i];
    // advance past finished steps
    for (;;) {
      if (!step) return 0;
      if ("go" in step) {
        const [room, x] = step.go;
        const edge = x === 0 || x === ROOM_W;
        if (s.room === room && (edge ? s.x === x : Math.abs(s.x - x) <= 10)) step = steps[++i];
        else break;
      } else if ("climb" in step) {
        if (floorAtClimb !== -1 && floorOf(s.room) !== floorAtClimb) {
          floorAtClimb = -1;
          step = steps[++i];
        } else break;
      } else if (step.grab === "vault" ? s.lootBps > 0 : s.doorOpen) {
        step = steps[++i];
      } else break;
    }

    let mask = 0;
    if (opts.scout && scoutedRoom !== s.room) {
      scoutedRoom = s.room;
      if (!(s.prevMask & Input.SCOUT)) mask |= Input.SCOUT;
    }

    if ("climb" in step) {
      floorAtClimb = floorOf(s.room);
      const key = step.climb === "up" ? Input.UP : Input.DOWN;
      return mask | (s.prevMask & key ? 0 : key); // fresh press each attempt
    }
    if ("grab" in step) return mask | Input.GRAB;

    const [room, x] = step.go;
    let dir: number;
    if (s.room === room) dir = Math.sign(x - s.x);
    else dir = Math.sign(colOf(room) - colOf(s.room)) || (x > s.x ? 1 : -1);
    mask |= dir > 0 ? Input.RIGHT : Input.LEFT;

    if (s.air === 0 && s.stun === 0 && !(s.prevMask & Input.JUMP)) {
      const near = s.traps.some(
        (t) => t.armed && (opts.seeTraps || t.revealed) && t.room === s.room && (t.x - s.x) * dir > 0 && (t.x - s.x) * dir <= 44,
      );
      // hop the guard when it's close ahead and facing this way (from behind, just tiptoe past)
      const gd = s.guard.x - s.x;
      const g = s.room === GUARD.room && !s.guardOut && s.guardCooldown === 0 && gd * dir > 0 && Math.abs(gd) <= 80 && (gd * s.guard.dir < 0 || s.guard.mode === "chase");
      if (near || g) mask |= Input.JUMP;
    }
    return mask;
  };
}

export { COLS };
