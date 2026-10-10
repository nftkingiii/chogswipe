// Wallet transactions against the HideoutVault. Each one is confirmed by the player in their wallet.
import type { Hex } from "viem";
import type { SignedResult } from "./api.js";
import { CHOG_TOKEN, VAULT, erc20Abi, publicClient, vaultAbi } from "./chain.js";
import { connectWallet, wallet } from "./wallet.js";

async function w() {
  return wallet() ?? (await connectWallet());
}

async function send(hash: Hex): Promise<Hex> {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`transaction reverted: ${hash}`);
  return hash;
}

export async function settle(r: SignedResult): Promise<Hex> {
  const { client, address } = await w();
  const hash = await client.writeContract({
    account: address,
    chain: client.chain,
    address: VAULT,
    abi: vaultAbi,
    functionName: "settleRaid",
    args: [
      {
        raidId: r.raidId,
        raider: r.raider,
        raiderToken: BigInt(r.raiderToken),
        targetToken: BigInt(r.targetToken),
        amount: BigInt(r.amount),
        shieldSecs: BigInt(r.shieldSecs),
        deadline: BigInt(r.deadline),
      },
      r.signature,
    ],
  });
  return send(hash);
}

export async function walletChog(): Promise<bigint> {
  const { address } = await w();
  return publicClient.readContract({ address: CHOG_TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

/** Approve (if needed) then deposit $CHOG into a Chog's vault. */
export async function deposit(vaultId: number, amount: bigint, onStep: (s: string) => void): Promise<Hex> {
  const { client, address } = await w();
  const allowance = await publicClient.readContract({ address: CHOG_TOKEN, abi: erc20Abi, functionName: "allowance", args: [address, VAULT] });
  if (allowance < amount) {
    onStep("Approve $CHOG in your wallet…");
    await send(await client.writeContract({ account: address, chain: client.chain, address: CHOG_TOKEN, abi: erc20Abi, functionName: "approve", args: [VAULT, amount] }));
  }
  onStep("Confirm the deposit in your wallet…");
  return send(await client.writeContract({ account: address, chain: client.chain, address: VAULT, abi: vaultAbi, functionName: "deposit", args: [BigInt(vaultId), amount] }));
}

export async function requestWithdraw(vaultId: number, amount: bigint): Promise<Hex> {
  const { client, address } = await w();
  return send(await client.writeContract({ account: address, chain: client.chain, address: VAULT, abi: vaultAbi, functionName: "requestWithdraw", args: [BigInt(vaultId), amount] }));
}

export async function withdraw(vaultId: number): Promise<Hex> {
  const { client, address } = await w();
  return send(await client.writeContract({ account: address, chain: client.chain, address: VAULT, abi: vaultAbi, functionName: "withdraw", args: [BigInt(vaultId)] }));
}

export async function pending(vaultId: number): Promise<{ amount: bigint; readyAt: number }> {
  const [amount, readyAt] = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "pendingWithdrawal", args: [BigInt(vaultId)] });
  return { amount, readyAt: Number(readyAt) };
}
