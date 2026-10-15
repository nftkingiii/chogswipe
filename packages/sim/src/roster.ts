// Demo roster: real Chog Genesis tokens chosen to show different traits.
// The live game loads the signed-in holder's Chogs from the referee instead. Shared with the server,
// which checks daily-heist runs against these same Chogs.
import type { Traits } from "./loadout.js";

export interface RosterChog {
  id: number;
  image: string;
  traits: Traits;
}

export const IMAGE_BASE = "https://ipfs.filebase.io/ipfs/bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/";

export const DEMO_ROSTER: RosterChog[] = [
  {
    "id": 1,
    "image": "1462.webp",
    "traits": {
      "Background": "Deep Aqua",
      "Base": "Origin",
      "Skin": "Pink",
      "Side": "Left",
      "Body": "Yellow 143 Jersey",
      "Mouth": "Flat",
      "Eyes": "BTC Glass",
      "Head": "MCGA",
      "Accessory": "Fwog",
      "Form": "Chog",
      "Tier": "Uncommon",
      "Naked": "No"
    }
  },
  {
    "id": 1383,
    "image": "875.webp",
    "traits": {
      "Background": "Soft Lavender",
      "Base": "Origin",
      "Skin": "Red",
      "Side": "Right",
      "Body": "Red Chinese",
      "Mouth": "Worried",
      "Eyes": "Green laser",
      "Head": "Crown",
      "Form": "Chog",
      "Tier": "Common",
      "Naked": "No"
    }
  },
  {
    "id": 535,
    "image": "27.webp",
    "traits": {
      "Background": "Coral Pink",
      "Base": "Origin",
      "Skin": "Origin",
      "Side": "Right",
      "Body": "Fire Shirt",
      "Mouth": "Drooling",
      "Eyes": "Round Tear",
      "Head": "Spartan Helmet",
      "Form": "Chog",
      "Tier": "Common",
      "Naked": "No"
    }
  },
  {
    "id": 539,
    "image": "31.webp",
    "traits": {
      "Background": "Radioactive",
      "Aura": "Burning Aura",
      "Base": "Radioactive",
      "Skin": "Green",
      "Side": "Left",
      "Body": "Purple Shirt",
      "Eyes": "Green Round Eye",
      "Head": "Purple Horn",
      "Form": "Chog",
      "Tier": "Epic",
      "Naked": "No"
    }
  },
  {
    "id": 522,
    "image": "14.webp",
    "traits": {
      "Background": "Rosie",
      "Base": "Origin",
      "Skin": "Pink",
      "Side": "Right",
      "Eyes": "Purple laser",
      "Head": "Robber",
      "Form": "Chog",
      "Tier": "Common",
      "Naked": "No"
    }
  }
];
