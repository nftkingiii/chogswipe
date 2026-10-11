// Preset heists drawn from Monad / Chog community lore. Each is a house
// hideout funded by the game treasury, so there is always something to raid.
// Lore sources are community-made (Monadverse, Encyclopedia Monadia, Monad Daily);
// see docs/locations.md.
import type { Traits } from "./loadout.js";
import type { TrapPlacement } from "./raid.js";
import { HOUSE_PLAN, ROOM_W, type FloorPlan } from "./map.js";

export interface Location {
  id: number; // vault id on chain: HOUSE_BASE + index
  slug: string;
  name: string;
  blurb: string;
  traits: Traits; // the defender loadout: trap type, tier power, aura
  traps: TrapPlacement[];
  rooms: [string, string, string, string, string, string];
  loot: string; // what sits in the vault
  unlockAfter: string | null;
  /** who patrols: a Fwog bouncer or the location's monanimal */
  guard: "fwog" | "molandak" | "moyaki" | "mouch" | "salmonad" | "mongrod";
  /** the floor plan: stairs, vault, locked door, guard posts, hazards, clock */
  plan: FloorPlan;
  /** one line on what makes this heist different, shown on the heist card */
  twist: string;
}

const R = ROOM_W - 80; // vault against the right wall
const L = 80; // vault against the left wall

// Each heist has its own floor plan and one twist (see the map at the top of map.ts for room numbers).
const PLANS = {
  // the tutorial: the classic house, with a slow guard
  fwog: { ...HOUSE_PLAN, guards: [{ room: 2, x0: 320, x1: 780, speed: 2 }] },
  // the vault is downstairs behind a locked door: pick the lock, or loop upstairs past the guard and down the back stairs
  rayj: {
    links: [
      { kind: "stairs", a: { room: 0, x: 820 }, b: { room: 3, x: 440 } },
      { kind: "stairs", a: { room: 2, x: 160 }, b: { room: 5, x: 540 } },
    ],
    lockedDoor: { left: 1, right: 2 },
    vault: { room: 2, x: R },
    guards: [{ room: 4, x0: 240, x1: 720, speed: 3 }],
    hazards: [],
    seconds: 120,
  },
  // the recipe safe is upstairs on the left, past steam vents and a locked door
  moyaki: {
    links: [
      { kind: "stairs", a: { room: 2, x: 160 }, b: { room: 5, x: 540 } },
      { kind: "vent", a: { room: 1, x: 480 }, b: { room: 4, x: 480 } },
    ],
    lockedDoor: { left: 3, right: 4 },
    vault: { room: 3, x: L },
    guards: [{ room: 2, x0: 320, x1: 780, speed: 3 }],
    hazards: [{ kind: "steam", room: 4, x0: 560, x1: 860, period: 96, on: 36, offset: 0 }],
    seconds: 120,
  },
  // a launch pad straight up to the vault, guarded by a flier you can't jump; the only way down is the far stairs
  mouch: {
    links: [
      { kind: "stairs", a: { room: 0, x: 820 }, b: { room: 3, x: 440 } },
      { kind: "launch", a: { room: 2, x: 720 }, b: { room: 5, x: 600 } },
    ],
    lockedDoor: null,
    vault: { room: 5, x: R },
    guards: [{ room: 2, x0: 260, x1: 640, speed: 4, flies: true }],
    hazards: [],
    seconds: 120,
  },
  // the river runs through the riverbank and the shallows: wading is slow
  salmonad: {
    links: [{ kind: "stairs", a: { room: 0, x: 820 }, b: { room: 3, x: 440 } }],
    lockedDoor: null,
    vault: { room: 5, x: R },
    guards: [{ room: 4, x0: 240, x1: 720, speed: 3 }],
    hazards: [
      { kind: "water", room: 0, x0: 120, x1: 440 },
      { kind: "water", room: 3, x0: 650, x1: 960 },
    ],
    seconds: 120,
  },
  // a portal from the clock hall straight into the time vault, past a fast guard; the clock runs short
  molandak: {
    links: [
      { kind: "portal", a: { room: 0, x: 240 }, b: { room: 5, x: 220 } },
      { kind: "stairs", a: { room: 2, x: 160 }, b: { room: 5, x: 540 } },
    ],
    lockedDoor: null,
    vault: { room: 5, x: R },
    guards: [{ room: 5, x0: 380, x1: 640, speed: 4 }],
    hazards: [],
    seconds: 90,
  },
  // two routes, two guards, one locked door
  mongrod: {
    links: [
      { kind: "stairs", a: { room: 0, x: 820 }, b: { room: 3, x: 440 } },
      { kind: "stairs", a: { room: 2, x: 160 }, b: { room: 5, x: 540 } },
    ],
    lockedDoor: { left: 4, right: 5 },
    vault: { room: 5, x: R },
    guards: [
      { room: 1, x0: 240, x1: 720, speed: 4 },
      { room: 4, x0: 200, x1: 620, speed: 4 },
    ],
    hazards: [],
    seconds: 120,
  },
} satisfies Record<string, FloorPlan>;

