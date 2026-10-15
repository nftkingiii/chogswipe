// Read-only: confirm the referee's EIP-712 hash matches HideoutVault.hashResult on Monad.
import { createPublicClient, hashTypedData, http, type Address } from "viem";
import { vaultAbi } from "../src/chain.js";
import { raidResultTypes } from "../src/sign.js";

const vault = (process.env.VAULT_ADDRESS ?? "0x3a519fDf34Fa98DCf268f4C9d456F50eED710e8D") as Address;
const client = createPublicClient({ transport: http(process.env.RPC_URL ?? "https://rpc.monad.xyz") });
const message = {
  raidId: `0x${"ab".repeat(32)}`,
  raider: "0x954cD87Bff8ead1DC431971A082a86ef0b86033F",
  raiderToken: 1n,
  targetToken: 1_000_000n,
  amount: 123n * 10n ** 18n,
  shieldSecs: 900n,
  deadline: 1_900_000_000n,
} as const;
const local = hashTypedData({
  domain: { name: "Chogswipe", version: "1", chainId: 143, verifyingContract: vault },
  types: raidResultTypes,
  primaryType: "RaidResult",
  message,
});
const onchain = await client.readContract({ address: vault, abi: vaultAbi, functionName: "hashResult", args: [message] });
console.log({ local, onchain, match: local === onchain });
if (local !== onchain) process.exit(1);
