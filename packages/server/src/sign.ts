import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

export interface RaidResultMsg {
  raidId: Hex;
  raider: Address;
  raiderToken: bigint;
  targetToken: bigint;
  amount: bigint;
  shieldSecs: bigint;
  deadline: bigint;
}

export const raidResultTypes = {
  RaidResult: [
    { name: "raidId", type: "bytes32" },
    { name: "raider", type: "address" },
    { name: "raiderToken", type: "uint256" },
    { name: "targetToken", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "shieldSecs", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export interface Signer {
  address: Address;
  signResult(msg: RaidResultMsg): Promise<Hex>;
}

export function refereeSigner(key: Hex, chainId: number, vault: Address): Signer {
  const account = privateKeyToAccount(key);
  const domain = { name: "Chogswipe", version: "1", chainId, verifyingContract: vault } as const;
  return {
    address: account.address,
    signResult: (message) => account.signTypedData({ domain, types: raidResultTypes, primaryType: "RaidResult", message }),
  };
}
