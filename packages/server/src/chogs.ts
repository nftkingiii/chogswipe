import { readFileSync } from "node:fs";
import { loadoutFor, type Loadout, type TrapPlacement, type Traits } from "@chogswipe/sim";

export const MAX_CHOG_ID = 1969;
export const HOUSE_BASE = 1_000_000;

const data = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../data/${name}`, import.meta.url), "utf8"));

const metadata: Record<string, Traits & { image?: string }> = data("chog-metadata.json").files;
const tokenToFile: Record<string, number> = data("token-files.json").tokenToFile;

export interface ChogInfo {
  id: number;
  name: string;
  image: string | null;
  traits: Traits;
  loadout: Loadout;
  house: boolean;
}

/** House hideouts: treasury-funded vaults so there is always something to raid. */
const HOUSES: Record<number, { name: string; traits: Traits; traps: TrapPlacement[] }> = {
  [HOUSE_BASE]: {
    name: "The Fwog Pond",
    traits: { Tier: "Uncommon", Mouth: "Bubblegum", Eyes: "Happy", Aura: "Mint", Background: "Aqua Mint" },
    traps: [
      { room: 0, x: 420, kind: "Tripwire" },
      { room: 1, x: 760, kind: "Gum Snare" },
      { room: 4, x: 640, kind: "Tripwire" },
      { room: 5, x: 520, kind: "Gum Snare" },
    ],
  },
};

export function isHouse(id: number): boolean {
  return id >= HOUSE_BASE;
}

export function houseIds(): number[] {
  return Object.keys(HOUSES).map(Number);
}

export function houseLayout(id: number): TrapPlacement[] | null {
  return HOUSES[id]?.traps ?? null;
}

export function chogInfo(id: number): ChogInfo | null {
  const house = HOUSES[id];
  if (house) return { id, name: house.name, image: null, traits: house.traits, loadout: loadoutFor(house.traits), house: true };
  const file = tokenToFile[String(id)];
  const meta = file === undefined ? undefined : metadata[String(file)];
  if (!meta) return null;
  const { image, ...traits } = meta;
  return {
    id,
    name: `Chog #${id}`,
    image: image ? `https://ipfs.filebase.io/ipfs/bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/${image}` : null,
    traits,
    loadout: loadoutFor(traits),
    house: false,
  };
}
