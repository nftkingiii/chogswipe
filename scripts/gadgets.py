"""Map Chog Genesis traits to Chogswipe gadgets and print coverage.

Usage: python scripts/gadgets.py  (reads data/chog-metadata.json)
"""
import json, re, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Each family: (gadget name, regex over the trait value). First match wins.
TRAP = [  # Mouth: what you plant in your hideout
    ("Gum Snare", r"bubblegum"),
    ("Slick Floor", r"puke|drool"),
    ("Bait Coin", r"coin|gold tooth"),
    ("Jack-in-the-Box", r"clown"),
    ("Chomper", r"lip bite|grit"),
    ("Crybaby Alarm", r"sad|worried|^wo$"),
    ("Spring Plate", r"smile|flat"),
]
SCOUT = [  # Eyes: how you see traps while raiding
    ("Laser Eyes", r"laser"),
    ("X-Ray", r"visor|vr|glass|thug|viper"),
    ("Peek", r"side eye|smirk"),
    ("Tear Sense", r"cry|tear"),
    ("Wild Glance", r"dead|xd|retard|clown|mog|frog|vertical|angry|up"),
    ("Hunch", r"."),
]
HEAD = [  # Head: defensive or utility perk
    ("Guard", r"helmet|crown|wreath|thorn|seal|diamond"),
    ("Rage Horns", r"horn"),
    ("Lockpick", r"robber|mafia"),
    ("Vent Crawl", r"plumber"),
    ("Hex", r"wizard|beanie|3rd eye|shroom"),
    ("Prank Card", r"clown nose|wig|banana|8 ball"),
    ("Dash Band", r"band|durag|wrap|bandana"),
    ("Brim Shade", r"cap|hat|mcga|chog|bob hair|neet|laser"),
]
BODY = [  # Body: movement or stealth
    ("Disguise", r"tuxedo|suit|vest|mafia"),
    ("Armor Plate", r"armor|astro|sci fi|army"),
    ("Costume Immunity", r"shark|dragon|banana|duck|toad|mummy"),
    ("Escape Artist", r"inmate|prisoner|stripe"),
    ("Blink", r"robe|wizard|jesus|yukata|chinese|cape|gojo|guko"),
    ("Sprint", r"track|hoodie|jersey|tank|sleeveless|tee|shirt|jacket|polo|six seven|chug|cwo|milf|virgin|thots|bbc|boner|homeless"),
]
ACCESSORY = {  # rare special gadget, one use per raid
    "Knife": "Cut Wire", "Coin": "Decoy Coin", "Cigar": "Smoke Bomb",
    "Green Candle": "Pump (speed burst)", "Red Candle": "Dump (slow raider)",
    "Fwog": "Pet Scout", "PEPE": "Pet Scout", "Heart": "Second Life", "SB": "Stink Bomb",
}
AURA = [  # passive hideout effect
    ("Burn", r"fire|burning"),
    ("Chill", r"aqua|cool|mint|wind"),
    ("Ward", r"royal|purple|violet"),
    ("Fog", r"smoke|mist"),
    ("Zap", r"electric"),
    ("Luck", r"."),
]
TIER = {  # rarity scales options and stakes, not invincibility
    "Common":    {"trap_slots": 3, "power": 1.00, "shield_h": 4, "raids_per_day": 3},
    "Uncommon":  {"trap_slots": 4, "power": 1.15, "shield_h": 5, "raids_per_day": 3},
    "Rare":      {"trap_slots": 5, "power": 1.30, "shield_h": 6, "raids_per_day": 4},
    "Epic":      {"trap_slots": 6, "power": 1.50, "shield_h": 7, "raids_per_day": 4},
    "Legendary": {"trap_slots": 7, "power": 1.75, "shield_h": 8, "raids_per_day": 5},
}

def pick(table, value, default):
    if value is None:
        return default
    for name, rx in table:
        if re.search(rx, value, re.I):
            return name
    return default

def loadout(t):
    return {
        "tier": t.get("Tier"),
        "trap": pick(TRAP, t.get("Mouth"), "Tripwire"),
        "scout": pick(SCOUT, t.get("Eyes"), "Hunch"),
        "head": pick(HEAD, t.get("Head"), None),
        "body": "Streaker" if t.get("Naked") == "Yes" else pick(BODY, t.get("Body"), None),
        "special": ACCESSORY.get(t.get("Accessory")),
        "aura": pick(AURA, t.get("Aura"), None),
        "entry_side": t.get("Side"),
    }

if __name__ == "__main__":
    files = json.load(open(ROOT / "data" / "chog-metadata.json"))["files"]
    loads = [loadout(t) for t in files.values()]
    print(f"{len(loads)} Chogs mapped")
    for k in ["trap", "scout", "head", "body", "special", "aura"]:
        c = collections.Counter(l[k] for l in loads)
        print(f"\n{k}: " + ", ".join(f"{n}={v}" for n, v in c.most_common()))
