// Checks public/i18n.js for duplicate keys at any nesting level (a later key silently overwrites an earlier one)
// and that en, hi and gu define exactly the same set of keys.
const fs = require("fs");

function duplicates(src) {
  const dups = [], stack = [new Set()], path = [];
  let i = 0, pendingKey = null;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { // skip string literals
      const q = c; i++;
      while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1;
      i++; continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /\w/.test(src[j])) j++;
      const word = src.slice(i, j), after = src.slice(j).match(/^\s*:/);
      if (after && stack.length > 1) {
        const set = stack[stack.length - 1];
        if (set.has(word)) dups.push(path.join(".") + "." + word); else set.add(word);
        pendingKey = word;
      } else if (after && stack.length === 1) pendingKey = word;
      i = j; continue;
    }
    if (c === "{") { stack.push(new Set()); path.push(pendingKey || "?"); pendingKey = null; }
    else if (c === "}") { stack.pop(); path.pop(); }
    i++;
  }
  return dups;
}

function keysOf(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keysOf(v, prefix + k + ".") : [prefix + k]));
}

if (require.main === module) {
  const src = fs.readFileSync(__dirname + "/public/i18n.js", "utf8");
  let bad = 0; const ok = (n, c, extra = "") => { if (!c) { bad++; console.log("FAIL", n, extra); } };
  const d = duplicates(src);
  ok("no duplicate keys in i18n.js", d.length === 0, d.join(", "));
  const T = new Function("window", src + "; return T;")({});
  const en = new Set(keysOf(T.en));
  for (const l of ["hi", "gu"]) {
    const ks = new Set(keysOf(T[l]));
    const missing = [...en].filter((k) => !ks.has(k)), extra = [...ks].filter((k) => !en.has(k));
    ok(l + " has every English key", missing.length === 0, missing.join(", "));
    ok(l + " has no unknown keys", extra.length === 0, extra.join(", "));
  }
  // self-test: the scanner must catch the exact bug we hit before
  const buggy = src.replace('kwUnit: "kW"', 'kw: "kW"');
  ok("scanner detects the old kw collision", duplicates(buggy).some((x) => x.endsWith(".kw")));
  console.log(bad ? bad + " failed" : "i18n tests passed");
  process.exit(bad ? 1 : 0);
}
module.exports = { duplicates };
