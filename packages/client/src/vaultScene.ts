// Fund your hideout's vault, see its shield, withdraw (after a 1 hour delay), claim the stakers' rewards
// and collect the tickets of raiders caught at your hideout.
import Phaser from "phaser";
import { formatUnits, parseUnits } from "viem";
import { INK } from "./art.js";
import { publicClient, txUrl, vaultAbi, VAULT } from "./chain.js";
import { needsWallet, nav } from "./nav.js";
import { refresh, selectedChog } from "./session.js";
import { claimRewards, deposit, dueTickets, payTickets, pending, requestWithdraw, walletChog, withdraw } from "./tx.js";
import { raidsAgainst } from "./api.js";
import type { Hex } from "viem";
import { FONT_BODY, FONT_TITLE, button, panel, paperBackground } from "./ui.js";

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export class VaultScene extends Phaser.Scene {
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("vault");
  }

  create() {
    paperBackground(this);
    nav(this, "vault");
    if (needsWallet(this, "Your vault holds the $CHOG raiders try to swipe, and the stake you need to raid.")) return;
    const c = selectedChog();
    this.add.text(42, 100, `Chog #${c.id}'s vault on Monad`, { fontFamily: FONT_BODY, fontSize: "24px", color: "#5a4d50" });
    panel(this, 42, 150, 560, 400);
    panel(this, 640, 150, 600, 400);
    panel(this, 42, 572, 1198, 120, 0xf6e3a8);
    this.status = this.add.text(660, 470, "", { fontFamily: FONT_BODY, fontSize: "19px", color: INK, wordWrap: { width: 560 } });
    void this.load_(c.id);
  }

  private async load_(id: number) {
    const [bal, shield, minStake, pend, inWallet, earned, feeBps, against] = await Promise.all([
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "balanceOf", args: [BigInt(id)] }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "shieldUntil", args: [BigInt(id)] }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "minStake" }),
      pending(id),
      walletChog(),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "pendingRewards", args: [BigInt(id)] }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "feeBps" }),
      raidsAgainst(id).catch(() => ({ raids: [] })),
    ]);
    // raids on this hideout that didn't end in an escape: their tickets are the defender's once the window closes
    const notEscaped = against.raids.filter((r) => r.outcome?.result !== "escaped").map((r) => r.raidId as Hex);
    const due = notEscaped.length ? await dueTickets(notEscaped, id).catch(() => ({ ids: [] as Hex[], total: 0n })) : { ids: [] as Hex[], total: 0n };
    const now = Date.now() / 1000;
    const text = (x: number, y: number, s: string, size = 22, color = INK, font = FONT_BODY) =>
      this.add.text(x, y, s, { fontFamily: font, fontSize: `${size}px`, color, wordWrap: { width: 520 } });
    text(66, 170, "IN THE VAULT", 16, "#8a7d70", FONT_TITLE);
    text(66, 196, `${fmt(bal)} $CHOG`, 40, "#c79a2a", FONT_TITLE);
    text(66, 256, Number(shield) > now ? `Shielded for ${Math.ceil((Number(shield) - now) / 60)} more minutes` : "Not shielded: raiders can hit it now", 20);
    text(66, 290, bal >= minStake ? "Staked enough to raid others." : `Stake at least ${fmt(minStake)} $CHOG to raid others.`, 20, bal >= minStake ? "#3fa34d" : "#c0392b");
    text(66, 330, pend.amount > 0n ? `Withdrawal of ${fmt(pend.amount)} $CHOG ${pend.readyAt <= now ? "is ready" : `ready in ${Math.ceil((pend.readyAt - now) / 60)} min`}. Raiders can still hit the vault until it's paid out.` : "Withdrawals wait 1 hour, and the vault stays raidable meanwhile.", 18, "#5a4d50");
    text(66, 470, `In your wallet: ${fmt(inWallet)} $CHOG`, 20);

    text(664, 170, "DEPOSIT", 16, "#8a7d70", FONT_TITLE);
    [1_000, 5_000, 10_000].forEach((amt, i) => {
      button(this, 740 + i * 170, 230, 150, `+${amt.toLocaleString()}`, () => this.act(async () => deposit(id, parseUnits(String(amt), 18), (s) => this.status.setText(s))), false);
    });
    text(664, 290, "WITHDRAW", 16, "#8a7d70", FONT_TITLE);
    button(this, 780, 350, 240, "Request all", () => this.act(() => requestWithdraw(id, bal)), false);
    if (pend.amount > 0n && pend.readyAt <= now) button(this, 1060, 350, 220, "Withdraw", () => this.act(() => withdraw(id)));
    text(664, 400, `Vault contract ${VAULT.slice(0, 10)}… on Monad. Every action asks for your confirmation in your wallet first.`, 16, "#8a7d70");

    // what the hideout earns: a share of every swipe, and the tickets of raiders caught here
    const note = (x: number, y: number, str: string, width: number) =>
      this.add.text(x, y, str, { fontFamily: FONT_BODY, fontSize: "16px", color: "#5a4d50", wordWrap: { width } });
    text(66, 586, "STAKING REWARDS", 16, "#8a7d70", FONT_TITLE);
    text(66, 608, `${fmt(earned)} $CHOG earned`, 28, "#c79a2a", FONT_TITLE);
    note(66, 646, `Stakers share ${Number(feeBps) / 100}% of every swipe. Claiming compounds it.`, 380);
    if (earned > 0n) button(this, 540, 632, 160, "Claim", () => this.act(() => claimRewards(id)));
    text(664, 586, "CAUGHT RAIDERS' TICKETS", 16, "#8a7d70", FONT_TITLE);
    text(664, 608, due.ids.length ? `${fmt(due.total)} $CHOG · ${due.ids.length} raid${due.ids.length === 1 ? "" : "s"}` : "Nothing to collect", 28, due.ids.length ? "#c79a2a" : "#8a7d70", FONT_TITLE);
    note(664, 646, "Every raider puts up a ticket. Catch them and it's yours.", 380);
    if (due.ids.length) button(this, 1140, 632, 160, "Collect", () => this.act(() => payTickets(due.ids)));
  }

  private async act(fn: () => Promise<string>) {
    this.status.setText("Confirm in your wallet…");
    try {
      const hash = await fn();
      this.status.setText(`Done on Monad: ${txUrl(hash)}`);
      await refresh().catch(() => undefined);
      this.time.delayedCall(1800, () => this.scene.restart());
    } catch (e) {
      this.status.setText(`Not done: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}
