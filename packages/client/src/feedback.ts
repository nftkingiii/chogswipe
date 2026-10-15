// The feedback box: a note to the team from any menu screen, stored by the server.
import Phaser from "phaser";
import { sendFeedback } from "./api.js";
import { askForm } from "./dom.js";
import { notice } from "./ui.js";

export async function openFeedback(scene: Phaser.Scene) {
  const v = await askForm({
    title: "SEND FEEDBACK",
    blurb: "What's fun, what's broken, what should we add? The team reads every note.",
    fields: [
      { name: "text", label: "Your feedback", multiline: true, maxLength: 2000, required: true },
      { name: "contact", label: "Your X or Discord, if you'd like a reply (optional)", maxLength: 120 },
    ],
    submit: "Send",
  });
  if (!v?.text) return;
  let msg: Phaser.GameObjects.Text;
  try {
    await sendFeedback({ text: v.text, contact: v.contact || undefined, where: scene.scene.key });
    msg = notice(scene, "Thanks! Your note is with the team.");
  } catch (e) {
    msg = notice(scene, `Couldn't send that: ${(e as Error).message}`);
  }
  scene.time.delayedCall(3000, () => msg.destroy());
}
