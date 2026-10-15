// A small HTML form over the game, for the few places that need real typing (feedback, a leaderboard name).
// Phaser listens for keys on the window, so the form keeps its key presses to itself.

export interface Field {
  name: string;
  label: string;
  placeholder?: string;
  value?: string;
  multiline?: boolean;
  maxLength: number;
  required?: boolean;
}

export function askForm(opts: { title: string; blurb?: string; fields: Field[]; submit: string }): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    installFormStyles();
    const wrap = document.createElement("div");
    wrap.className = "cs-form";
    wrap.innerHTML = `<form><b></b><p></p><div class="cs-fields"></div><div class="cs-row"><button type="button" class="cs-cancel">Cancel</button><button type="submit" class="cs-go"></button></div></form>`;
    const form = wrap.querySelector("form")!;
    form.querySelector("b")!.textContent = opts.title;
    const blurb = form.querySelector("p")!;
    if (opts.blurb) blurb.textContent = opts.blurb;
    else blurb.remove();
    form.querySelector(".cs-go")!.textContent = opts.submit;
    const holder = form.querySelector(".cs-fields")!;
    const inputs = opts.fields.map((f) => {
      const label = document.createElement("label");
      label.textContent = f.label;
      const el = document.createElement(f.multiline ? "textarea" : "input");
      el.name = f.name;
      el.maxLength = f.maxLength;
      el.placeholder = f.placeholder ?? "";
      el.value = f.value ?? "";
      el.required = !!f.required;
      if (f.multiline) (el as HTMLTextAreaElement).rows = 5;
      label.appendChild(el);
      holder.appendChild(label);
      return el;
    });
    const close = (v: Record<string, string> | null) => {
      wrap.remove();
      resolve(v);
    };
    for (const type of ["keydown", "keyup", "keypress"]) wrap.addEventListener(type, (e) => e.stopPropagation());
    wrap.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Escape" && close(null));
    wrap.addEventListener("pointerdown", (e) => e.target === wrap && close(null));
    form.querySelector(".cs-cancel")!.addEventListener("click", () => close(null));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      close(Object.fromEntries(inputs.map((el) => [el.name, el.value.trim()])));
    });
    document.body.appendChild(wrap);
    inputs[0]?.focus();
  });
}

const formStyles = `
.cs-form { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(28,22,24,.6); padding: 16px;
  touch-action: auto; -webkit-user-select: text; user-select: text; }
.cs-form form { width: min(520px, 100%); max-height: 100%; overflow: auto; box-sizing: border-box; background: #fffaf0; color: #1c1618;
  border: 5px solid #1c1618; border-radius: 20px; box-shadow: 8px 10px 0 #1c1618; padding: 22px 24px; font: 20px "Patrick Hand", sans-serif; }
.cs-form b { display: block; font: 30px "Luckiest Guy", sans-serif; letter-spacing: 1px; }
.cs-form p { margin: 6px 0 4px; color: #5a4d50; }
.cs-form label { display: block; margin-top: 12px; font-size: 18px; color: #5a4d50; }
.cs-form input, .cs-form textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px 12px; font: 20px "Patrick Hand", sans-serif;
  color: #1c1618; background: #f3eadb; border: 3px solid #1c1618; border-radius: 12px; resize: vertical; }
.cs-form input:focus, .cs-form textarea:focus { outline: 3px solid #e0528a; outline-offset: 1px; }
.cs-row { display: flex; gap: 12px; justify-content: flex-end; margin-top: 18px; }
.cs-row button { font: 20px "Luckiest Guy", sans-serif; letter-spacing: 1px; padding: 10px 18px 6px; border: 4px solid #1c1618; border-radius: 14px; cursor: pointer; }
.cs-cancel { background: #f3eadb; color: #1c1618; }
.cs-go { background: #e0528a; color: #f3eadb; box-shadow: 4px 5px 0 #1c1618; }
/* phones held sideways: everything has to fit above the keyboard */
@media (max-height: 520px) {
  .cs-form { padding: 8px; place-items: start center; }
  .cs-form form { padding: 12px 16px; font-size: 16px; border-width: 4px; box-shadow: 5px 6px 0 #1c1618; }
  .cs-form b { font-size: 22px; }
  .cs-form p { margin: 2px 0; font-size: 15px; }
  .cs-form label { margin-top: 6px; font-size: 15px; }
  .cs-form input, .cs-form textarea { padding: 6px 10px; font-size: 16px; }
  .cs-form textarea { height: 64px; }
  .cs-row { margin-top: 10px; }
  .cs-row button { font-size: 16px; padding: 8px 14px 4px; }
}
`;

let styled = false;
function installFormStyles() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = formStyles;
  document.head.appendChild(s);
}
