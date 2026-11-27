const { estimateBill, breakdown } = require("./public/tariff.js");
const { whatIf, solarPlan, solarSubsidy } = require("./public/sim.js");
let bad = 0; const ok = (n, c) => { if (!c) { bad++; console.log("FAIL", n); } };

for (const u of [0, 30, 50, 120, 320, 900]) {
  const b = breakdown(u);
  ok("breakdown sums to estimateBill at " + u, Math.abs(b.total - estimateBill(u)) <= 1);
  ok("items sum to total at " + u, Math.abs(b.items.reduce((n, i) => n + i.amount, 0) - b.total) <= 1);
}
ok("320 units uses 4 slabs", breakdown(320).items.filter((i) => i.key.startsWith("slab")).length === 4);
ok("30 units uses 1 slab", breakdown(30).items.filter((i) => i.key.startsWith("slab")).length === 1);

const w = whatIf(320, { ac: 1 }, estimateBill);
ok("AC 1h less saves 45 units", w.units === 45);
ok("saving is positive rupees", w.rupees > 150 && w.rupees < 400);
ok("more reduction saves more", whatIf(320, { ac: 2 }, estimateBill).rupees > w.rupees);
ok("no reduction saves nothing", whatIf(320, {}, estimateBill).rupees === 0);
ok("cannot save more units than used", whatIf(40, { ac: 4, geyser: 4 }, estimateBill).units <= 39);

ok("subsidy 1kW", solarSubsidy(1) === 30000);
ok("subsidy 2kW", solarSubsidy(2) === 60000);
ok("subsidy 3kW capped at 78000", solarSubsidy(3) === 78000 && solarSubsidy(5) === 78000);
const sp = solarPlan(320, 2, estimateBill);
ok("2kW generates 240 units", sp.generated === 240);
ok("net cost = cost - subsidy", sp.net === sp.cost - sp.subsidy);
ok("payback is a sensible number", sp.paybackYears > 1 && sp.paybackYears < 15);
ok("bigger system offsets no more than usage", solarPlan(50, 3, estimateBill).offset === 50);
console.log(bad ? bad + " failed" : "sim tests passed");
process.exit(bad ? 1 : 0);
