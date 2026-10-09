import { readFileSync } from "node:fs";
import { HOUSE_BASE, LOCATIONS, loadoutFor, type Loadout, type TrapPlacement, type Traits } from "@chogswipe/sim";

export const MAX_CHOG_ID = 1969;
export { HOUSE_BASE };

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

/** House hideouts are the lore locations: treasury-funded vaults so there is always something to raid. */
const HOUSES: Record<number, { name: string; traits: Traits; traps: TrapPlacement[] }> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, { name: l.name, traits: l.traits, traps: l.traps }]),
);

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
