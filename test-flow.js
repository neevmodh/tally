// Drives the real app.js conversation + dashboard logic against a permissive fake DOM (no browser needed).
const fs = require("fs"), vm = require("vm");
const fake = () => new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => "" : k === "dataset" || k === "style" || k === "classList" ? fake() : k === "length" ? 0 : fake()),
  apply: () => fake(), set: () => true,
});
const spoken = [], saved = [];
const ctx = {
  console, setTimeout: () => 0, requestAnimationFrame: () => 0, matchMedia: () => ({ matches: true }), addEventListener() {},
  fetch: async (url, opts) => { saved.push(JSON.parse(opts.body)); return { json: async () => ({ id: "BS-1" }) }; },
  navigator: {}, encodeURIComponent, URL, Blob,
  speechSynthesis: { cancel() {}, speak(u) { spoken.push(u.text); u.onend && u.onend(); } },
  SpeechSynthesisUtterance: function (t) { this.text = t; },
  document: { getElementById: () => fake(), createElement: () => fake(), querySelectorAll: () => [], documentElement: fake() },
  devicePixelRatio: 1,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["i18n.js", "numbers.js", "tariff.js", "sim.js", "viz.js", "app.js"]) vm.runInContext(fs.readFileSync("public/" + f, "utf8"), ctx, { filename: f });
const run = (c) => vm.runInContext(c, ctx);
let bad = 0; const ok = (n, c) => { if (!c) { bad++; console.log("FAIL", n); } };

run("begin()");
ok("greeting spoken", spoken.at(-1).includes("Namaste"));
run('handleInput("three hundred twenty")'); ok("units from words", run("state.bill.units") === 320);
run('handleInput("250")'); ok("prev", run("state.bill.prev") === 250);
run('handleInput("two thousand four hundred")'); ok("amount from words", run("state.bill.amount") === 2400);
run('handleInput("blah")'); ok("confirm step ignores noise", run("state.step") === "confirm");
run('handleInput("yes")'); ok("moves to appliance", run("state.step") === "appliance");
run('handleInput("it is the AC")'); ok("appliance set", run("state.appliance") === "ac" && run("state.step") === "menu");
const px = run("panelHtml");
ok("x-ray panel has donut + gauge + warning", px.xray.includes("donut") && px.xray.includes("gauge") && px.xray.includes("verdict warn"));
ok("what-if panel built with sliders", px.whatif.includes('type="range"') && px.whatif.includes('data-k="ac"'));
ok("main appliance slider starts at 1h", run("state.reductions.ac") === 1);
ok("anomaly spoken", spoken.some((s) => s.includes("percent higher")));
ok("dashboard prompt spoken", spoken.at(-1).includes("dashboard"));

// voice commands
run('handleInput("what if AC two hours less")'); ok("voice sets slider to 2h", run("state.reductions.ac") === 2);
run('handleInput("geyser")'); ok("bare appliance sets 1h", run("state.reductions.geyser") === 1);
ok("what-if saving spoken", spoken.at(-1).includes("rupees a month"));
run('handleInput("solar")'); ok("solar panel", run("panelHtml").solar.includes("solar-kw") && spoken.at(-1).includes("kilowatt"));
run('handleInput("savings")'); ok("savings panel", run("panelHtml").savings.includes("tip"));
run('handleInput("complaint")'); ok("letter panel", run("panelHtml").letter.includes("letter") && run("panelHtml").letter.includes("2400"));
run("saveComplaint()");
setImmediate(() => {
  ok("complaint posted to server", saved.length === 1 && saved[0].text.includes("2400") && saved[0].bill.units === 320);
  run('handleInput("family")'); ok("family panel with whatsapp link", run("panelHtml").family.includes("wa.me"));
  run('handleInput("something random")'); ok("unknown command handled", spoken.at(-1).includes("did not understand"));

  // button labels regression
  ok("appliance buttons labelled", run("applianceChoices()").every(([l]) => l && l !== "undefined"));
  ok("t() resolves nested keys in all languages", ["en", "hi", "gu"].every((l) => { run('state.lang="' + l + '"'); return ["ch.yes", "ch.noo", "lbl.slab0", "appNames.ac"].every((k) => run(`t("${k}")`) !== k); }));

  // regression: unit label once collided with the keyword table ("[object Object]")
  ok("kW unit labels are strings", ["en", "hi", "gu"].every((l) => { run('state.lang="' + l + '"'); return typeof run('t("kwUnit")') === "string"; }));

  // Hindi: language switch by script, number words, hindi voice commands
  run('state.lang="en"; begin()'); run('handleInput("तीन सौ बीस")');
  ok("hindi words parsed + language switched", run("state.bill.units") === 320 && run("state.lang") === "hi");
  run('handleInput("दो सौ पचास")'); run('handleInput("2400")'); run('handleInput("हाँ")'); run('handleInput("एसी")');
  ok("hindi flow reaches dashboard", run("state.step") === "menu" && run("panelHtml").xray.includes("donut"));
  run('handleInput("एसी एक घंटा कम")'); ok("hindi what-if command", run("state.reductions.ac") === 1);
  run('handleInput("सोलर")'); ok("hindi solar command", run("panelHtml").solar.includes("solar-kw"));

  // restart
  run('handleInput("start again")'); ok("restart resets state", run("state.step") === "units" && Object.keys(run("panelHtml")).length === 0);
  console.log(bad ? bad + " failed" : "flow tests passed");
  process.exit(bad ? 1 : 0);
});
