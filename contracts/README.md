# Chogswipe contracts

`HideoutVault` holds $CHOG for each Chog hideout on Monad. Raids move $CHOG between vaults only with a result signed by the Chogswipe referee, within on-chain caps (per-raid cap, shield after a raid, minimum raider stake, replay protection, raider must still hold their Chog).

```bash
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std --no-git
forge test
```
