// Browser wallet (any injected EIP-1193 wallet) on Monad mainnet.
import { createWalletClient, custom, getAddress, type Address, type WalletClient } from "viem";
import { monad } from "./chain.js";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export interface Wallet {
  address: Address;
  client: WalletClient;
}

let current: Wallet | null = null;

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { ethereum?: Eip1193 }).ethereum;
}

export async function connectWallet(): Promise<Wallet> {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error("No browser wallet found. Install one that supports Monad.");
  const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!addr) throw new Error("Wallet returned no account");
  await ensureMonad(eth);
  current = { address: getAddress(addr), client: createWalletClient({ account: getAddress(addr), chain: monad, transport: custom(eth) }) };
  return current;
}

export function wallet(): Wallet | null {
  return current;
}

async function ensureMonad(eth: Eip1193) {
  const chainId = Number.parseInt((await eth.request({ method: "eth_chainId" })) as string, 16);
  if (chainId === monad.id) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x8f" }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x8f",
          chainName: "Monad",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: ["https://rpc.monad.xyz"],
          blockExplorerUrls: ["https://monadvision.com"],
        },
      ],
    });
  }
}
