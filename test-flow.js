// Drives the real app.js conversation logic against a tiny fake DOM (no browser needed).
const fs = require("fs"), vm = require("vm");
const els = {};
const mk = (id) => els[id] || (els[id] = {
  id, children: [], style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild(c) { this.children.push(c); c.scrollIntoView = () => {}; }, scrollIntoView() {},
  addEventListener() {}, set innerHTML(v) { this._h = v; if (v === "") this.children = []; }, get innerHTML() { return this._h || ""; },
});
const spoken = [];
const ctx = {
  console, setTimeout: (f) => 0, fetch: async () => ({ json: async () => ({ id: "BS-1", createdAt: "2026-11-27T00:00:00Z" }) }),
  navigator: {}, encodeURIComponent,
  speechSynthesis: { cancel() {}, speak(u) { spoken.push(u.text); u.onend && u.onend(); } },
  SpeechSynthesisUtterance: function (t) { this.text = t; },
  document: { getElementById: mk, createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, scrollIntoView() {} }),
    querySelectorAll: () => [], documentElement: {} },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["i18n.js", "numbers.js", "tariff.js", "app.js"]) vm.runInContext(fs.readFileSync("public/" + f, "utf8"), ctx, { filename: f });
const run = (code) => vm.runInContext(code, ctx);
let bad = 0; const ok = (n, c) => { if (!c) { bad++; console.log("FAIL", n); } };

// full flow in English using spoken words and digits
run('begin()');
run('handleInput("three hundred twenty")'); ok("units", run("state.bill.units") === 320);
run('handleInput("250")'); ok("prev", run("state.bill.prev") === 250);
run('handleInput("two thousand four hundred")'); ok("amount", run("state.bill.amount") === 2400);
run('handleInput("yes")'); ok("moves to appliance", run("state.step") === "appliance");
run('handleInput("the AC mostly")'); ok("appliance", run("state.appliance") === "ac");
const cards = els.chat.children.map((c) => c.innerHTML || "").join("");
ok("bill card has charts and verdict", cards.includes("class=\"bars\"") && cards.includes("verdict warn"));
ok("anomaly flagged for inflated bill", spoken.some((s) => s.includes("percent higher")));
run('handleInput("savings")'); ok("savings card", els.chat.children.some((c) => (c.innerHTML || "").includes("tip")));
run('handleInput("complaint")'); ok("complaint step", run("state.step") === "complaint");
run('handleInput("yes")');

// choice buttons must have real labels (regression: nested i18n keys returned undefined)
run('state.step = "menu"; showMenu()');
const labels = els.choices.children.map((b) => b.textContent);
ok("menu buttons have labels", labels.length === 5 && labels.every((l) => l && l !== "undefined" && l.length > 2));
run('setChoices(applianceChoices())');
ok("appliance buttons have labels", els.choices.children.every((b) => b.textContent && b.textContent !== "undefined"));
ok("t() resolves dotted keys in all languages", ["en","hi","gu"].every((l) => { run('state.lang="' + l + '"'); return run('t("ch.yes")') !== "ch.yes"; }));
run('state.lang = "en"');

// Hindi switch by script + fair bill
spoken.length = 0;
run('begin()'); run('handleInput("तीन सौ बीस")');
ok("hindi words parsed and language switched", run("state.bill.units") === 320 && run("state.lang") === "hi");
console.log(bad ? bad + " failed" : "flow tests passed");
process.exit(bad ? 1 : 0);
