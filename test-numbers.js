const { parseSpokenNumber: p } = require("./public/numbers.js");
const cases = [
  ["three hundred twenty", 320], ["two thousand four hundred eighty", 2480], ["teen sau bees", 320],
  ["do hazaar char sau assi", 2480], ["तीन सौ बीस", 320], ["दो हज़ार चार सौ अस्सी", 2480],
  ["ek sau pachas", 150], ["सौ", 100], ["hello there", null],
];
let bad = 0;
for (const [s, want] of cases) { const got = p(s); if (got !== want) { bad++; console.log("FAIL", s, got, want); } }
console.log(bad ? bad + " failed" : "all " + cases.length + " passed");
process.exit(bad ? 1 : 0);
