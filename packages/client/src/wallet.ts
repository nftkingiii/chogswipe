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

type Listening = Eip1193 & { on?(event: string, fn: (accounts: string[]) => void): void };

const injected = () => (window as unknown as { ethereum?: Listening }).ethereum;

/**
 * Connect the browser wallet. With `pick`, ask the wallet to show its account picker
 * first, so a player who just disconnected can choose a different account.
 */
export async function connectWallet(pick = false): Promise<Wallet> {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found. Install one that supports Monad.");
  if (pick) {
    try {
      await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    } catch (e) {
      // 4001 = the player closed the picker; other wallets just don't support it
      if ((e as { code?: number }).code === 4001) throw new Error("Connection cancelled");
    }
  }
  const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!addr) throw new Error("Wallet returned no account");
  await ensureMonad(eth);
  current = { address: getAddress(addr), client: createWalletClient({ account: getAddress(addr), chain: monad, transport: custom(eth) }) };
  return current;
}

export function wallet(): Wallet | null {
  return current;
}

/** Forget the connected wallet and, where the wallet supports it, revoke this site's access. */
export async function disconnectWallet() {
  current = null;
  try {
    await injected()?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    /* not every wallet supports revoking; forgetting it here is enough */
  }
}

/** Call `fn` when the player switches or disconnects accounts inside the wallet itself. */
export function onAccountsChanged(fn: () => void) {
  injected()?.on?.("accountsChanged", (accounts) => {
    if (current && accounts[0]?.toLowerCase() === current.address.toLowerCase()) return;
    current = null;
    fn();
  });
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
