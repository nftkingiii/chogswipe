// Who is playing: the demo roster, or a signed-in holder's real Chogs.
import { loadoutFor } from "@chogswipe/sim";
import { me, signIn, signOut, signedIn, type MyChog } from "./api.js";
import { DEMO_ROSTER, IMAGE_BASE, type RosterChog } from "./roster.js";
import { connectWallet, disconnectWallet, wallet } from "./wallet.js";

export interface PlayChog extends RosterChog {
  vault: { balance: string; shieldUntil: number } | null;
  layout: MyChog["layout"];
  plan?: string;
}

interface Session {
  mode: "demo" | "live";
  address: string | null;
  chogs: PlayChog[];
  selected: number; // index into chogs
}

/**
 * Holder mode: wallet sign-in, raids on other holders, vaults and settlement on Monad.
 * On since full launch (Oct 22, 2026); build with VITE_HOLDER_MODE=0 to go back to the public demo.
 */
export const HOLDER_MODE = (import.meta.env.VITE_HOLDER_MODE ?? "1") === "1";

const demoChogs = (): PlayChog[] => DEMO_ROSTER.map((c) => ({ ...c, vault: null, layout: null }));

export const session: Session = { mode: "demo", address: null, chogs: demoChogs(), selected: 0 };

export function selectedChog(): PlayChog {
  return session.chogs[session.selected] ?? session.chogs[0]!;
}

export function selectChog(id: number) {
  const i = session.chogs.findIndex((c) => c.id === id);
  if (i >= 0) session.selected = i;
}

/** Image URL for a Chog: the referee returns a full URL, the demo roster a file name. */
export const imageUrl = (c: RosterChog) => (c.image.startsWith("http") ? c.image : IMAGE_BASE + c.image);

/** Connect a wallet, sign in, and load the holder's Chogs. */
export async function goLive(): Promise<void> {
  if (!HOLDER_MODE) throw new Error("Wallets open at full launch");
  const w = wallet() ?? (await connectWallet(true));
  // a saved sign-in only counts if it belongs to the account that's connected now
  if (signedIn()) {
    const who = await me().then((r) => r.address, () => null);
    if (who?.toLowerCase() !== w.address.toLowerCase()) signOut();
  }
  if (!signedIn()) await signIn(w);
  await refresh();
  session.address = w.address;
}

export async function refresh(): Promise<void> {
  const res = await me();
  session.mode = "live";
  session.address = res.address;
  session.chogs = res.chogs.map((c) => ({
    id: c.id,
    image: c.image ?? "",
    traits: c.traits,
    vault: c.vault,
    layout: c.layout,
    plan: c.plan,
  }));
  if (session.selected >= session.chogs.length) session.selected = 0;
}

export function goDemo() {
  signOut();
  void disconnectWallet();
  Object.assign(session, { mode: "demo", address: null, chogs: demoChogs(), selected: 0 });
}

export const loadoutOf = (c: RosterChog) => loadoutFor(c.traits);
