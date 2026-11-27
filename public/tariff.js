// Illustrative residential tariff used to sanity-check a bill. NOT an official DISCOM tariff:
// real slabs, fixed charges and fuel surcharges differ by state and change over time.
const TARIFF = {
  slabs: [ // [upper limit of slab in units, rupees per unit]
    [50, 3.05], [100, 3.5], [250, 4.15], [Infinity, 5.2],
  ],
  fixedCharge: 25,
  dutyRate: 0.15, // electricity duty on the energy charge
};

function energyCharge(units) {
  let left = units, lower = 0, total = 0;
  for (const [upper, rate] of TARIFF.slabs) {
    const inSlab = Math.min(left, upper - lower);
    if (inSlab <= 0) break;
    total += inSlab * rate;
    left -= inSlab;
    lower = upper;
  }
  return total;
}

function estimateBill(units) {
  const e = energyCharge(units);
  return Math.round(e * (1 + TARIFF.dutyRate) + TARIFF.fixedCharge);
}

// Itemised bill: one entry per slab used, then duty and fixed charge. Items sum to `total`.
function breakdown(units) {
  const items = [];
  let left = units, lower = 0, energy = 0;
  for (const [upper, rate] of TARIFF.slabs) {
    const inSlab = Math.min(left, upper - lower);
    if (inSlab <= 0) break;
    const amount = inSlab * rate;
    items.push({ key: "slab" + items.length, units: Math.round(inSlab), rate, amount });
    energy += amount; left -= inSlab; lower = upper;
  }
  items.push({ key: "duty", amount: energy * TARIFF.dutyRate });
  items.push({ key: "fixed", amount: TARIFF.fixedCharge });
  const total = items.reduce((n, i) => n + i.amount, 0);
  return { items, total: Math.round(total) };
}

// Rupees for the next unit, i.e. what one saved unit is worth at this usage level (slab rate plus duty).
function marginalRate(units) {
  const slab = TARIFF.slabs.find(([upper]) => units < upper);
  return slab[1] * (1 + TARIFF.dutyRate);
}

// How far the actual bill is above (positive) or below (negative) the estimate, in percent.
function compareBill(units, actual) {
  const expected = estimateBill(units);
  return { expected, diffPct: Math.round(((actual - expected) / expected) * 100) };
}

if (typeof module !== "undefined") module.exports = { estimateBill, marginalRate, compareBill, breakdown };
