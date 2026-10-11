// Hideout floor plans. Every hideout has two floors of three rooms; rooms are numbered
// floor * COLS + col, so room 0 is the ground-floor entrance (front door on its left wall).
// What changes between hideouts is the FloorPlan: where the stairs, vents, launch pads and
// portals are, which wall is locked, where the vault sits, who patrols, and what's in the way.
//
// The house plan (player hideouts and the Fwog Pond):
//   floor 1:  [3 Study ] [4 Bedroom ]|[5 Vault  ]     | = locked door
//                 ║          ┆              ║          ║ = stairs, ┆ = vent
//   floor 0:  [0 Lounge] [1 Library ] [2 Kitchen]     guard patrols the kitchen

export const FLOORS = 2;
export const COLS = 3;
export const ROOMS = FLOORS * COLS;
export const ROOM_W = 960;
export const ENTRY_ROOM = 0;

export const ROOM_NAMES = ["Lounge", "Library", "Kitchen", "Study", "Bedroom", "Vault"] as const;

export interface LinkEnd {
  room: number;
  x: number;
}

/**
 * stairs: diagonal flight inside one column, a = foot (ground floor), b = top landing.
 * vent: a duct in one column (needs the Vent Crawl hat).
 * launch: a spring pad, one way up from a to b.
 * portal: a time portal between any two rooms, both ways.
 */
export interface Link {
  kind: "stairs" | "vent" | "launch" | "portal";
  a: LinkEnd;
  b: LinkEnd;
}

export interface GuardPost {
  room: number;
  x0: number;
  x1: number;
  speed: number;
  /** a flying guard can't be jumped over: it grabs raiders in the air too */
  flies?: boolean;
}

export type Hazard =
  /** floor vents that blast steam for `on` ticks every `period` ticks: get caught on the floor in it and you're scalded */
  | { kind: "steam"; room: number; x0: number; x1: number; period: number; on: number; offset: number }
  /** knee-deep water: slows you down */
  | { kind: "water"; room: number; x0: number; x1: number };

export interface FloorPlan {
  links: readonly Link[];
  /** locked door on the wall between two neighbouring rooms on one floor (left room, right room) */
  lockedDoor: { left: number; right: number } | null;
  /** the vault stands against a side wall: x near 0 (left) or ROOM_W (right) */
  vault: LinkEnd;
  guards: readonly GuardPost[];
  hazards: readonly Hazard[];
  /** raid clock, seconds */
  seconds: number;
}

export const HOUSE_PLAN: FloorPlan = {
  links: [
    // stairs rise diagonally: the foot (a) and the top landing (b) sit at different x
    { kind: "stairs", a: { room: 0, x: 820 }, b: { room: 3, x: 440 } },
    { kind: "stairs", a: { room: 2, x: 160 }, b: { room: 5, x: 540 } },
    { kind: "vent", a: { room: 1, x: 480 }, b: { room: 4, x: 480 } },
  ],
  lockedDoor: { left: 4, right: 5 },
  vault: { room: 5, x: ROOM_W - 80 },
  guards: [{ room: 2, x0: 320, x1: 780, speed: 3 }],
  hazards: [],
  seconds: 120,
};

// The house plan under its old names, for player hideouts and the trap editor.
export const LINKS = HOUSE_PLAN.links;
export const LOCKED_DOOR = HOUSE_PLAN.lockedDoor!;
export const VAULT_ROOM = HOUSE_PLAN.vault.room;
export const VAULT_X = HOUSE_PLAN.vault.x;
export const GUARD = HOUSE_PLAN.guards[0]!;

export const LINK_REACH = 44;

export const floorOf = (room: number) => Math.floor(room / COLS);
export const colOf = (room: number) => room % COLS;

/** The vault is on the right wall when its x is past the middle of the room. */
export const vaultOnRight = (plan: FloorPlan) => plan.vault.x > ROOM_W / 2;

/** Spots where traps may not sit: link ends, the entrance, the vault and the locked door. */
export function blockedSpots(plan: FloorPlan = HOUSE_PLAN): { room: number; x: number; r: number }[] {
  const spots = [
    { room: ENTRY_ROOM, x: 0, r: 120 },
    { room: plan.vault.room, x: plan.vault.x, r: 140 },
  ];
  if (plan.lockedDoor) spots.push({ room: plan.lockedDoor.left, x: ROOM_W, r: 120 }, { room: plan.lockedDoor.right, x: 0, r: 120 });
  for (const l of plan.links) {
    spots.push({ room: l.a.room, x: l.a.x, r: 90 }, { room: l.b.room, x: l.b.x, r: 90 });
  }
  return spots;
}
