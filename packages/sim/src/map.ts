// The hideout floor plan, shared by every hideout for now. Two floors of three
// rooms; rooms are numbered floor * COLS + col, so room 0 is the ground-floor
// entrance and room 5 is the upstairs vault.
//
//   floor 1:  [3 Study ] [4 Bedroom ]|[5 Vault  ]     | = locked door
//                 ║          ┆              ║          ║ = stairs, ┆ = vent
//   floor 0:  [0 Lounge] [1 Library ] [2 Kitchen]     guard patrols the kitchen

export const FLOORS = 2;
export const COLS = 3;
export const ROOMS = FLOORS * COLS;
export const ROOM_W = 960;
export const ENTRY_ROOM = 0;
export const VAULT_ROOM = 5;
export const VAULT_X = ROOM_W - 80;

export const ROOM_NAMES = ["Lounge", "Library", "Kitchen", "Study", "Bedroom", "Vault"] as const;

export interface Link {
  kind: "stairs" | "vent";
  /** lower end */
  a: { room: number; x: number };
  /** upper end */
  b: { room: number; x: number };
}

export const LINKS: readonly Link[] = [
  { kind: "stairs", a: { room: 0, x: 820 }, b: { room: 3, x: 820 } },
  { kind: "stairs", a: { room: 2, x: 180 }, b: { room: 5, x: 180 } },
  { kind: "vent", a: { room: 1, x: 480 }, b: { room: 4, x: 480 } },
];

/** Locked door on the wall between these two rooms (left room, right room). */
export const LOCKED_DOOR = { left: 4, right: 5 } as const;

export const GUARD = { room: 2, x0: 320, x1: 780, speed: 3 } as const;

export const LINK_REACH = 44;

export const floorOf = (room: number) => Math.floor(room / COLS);
export const colOf = (room: number) => room % COLS;

/** Spots where traps may not sit: link ends, the entrance, the vault and the locked door. */
export function blockedSpots(): { room: number; x: number; r: number }[] {
  const spots = [
    { room: ENTRY_ROOM, x: 0, r: 120 },
    { room: VAULT_ROOM, x: VAULT_X, r: 140 },
    { room: LOCKED_DOOR.left, x: ROOM_W, r: 120 },
    { room: LOCKED_DOOR.right, x: 0, r: 120 },
  ];
  for (const l of LINKS) {
    spots.push({ room: l.a.room, x: l.a.x, r: 90 }, { room: l.b.room, x: l.b.x, r: 90 });
  }
  return spots;
}
