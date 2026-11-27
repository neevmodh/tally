// What-if and rooftop-solar models. Illustrative numbers for a prototype, not engineering or financial advice.
// Needs estimateBill() from tariff.js (loaded first in the browser, required in tests).
const SIM_APPLIANCES = { // typical running power in watts
  ac: 1500, cooler: 200, geyser: 2000, motor: 750, lights: 120,
};
const SIM_DAYS = 30;

// reductions: { ac: hoursLessPerDay, ... } -> units and rupees saved per month at the user's current slab
function whatIf(units, reductions, estimate) {
  let saved = 0;
  for (const k in reductions) saved += (SIM_APPLIANCES[k] || 0) * reductions[k] * SIM_DAYS / 1000;
  saved = Math.min(Math.round(saved), Math.max(units - 1, 0));
  return { units: saved, rupees: estimate(units) - estimate(units - saved) };
}

const SOLAR = { unitsPerKwPerDay: 4, costPerKw: 60000 };
// PM Surya Ghar style subsidy: Rs 30,000 per kW for the first 2 kW, Rs 18,000 for the 3rd kW (cap Rs 78,000).
function solarSubsidy(kw) { return Math.min(kw, 2) * 30000 + Math.max(Math.min(kw, 3) - 2, 0) * 18000; }

function solarPlan(units, kw, estimate) {
  const generated = kw * SOLAR.unitsPerKwPerDay * SIM_DAYS;
  const offset = Math.min(units, generated);
  const rupeesPerMonth = estimate(units) - estimate(units - offset);
  const cost = kw * SOLAR.costPerKw;
  const subsidy = solarSubsidy(kw);
  const net = cost - subsidy;
  const paybackYears = rupeesPerMonth > 0 ? Math.round((net / (rupeesPerMonth * 12)) * 10) / 10 : null;
  return { generated, offset, rupeesPerMonth, cost, subsidy, net, paybackYears };
}

if (typeof module !== "undefined") module.exports = { whatIf, solarPlan, solarSubsidy, SIM_APPLIANCES };
