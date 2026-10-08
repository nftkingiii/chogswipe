# Traits to gadgets

Every Chog's loadout comes from its own metadata. Traits pick *which* gadgets it has; Tier sets *how strong* they are. The mapping lives in [`scripts/gadgets.py`](../scripts/gadgets.py) and runs over a snapshot of the collection metadata in [`data/chog-metadata.json`](../data/chog-metadata.json) (1,968 of 1,969 files, fetched 2026-10-08; file 82 still unavailable).

Counts below are Chogs in that snapshot.

## Mouth → trap (planted in your hideout)

| Gadget | Mouth traits | Effect | Chogs |
|---|---|---|---|
| Crybaby Alarm | Sad, Worried, wo | Wails when tripped: cuts the raid timer and tags the raider in your replay | 426 |
| Spring Plate | Smile, normal smile, Flat | Launches the raider back one room | 425 |
| Slick Floor | Rainbow Puke, Drooling | Raider slides and drops part of carried loot | 322 |
| Bait Coin | BTC Coin, Mon coin, Gold Tooth | Fake loot pile that pops when grabbed | 233 |
| Gum Snare | Bubblegum | Sticks the raider in place | 167 |
| Tripwire | no Mouth trait | Basic stun wire | 165 |
| Chomper | Lip Bite, Grit | Bear-trap bite, heavy stun | 152 |
| Jack-in-the-Box | Clown Mouth | Scrambles controls briefly | 56 |

## Eyes → scouting (while raiding)

| Gadget | Eyes traits | Effect | Chogs |
|---|---|---|---|
| Hunch | Happy, Round, Normal, other plain eyes | Buzz when a trap is near | 574 |
| X-Ray | visors, VR, glasses, Thug, Chog Viper | Reveal every trap in the current room | 406 |
| Wild Glance | Dead, XD, Clown, MOG, Frog, Angry, others | Reveal one random trap anywhere | 313 |
| Laser Eyes | all lasers | Destroy one revealed trap from range | 274 |
| Tear Sense | crying and tear eyes | See trap outlines through one wall | 241 |
| Peek | Side Eye, Smirk | Spy vs Spy peek: see the defender's layout map for a few seconds | 138 |

## Head → perk

| Gadget | Head traits | Effect | Chogs |
|---|---|---|---|
| Brim Shade | caps and hats | Immune to flash and blind effects | 1,121 |
| Hex | wizard hats, beanies, 3rd Eye, Poison Shroom | Curse your vault: raiders lose a cut on exit | 180 |
| Dash Band | headbands, Durag, Head Wrap | Short dash | 118 |
| Guard | Spartan Helmet, Crown, wreaths, thorns, Holy Seal, Diamond | Absorb one trap hit | 106 |
| Rage Horns | all horns | Smash one locked door | 71 |
| Prank Card | Clown Nose, Rainbow Wig, Taped Banana, 8 Ball | Leave a calling-card trap in a hideout you raid | 51 |
| Lockpick | Robber, Mafia Hat | Open the vault faster | 25 |
| Vent Crawl | Plumber | Travel between rooms through pipes | 25 |
| none | no Head trait | — | 249 |

## Body → movement or stealth

| Gadget | Body traits | Effect | Chogs |
|---|---|---|---|
| Sprint | shirts, hoodies, tracksets, jerseys, tanks | Faster movement | 823 |
| Disguise | tuxedos, suits, vests | The hideout's guard ignores you for a few seconds | 494 |
| Blink | robes, Wizard, Yukata, Chinese, Gojo, Guko | Short teleport | 199 |
| Escape Artist | Inmate, Prisoner, Stripes | Shorter stuck and stun time | 107 |
| Streaker | Naked = Yes | Fastest, but no body gadget | 53 |
| Armor Plate | Golden Armor, Astro, Sci Fi, Army Vest | One extra hit | 32 |
| Costume Immunity | Shark, Dragon, Banana, Duck Float, Toad, Mummy | Immune to one trap family | 31 |
| none | no Body trait | — | 207 |

## Accessory → special (one use per raid, ~10% of Chogs)

| Gadget | Accessory | Effect | Chogs |
|---|---|---|---|
| Pet Scout | Fwog, PEPE | Pet runs ahead and trips the next trap | 41 |
| Stink Bomb | SB | Clears the room's guard | 26 |
| Smoke Bomb | Cigar | Hide from Crybaby Alarm and replays | 25 |
| Decoy Coin | Coin | Drop fake loot to bait a defender's trap | 25 |
| Pump | Green Candle | Speed burst | 23 |
| Second Life | Heart | Survive one knockout | 18 |
| Dump | Red Candle | Slow the next raider in your hideout | 17 |
| Cut Wire | Knife | Disarm one Tripwire or Gum Snare instantly | 17 |

## Aura → passive hideout effect (~half of Chogs)

| Gadget | Aura traits | Effect | Chogs |
|---|---|---|---|
| Ward | Royal, Purple, Violet | Longer shield after being raided | 275 |
| Luck | Clean, Rose, Yellow, Green, White | Small loot bonus on your own raids | 258 |
| Chill | Aqua, Cool, Mint, Wind | Raiders move slower in your hideout | 242 |
| Burn | Fire, Fiery, Burning | Raiders drop a cut of loot on exit | 130 |
| Fog | Smoke, Pink Mist | Your traps don't show up to scouting | 59 |
| Zap | Electric Shock | First raider each day is stunned at the door | 2 |

## Tier → strength

Tier matches Base exactly: Common and Uncommon are Origin, Rare is Skull, Epic is Radioactive, Legendary is 1:1.

| Tier | Chogs | Trap slots | Gadget power | Shield after raid | Raids per day |
|---|---|---|---|---|---|
| Common | 1,264 | 3 | ×1.00 | 4 h | 3 |
| Uncommon | 582 | 4 | ×1.15 | 5 h | 3 |
| Rare (Skull) | 60 | 5 | ×1.30 | 6 h | 4 |
| Epic (Radioactive) | 30 | 6 | ×1.50 | 7 h | 4 |
| Legendary (1:1) | 10 | 7 | ×1.75 | 8 h | 5 |

Rarity adds options and stakes, never immunity: the cap on how much $CHOG one raid can take is the same for every tier.

## Cosmetic traits

- **Side** (Left/Right): which door your Chog enters from, like the black and white spies.
- **Background**: your hideout's wallpaper.
- **Skin**: puppet colour.

## Squads

Holders with several Chogs raid as a squad and switch between them mid-raid, using one Chog's X-Ray to spot a trap and another's Cut Wire to clear it.
