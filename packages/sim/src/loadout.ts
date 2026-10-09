// Chog traits -> Chogswipe gadgets. Canonical mapping; docs/gadgets.md describes it.

export type Tier = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export type TrapKind =
  | "Tripwire"
  | "Crybaby Alarm"
  | "Spring Plate"
  | "Slick Floor"
  | "Bait Coin"
  | "Gum Snare"
  | "Chomper"
  | "Jack-in-the-Box";

export type ScoutKind = "Hunch" | "X-Ray" | "Wild Glance" | "Laser Eyes" | "Tear Sense" | "Peek";

export type HeadKind =
  | "Guard"
  | "Rage Horns"
  | "Lockpick"
  | "Vent Crawl"
  | "Hex"
  | "Prank Card"
  | "Dash Band"
  | "Brim Shade";

export type BodyKind =
  | "Disguise"
  | "Armor Plate"
  | "Costume Immunity"
  | "Escape Artist"
  | "Blink"
  | "Sprint"
  | "Streaker";

export type SpecialKind =
  | "Cut Wire"
  | "Decoy Coin"
  | "Smoke Bomb"
  | "Pump"
  | "Dump"
  | "Pet Scout"
  | "Second Life"
  | "Stink Bomb";

export type AuraKind = "Burn" | "Chill" | "Ward" | "Fog" | "Zap" | "Luck";

export type Traits = Record<string, string | undefined>;

export interface TierStats {
  trapSlots: number;
  /** Gadget strength in percent: 100 = x1.00. */
  power: number;
  shieldHours: number;
  raidsPerDay: number;
}

export interface Loadout {
  tier: Tier;
  trap: TrapKind;
  scout: ScoutKind;
  head: HeadKind | null;
  body: BodyKind | null;
  special: SpecialKind | null;
  aura: AuraKind | null;
  entrySide: "Left" | "Right";
  stats: TierStats;
}

type Table<K> = ReadonlyArray<readonly [K, RegExp]>;

const TRAP: Table<TrapKind> = [
  ["Gum Snare", /bubblegum/i],
  ["Slick Floor", /puke|drool/i],
  ["Bait Coin", /coin|gold tooth/i],
  ["Jack-in-the-Box", /clown/i],
  ["Chomper", /lip bite|grit/i],
  ["Crybaby Alarm", /sad|worried|^wo$/i],
  ["Spring Plate", /smile|flat/i],
];

const SCOUT: Table<ScoutKind> = [
  ["Laser Eyes", /laser/i],
  ["X-Ray", /visor|vr|glass|thug|viper/i],
  ["Peek", /side eye|smirk/i],
  ["Tear Sense", /cry|tear/i],
  ["Wild Glance", /dead|xd|retard|clown|mog|frog|vertical|angry|up/i],
];

const HEAD: Table<HeadKind> = [
  ["Guard", /helmet|crown|wreath|thorn|seal|diamond/i],
  ["Rage Horns", /horn/i],
  ["Lockpick", /robber|mafia/i],
  ["Vent Crawl", /plumber/i],
  ["Hex", /wizard|beanie|3rd eye|shroom/i],
  ["Prank Card", /clown nose|wig|banana|8 ball/i],
  ["Dash Band", /band|durag|wrap|bandana/i],
  ["Brim Shade", /cap|hat|mcga|chog|bob hair|neet|laser/i],
];

const BODY: Table<BodyKind> = [
  ["Disguise", /tuxedo|suit|vest|mafia/i],
  ["Armor Plate", /armor|astro|sci fi|army/i],
  ["Costume Immunity", /shark|dragon|banana|duck|toad|mummy/i],
  ["Escape Artist", /inmate|prisoner|stripe/i],
  ["Blink", /robe|wizard|jesus|yukata|chinese|cape|gojo|guko/i],
  [
    "Sprint",
    /track|hoodie|jersey|tank|sleeveless|tee|shirt|jacket|polo|six seven|chug|cwo|milf|virgin|thots|bbc|boner|homeless/i,
  ],
];

const ACCESSORY: Readonly<Record<string, SpecialKind>> = {
  Knife: "Cut Wire",
  Coin: "Decoy Coin",
  Cigar: "Smoke Bomb",
  "Green Candle": "Pump",
  "Red Candle": "Dump",
  Fwog: "Pet Scout",
  PEPE: "Pet Scout",
  Heart: "Second Life",
  SB: "Stink Bomb",
};

const AURA: Table<AuraKind> = [
  ["Burn", /fire|burning/i],
  ["Chill", /aqua|cool|mint|wind/i],
  ["Ward", /royal|purple|violet/i],
  ["Fog", /smoke|mist/i],
  ["Zap", /electric/i],
  ["Luck", /./],
];

export const TIER_STATS: Readonly<Record<Tier, TierStats>> = {
  Common: { trapSlots: 3, power: 100, shieldHours: 4, raidsPerDay: 3 },
  Uncommon: { trapSlots: 4, power: 115, shieldHours: 5, raidsPerDay: 3 },
  Rare: { trapSlots: 5, power: 130, shieldHours: 6, raidsPerDay: 4 },
  Epic: { trapSlots: 6, power: 150, shieldHours: 7, raidsPerDay: 4 },
  Legendary: { trapSlots: 7, power: 175, shieldHours: 8, raidsPerDay: 5 },
};

function pick<K>(table: Table<K>, value: string | undefined): K | null {
  if (value === undefined) return null;
  for (const [name, rx] of table) if (rx.test(value)) return name;
  return null;
}

function isTier(v: string | undefined): v is Tier {
  return v !== undefined && v in TIER_STATS;
}

export function loadoutFor(traits: Traits): Loadout {
  const tier: Tier = isTier(traits.Tier) ? traits.Tier : "Common";
  return {
    tier,
    trap: pick(TRAP, traits.Mouth) ?? "Tripwire",
    scout: pick(SCOUT, traits.Eyes) ?? "Hunch",
    head: pick(HEAD, traits.Head),
    body: traits.Naked === "Yes" ? "Streaker" : pick(BODY, traits.Body),
    special: (traits.Accessory && ACCESSORY[traits.Accessory]) || null,
    aura: pick(AURA, traits.Aura),
    entrySide: traits.Side === "Right" ? "Right" : "Left",
    stats: TIER_STATS[tier],
  };
}
