// Preset heists drawn from Monad / Chog community lore. Each is a house
// hideout funded by the game treasury, so there is always something to raid.
// Lore sources are community-made (Monadverse, Encyclopedia Monadia, Monad Daily);
// see docs/locations.md.
import type { Traits } from "./loadout.js";
import type { TrapPlacement } from "./raid.js";

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
  /** who patrols the kitchen: a Fwog bouncer or the location's monanimal */
  guard: "fwog" | "molandak" | "moyaki" | "mouch" | "salmonad" | "mongrod";
}

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
      { room: 5, x: 520, kind: "Gum Snare" },
    ],
    rooms: ["Lounge", "Library", "Kitchen", "Study", "Bedroom", "Vault"],
    loot: "Dad's lily-pad savings",
    unlockAfter: null,
    guard: "fwog",
  },
  {
    id: HOUSE_BASE + 1,
    slug: "rayj-studio",
    name: "RayJ's Studio",
    blurb: "Where Chog was born from an AI glitch. RayJ insists his name is Monald. The original sketch is still in the safe.",
    traits: { Tier: "Uncommon", Mouth: "Smile", Eyes: "Happy", Background: "Soft Lavender" },
    traps: [
      { room: 0, x: 360, kind: "Spring Plate" },
      { room: 1, x: 300, kind: "Tripwire" },
      { room: 3, x: 420, kind: "Spring Plate" },
      { room: 5, x: 480, kind: "Tripwire" },
    ],
    rooms: ["Gallery", "Sketch Room", "Snack Bar", "Glitch Lab", "Ink Room", "Sketch Safe"],
    loot: "the original Chog sketch",
    unlockAfter: "fwog-pond",
    guard: "fwog",
  },
  {
    id: HOUSE_BASE + 2,
    slug: "moyaki-bakery",
    name: "Moyaki's Bakery",
    blurb: "The bread-like cook of the Monadverse keeps the floors buttered. Slip up and you drop the loot.",
    traits: { Tier: "Rare", Mouth: "Drooling", Eyes: "Round", Aura: "Fire", Background: "Peach Pink" },
    traps: [
      { room: 0, x: 380, kind: "Slick Floor" },
      { room: 1, x: 300, kind: "Slick Floor" },
      { room: 2, x: 620, kind: "Tripwire" },
      { room: 4, x: 300, kind: "Slick Floor" },
      { room: 5, x: 500, kind: "Slick Floor" },
    ],
    rooms: ["Shopfront", "Flour Store", "Ovens", "Pantry", "Proving Room", "Recipe Safe"],
    loot: "the secret dough recipe",
    unlockAfter: "rayj-studio",
    guard: "moyaki",
  },
  {
    id: HOUSE_BASE + 3,
    slug: "mouch-nest",
    name: "Mouch's Prank Nest",
    blurb: "The fastest prankster in the jungle, famous for tying leaves to Chog's tail. Everything here is a trick.",
    traits: { Tier: "Rare", Mouth: "Clown Mouth", Eyes: "Clown Eye", Aura: "Wind", Background: "Lime Green" },
    traps: [
      { room: 0, x: 440, kind: "Jack-in-the-Box" },
      { room: 1, x: 760, kind: "Tripwire" },
      { room: 3, x: 400, kind: "Jack-in-the-Box" },
      { room: 4, x: 640, kind: "Jack-in-the-Box" },
      { room: 5, x: 480, kind: "Tripwire" },
    ],
    rooms: ["Leaf Pile", "Spider Larder", "Launch Pad", "Web Loft", "Tail-Wing Shop", "Prank Vault"],
    loot: "a jar of stolen leaves",
    unlockAfter: "moyaki-bakery",
    guard: "mouch",
  },
  {
    id: HOUSE_BASE + 4,
    slug: "salmonad-shrine",
    name: "Salmonad's River Shrine",
    blurb: "Nobody knows where the purple prophet came from. Somebody asked \"what about salmonad?\" and the alarms never stopped.",
    traits: { Tier: "Epic", Mouth: "Sad", Eyes: "Teary", Aura: "Aqua Aura", Background: "Deep Aqua" },
    traps: [
      { room: 0, x: 420, kind: "Crybaby Alarm" },
      { room: 1, x: 300, kind: "Tripwire" },
      { room: 2, x: 620, kind: "Crybaby Alarm" },
      { room: 3, x: 400, kind: "Crybaby Alarm" },
      { room: 4, x: 640, kind: "Tripwire" },
      { room: 5, x: 500, kind: "Crybaby Alarm" },
    ],
    rooms: ["Riverbank", "Posting Hall", "Altar", "Shallows", "Prophet's Den", "Shrine"],
    loot: "the first salmonpost",
    unlockAfter: "mouch-nest",
    guard: "salmonad",
  },
  {
    id: HOUSE_BASE + 5,
    slug: "molandak-lab",
    name: "Molandak's Time Lab",
    blurb: "The first monanimal is a time traveller who was never really created. His lab bites back.",
    traits: { Tier: "Epic", Mouth: "Grit", Eyes: "Gradient visor", Aura: "Royal Blue Aura", Background: "Deep Blue" },
    traps: [
      { room: 0, x: 400, kind: "Chomper" },
      { room: 1, x: 760, kind: "Tripwire" },
      { room: 2, x: 620, kind: "Chomper" },
      { room: 3, x: 420, kind: "Tripwire" },
      { room: 4, x: 300, kind: "Chomper" },
      { room: 5, x: 500, kind: "Tripwire" },
    ],
    rooms: ["Clock Hall", "Paradox Archive", "Engine Room", "Future Wing", "Past Wing", "Time Vault"],
    loot: "a paradox in a jar",
    unlockAfter: "salmonad-shrine",
    guard: "molandak",
  },
  {
    id: HOUSE_BASE + 6,
    slug: "mongrod-citadel",
    name: "Mongrod's Citadel",
    blurb: "The cybernetic tyrant wants the Elder Tree. Swipe its heart before he does. Hardest heist in the jungle.",
    traits: { Tier: "Legendary", Mouth: "Lip Bite", Eyes: "fire laser", Aura: "Burning Aura", Background: "Blood Red" },
    traps: [
      { room: 0, x: 400, kind: "Chomper" },
      { room: 1, x: 300, kind: "Chomper" },
      { room: 1, x: 760, kind: "Tripwire" },
      { room: 2, x: 620, kind: "Chomper" },
      { room: 3, x: 420, kind: "Chomper" },
      { room: 4, x: 640, kind: "Tripwire" },
      { room: 5, x: 500, kind: "Chomper" },
    ],
    rooms: ["Gate", "Barracks", "Forge", "Elder Roots", "Throne Room", "Heart of the Tree"],
    loot: "the heart of the Elder Tree",
    unlockAfter: "molandak-lab",
    guard: "mongrod",
  },
];

export function locationById(id: number): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}
