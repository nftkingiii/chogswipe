// A simple autopilot that plays a raid on any floor plan: it finds a route to the vault through the
// rooms (walking, stairs, launch pads, portals, vents if it has the hat, the locked door if it must),
// grabs the loot, then routes back out of the front door. Used for demos and tests; players send their own inputs.
import { COLS, ENTRY_ROOM, HOUSE_PLAN, LINK_REACH, ROOMS, ROOM_W, colOf, vaultOnRight, type FloorPlan, type Link } from "./map.js";
import { DOOR_STOP, GUARD_SIGHT, Input, type RaidState } from "./raid.js";

/** House-plan routes kept for tests: through the guarded kitchen, or upstairs through the locked door. */
export type Route = "kitchen" | "upstairs";

export interface BotOptions {
  plan?: FloorPlan;
  route?: Route;
  /** jump every armed trap, even unrevealed ones (tests); otherwise only revealed ones */
  seeTraps?: boolean;
  /** use the scout gadget on entering each room */
  scout?: boolean;
  /** the raider has the Vent Crawl hat */
  vents?: boolean;
}

type Hop =
  | { kind: "walk"; to: number; dir: 1 | -1 }
  | { kind: "door"; to: number; dir: 1 | -1 }
  | { kind: "link"; to: number; at: number; key: number; link: Link };

/** Every way out of a room, with a cost. */
function hops(plan: FloorPlan, room: number, doorOpen: boolean, opts: BotOptions): (Hop & { cost: number })[] {
  const out: (Hop & { cost: number })[] = [];
  const d = plan.lockedDoor;
  const guarded = (r: number) => plan.guards.some((g) => g.room === r);
  // the bot can't sneak past a flier reliably, so it takes the long way round when there is one
  const flier = (r: number) => plan.guards.some((g) => g.room === r && g.flies);
  const enter = (r: number) => 1 + (opts.route === "upstairs" && guarded(r) ? 10 : 0) + (flier(r) ? 20 : 0);
  for (const dir of [1, -1] as const) {
    const col = colOf(room) + dir;
    if (col < 0 || col >= COLS) continue;
    const to = room + dir;
    const locked = !!d && !doorOpen && ((dir === 1 && d.left === room) || (dir === -1 && d.right === room));
    if (locked) out.push({ kind: "door", to, dir, cost: enter(to) + 2 + (opts.route === "kitchen" ? 10 : 0) });
    else out.push({ kind: "walk", to, dir, cost: enter(to) });
  }
  for (const l of plan.links) {
    if (l.kind === "vent" && !opts.vents) continue;
    if (l.a.room === room) out.push({ kind: "link", to: l.b.room, at: l.a.x, key: Input.UP, link: l, cost: enter(l.b.room) });
    if (l.b.room === room && l.kind !== "launch") out.push({ kind: "link", to: l.a.room, at: l.b.x, key: l.kind === "portal" ? Input.UP : Input.DOWN, link: l, cost: enter(l.a.room) });
  }
  return out;
}

/** Cheapest first hop from room `from` towards room `goal` (Dijkstra over six rooms). */
function firstHop(plan: FloorPlan, from: number, goal: number, doorOpen: boolean, opts: BotOptions): Hop | null {
  if (from === goal) return null;
  const dist = new Array<number>(ROOMS).fill(Infinity);
  const first = new Array<Hop | null>(ROOMS).fill(null);
  const done = new Array<boolean>(ROOMS).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let r = 0; r < ROOMS; r++) if (!done[r] && dist[r]! < Infinity && (u < 0 || dist[r]! < dist[u]!)) u = r;
    if (u < 0) return null;
    if (u === goal) return first[goal]!;
    done[u] = true;
    for (const h of hops(plan, u, doorOpen, opts)) {
      const nd = dist[u]! + h.cost;
      if (nd < dist[h.to]!) {
        dist[h.to] = nd;
        first[h.to] = u === from ? h : first[u]!;
      }
    }
  }
}

export function makeBot(opts: BotOptions = {}) {
  const plan = opts.plan ?? HOUSE_PLAN;
  let scoutedRoom = -1;

  return (s: RaidState): number => {
    if (s.climb || s.result) return 0;
    let mask = 0;
    if (opts.scout && scoutedRoom !== s.room) {
      scoutedRoom = s.room;
      if (!(s.prevMask & Input.SCOUT)) mask |= Input.SCOUT;
    }

    const goal = s.lootBps > 0 ? { room: ENTRY_ROOM, x: 0 } : plan.vault;
    let targetX: number;
    let action = 0;
    if (s.room === goal.room) {
      targetX = goal.x;
      if (s.lootBps === 0) {
        const there = vaultOnRight(plan) ? s.x >= goal.x - 30 : s.x <= goal.x + 30;
        if (there) return mask | Input.GRAB;
      }
    } else {
      const hop = firstHop(plan, s.room, goal.room, s.doorOpen, opts);
      if (!hop) return mask;
      if (hop.kind === "walk") targetX = hop.dir > 0 ? ROOM_W + 50 : -50;
      else if (hop.kind === "door") {
        targetX = hop.dir > 0 ? ROOM_W - DOOR_STOP : DOOR_STOP;
        if (Math.abs(s.x - targetX) <= 10) return mask | Input.GRAB;
      } else {
        targetX = hop.at;
        if (Math.abs(s.x - hop.at) <= LINK_REACH - 4 && s.air === 0) return mask | (s.prevMask & hop.key ? 0 : hop.key); // fresh press each attempt
      }
    }
    let dir = Math.sign(targetX - s.x) || 0;
    // a flying guard can't be jumped: back off while it faces this way, then sneak in behind it
    for (const [i, post] of plan.guards.entries()) {
      const st = s.guards[i]!;
      const gd = st.x - s.x;
      if (!post.flies || post.room !== s.room || st.out || s.guardCooldown > 0 || dir === 0 || gd * dir <= 0) continue;
      const facingUs = gd * st.dir < 0 || st.mode === "alert" || st.mode === "chase" || st.mode === "pause";
      if (facingUs) dir = Math.abs(gd) < GUARD_SIGHT + 40 ? -dir : 0;
    }
    if (dir === 0 && goal.room === s.room && goal.x === 0) mask |= Input.LEFT; // step out of the door
    if (dir > 0) mask |= Input.RIGHT;
    if (dir < 0) mask |= Input.LEFT;

    if (dir !== 0 && s.air === 0 && s.stun === 0 && !(s.prevMask & Input.JUMP)) {
      const near = s.traps.some(
        (t) => t.armed && (opts.seeTraps || t.revealed) && t.room === s.room && (t.x - s.x) * dir > 0 && (t.x - s.x) * dir <= 44,
      );
      // hop a walking guard when it's close ahead and facing this way (from behind, just tiptoe past)
      const g = plan.guards.some((post, i) => {
        const st = s.guards[i]!;
        const gd = st.x - s.x;
        return post.room === s.room && !post.flies && !st.out && s.guardCooldown === 0 && gd * dir > 0 && Math.abs(gd) <= 80 && (gd * st.dir < 0 || st.mode === "chase");
      });
      if (near || g) action |= Input.JUMP;
    }
    return mask | action;
  };
}

export { COLS };