export const HOUSE_BASE = 1_000_000;

export const LOCATIONS: Location[] = [
  {
    id: HOUSE_BASE,
    slug: "fwog-pond",
    name: "The Fwog Pond",
    blurb: "Chog's dad was a frog, apparently. Nobody knows how that works. His pond is the easiest place to learn the ropes.",
    traits: { Tier: "Uncommon", Mouth: "Bubblegum", Eyes: "Happy", Aura: "Mint", Background: "Aqua Mint" },
    traps: [
      { room: 0, x: 420, kind: "Tripwire" },
      { room: 1, x: 760, kind: "Gum Snare" },
      { room: 4, x: 640, kind: "Tripwire" },
      { room: 5, x: 300, kind: "Gum Snare" },
    ],
    rooms: ["Lily Lounge", "Reed Library", "Fly Kitchen", "Toad's Study", "Lily-Pad Bed", "Savings Pond"],
    loot: "Toad's lily-pad savings",
    unlockAfter: null,
    guard: "fwog",
    plan: PLANS.fwog,
    twist: "The classic house. A slow guard, a locked door upstairs, and a vent if you've got the hat.",
  },
  {
    id: HOUSE_BASE + 1,
    slug: "rayj-studio",
    name: "RayJ's Studio",
    blurb: "Where Chog was born from an AI glitch. RayJ insists his name is Monald. The original sketch is still in the safe.",
    traits: { Tier: "Uncommon", Mouth: "Smile", Eyes: "Happy", Background: "Soft Lavender" },
    traps: [
      { room: 0, x: 360, kind: "Spring Plate" },
      { room: 1, x: 560, kind: "Tripwire" },
      { room: 4, x: 820, kind: "Spring Plate" },
      { room: 2, x: 520, kind: "Tripwire" },
    ],
    rooms: ["Gallery", "Sketch Room", "Snack Bar Safe", "Glitch Lab", "Ink Room", "Spotlight Loft"],
    loot: "RayJ's original Chog sketch",
    unlockAfter: "fwog-pond",
    guard: "fwog",
    plan: PLANS.rayj,
    twist: "The safe is downstairs behind a locked door. Pick the lock, or loop upstairs past the guard and down the back stairs.",
  },
  {
    id: HOUSE_BASE + 2,
    slug: "moyaki-bakery",
    name: "Moyaki's Bakery",
    blurb: "The bread-like cook of the Monadverse keeps the floors buttered. Slip up and you drop the loot.",
    traits: { Tier: "Rare", Mouth: "Drooling", Eyes: "Round", Aura: "Fire", Background: "Peach Pink" },
    traps: [
      { room: 0, x: 380, kind: "Slick Floor" },
      { room: 1, x: 700, kind: "Slick Floor" },
      { room: 2, x: 620, kind: "Tripwire" },
      { room: 5, x: 760, kind: "Slick Floor" },
      { room: 4, x: 300, kind: "Slick Floor" },
    ],
    rooms: ["Shopfront", "Flour Store", "Ovens", "Recipe Pantry", "Proving Room", "Decoy Safe"],
    loot: "Venty's secret dough recipe",
    unlockAfter: "rayj-studio",
    guard: "moyaki",
    plan: PLANS.moyaki,
    twist: "The recipe is upstairs on the left. Steam vents blast in the Proving Room: cross between bursts.",
  },
  {
    id: HOUSE_BASE + 3,
    slug: "mouch-nest",
    name: "Mouch's Prank Nest",
    blurb: "The fastest prankster in the jungle, famous for tying leaves to Chog's tail. Everything here is a trick.",
    traits: { Tier: "Rare", Mouth: "Clown Mouth", Eyes: "Clown Eye", Aura: "Wind", Background: "Lime Green" },
    traps: [
      { room: 0, x: 420, kind: "Jack-in-the-Box" },
      { room: 1, x: 500, kind: "Tripwire" },
      { room: 3, x: 760, kind: "Jack-in-the-Box" },
      { room: 4, x: 480, kind: "Jack-in-the-Box" },
      { room: 5, x: 400, kind: "Tripwire" },
    ],
    rooms: ["Leaf Pile", "Spider Larder", "Launch Pad", "Web Loft", "Tail-Wing Shop", "Prank Vault"],
    loot: "PingPing's jar of stolen leaves",
    unlockAfter: "moyaki-bakery",
    guard: "mouch",
    plan: PLANS.mouch,
    twist: "A launch pad shoots you straight up to the vault, but Mouch flies: you can't jump him. The only way back down is the far stairs.",
  },
  {
    id: HOUSE_BASE + 4,
    slug: "salmonad-shrine",
    name: "Salmonad's River Shrine",
    blurb: "Nobody knows where the purple prophet came from. Somebody asked \"what about salmonad?\" and the alarms never stopped.",
    traits: { Tier: "Epic", Mouth: "Sad", Eyes: "Teary", Aura: "Aqua Aura", Background: "Deep Aqua" },
    traps: [
      { room: 0, x: 560, kind: "Crybaby Alarm" },
      { room: 3, x: 300, kind: "Tripwire" },
      { room: 3, x: 620, kind: "Crybaby Alarm" },
      { room: 4, x: 820, kind: "Crybaby Alarm" },
      { room: 5, x: 420, kind: "Tripwire" },
      { room: 1, x: 600, kind: "Crybaby Alarm" },
    ],
    rooms: ["Riverbank", "Posting Hall", "Altar", "Shallows", "Prophet's Den", "Shrine"],
    loot: "Benja's first salmonpost",
    unlockAfter: "mouch-nest",
    guard: "salmonad",
    plan: PLANS.salmonad,
    twist: "The river runs through the hideout. Wading slows you down, and every alarm eats your clock.",
  },
  {
    id: HOUSE_BASE + 5,
    slug: "molandak-lab",
    name: "Molandak's Time Lab",
    blurb: "The first monanimal is a time traveller who was never really created. His lab bites back.",
    traits: { Tier: "Epic", Mouth: "Grit", Eyes: "Gradient visor", Aura: "Royal Blue Aura", Background: "Deep Blue" },
    traps: [
      { room: 0, x: 560, kind: "Chomper" },
      { room: 1, x: 400, kind: "Tripwire" },
      { room: 1, x: 760, kind: "Chomper" },
      { room: 2, x: 620, kind: "Tripwire" },
      { room: 5, x: 420, kind: "Chomper" },
      { room: 5, x: 700, kind: "Tripwire" },
    ],
    rooms: ["Clock Hall", "Paradox Archive", "Engine Room", "Future Wing", "Past Wing", "Time Vault"],
    loot: "PingPing's paradox in a jar",
    unlockAfter: "salmonad-shrine",
    guard: "molandak",
    plan: PLANS.molandak,
    twist: "A portal in the Clock Hall jumps straight to the Time Vault, past a fast guard. Only 90 seconds on the clock.",
  },
  {
    id: HOUSE_BASE + 6,
    slug: "mongrod-citadel",
    name: "Mongrod's Citadel",
    blurb: "The cybernetic tyrant wants the Elder Tree. Swipe its heart before he does. Hardest heist in the jungle.",
    traits: { Tier: "Legendary", Mouth: "Lip Bite", Eyes: "fire laser", Aura: "Burning Aura", Background: "Blood Red" },
    traps: [
      { room: 0, x: 420, kind: "Chomper" },
      { room: 1, x: 860, kind: "Tripwire" },
      { room: 2, x: 600, kind: "Chomper" },
      { room: 3, x: 700, kind: "Chomper" },
      { room: 4, x: 800, kind: "Tripwire" },
      { room: 5, x: 320, kind: "Chomper" },
      { room: 1, x: 120, kind: "Chomper" },
    ],
    rooms: ["Gate", "Barracks", "Forge", "Elder Roots", "Throne Room", "Heart of the Tree"],
    loot: "the heart of the Elder Tree",
    unlockAfter: "molandak-lab",
    guard: "mongrod",
    plan: PLANS.mongrod,
    twist: "Two guards, two routes, a locked door. Pick your danger.",
  },
];

export function locationById(id: number): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}
