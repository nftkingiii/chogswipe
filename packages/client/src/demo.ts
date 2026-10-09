// Explicit demo fixture: Chog #1 raiding the house hideout. Clearly labelled
// in the HUD; the live game loads real loadouts from the referee instead.
import { loadoutFor, type RaidSetup } from "@chogswipe/sim";

export const DEMO_RAIDER = {
  id: 1,
  name: "Chog #1",
  traits: {
    Tier: "Uncommon",
    Skin: "Pink",
    Mouth: "Flat",
    Eyes: "BTC Glass",
    Head: "MCGA",
    Body: "Yellow 143 Jersey",
    Accessory: "Fwog",
    Side: "Left",
  },
};

export const DEMO_TARGET = {
  name: "The Fwog Pond",
  traits: { Tier: "Uncommon", Mouth: "Bubblegum", Eyes: "Happy", Aura: "Mint" },
  capChog: 2_000,
};

export function demoSetup(seed = 7): RaidSetup {
  return {
    seed,
    raider: loadoutFor(DEMO_RAIDER.traits),
    hideout: {
      defender: loadoutFor(DEMO_TARGET.traits),
      traps: [
        { room: 0, x: 420, kind: "Tripwire" },
        { room: 1, x: 760, kind: "Gum Snare" },
        { room: 4, x: 640, kind: "Tripwire" },
        { room: 5, x: 520, kind: "Gum Snare" },
      ],
    },
  };
}
