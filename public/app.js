// Tally - a voice cockpit. Speech in/out uses the browser's built-in APIs (no keys). Logic is rule-based and offline.
const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  lang: "en", step: "units", bill: {}, appliance: null, complaint: null, solarKw: 2,
  reductions: { ac: 0, cooler: 0, geyser: 0, motor: 0, lights: 0 },
};
const panelHtml = {}; // last HTML of each dashboard panel (also read by tests)
const orb = createOrb($("orb"));
let rec = null, stopMeter = null, retries = 0, started = false;

function t(key, vars = {}) {
  const dig = (root) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), root);
  let s = dig(T[state.lang]);
  if (s === undefined) s = dig(T.en);
  if (typeof s !== "string") return s === undefined ? key : s;
  for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
  return s;
}
const rupees = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

// ---------- stage: orb, captions, transcript ----------
function setMode(m) {
  orb.setMode(m);
  $("mic").dataset.mode = m;
  $("orbhint").textContent = m === "listening" ? "" : m === "speaking" ? "" : started ? "" : "Tap to talk";
}
function caption(text) {
  const el = $("say");
  el.textContent = text;
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  addLog(text, "b");
}
function heard(text) { $("you").dataset.label = t("youSaid"); $("you").textContent = text; if (text) addLog(text, "u"); }
function addLog(text, who) {
  const li = document.createElement("li"); li.className = who; li.textContent = text; $("log").appendChild(li);
}
function setStatus(msg) { $("status").textContent = msg; }
const STEP_INDEX = { units: 0, prev: 1, amount: 2, confirm: 3, appliance: 4, menu: 5 };
function updateSteps() {
  const now = STEP_INDEX[state.step] ?? 0;
  document.querySelectorAll("#steps li").forEach((li, i) => { li.className = i < now ? "done" : i === now ? "now" : ""; });
}
function setChoices(list) {
  const box = $("choices"); box.innerHTML = "";
  list.forEach(([label, fn]) => {
    const b = document.createElement("button"); b.textContent = label;
    b.onclick = () => { stopListening(); speechSynthesis.cancel(); fn(); };
    box.appendChild(b);
  });
}
function showHints(on) {
  const box = $("hints"); box.hidden = !on; box.innerHTML = ""; box.dataset.label = t("sayHint");
  if (!on) return;
  t("hints").forEach((h) => {
    const b = document.createElement("button"); b.textContent = "“" + h + "”";
    b.onclick = () => { stopListening(); speechSynthesis.cancel(); handleInput(h); };
    box.appendChild(b);
  });
}

// ---------- speech out / in ----------
function say(text, then) {
  caption(text); updateSteps();
  if (!("speechSynthesis" in window)) { if (then) then(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[state.lang]; u.rate = 0.92;
  let done = false;
  const finish = () => { if (!done) { done = true; setMode("idle"); if (then) then(); } };
  u.onend = finish; u.onerror = finish;
  setTimeout(finish, 2500 + text.length * 120); // safety net when a voice is missing
  setMode("speaking");
  speechSynthesis.speak(u);
}
const ask = (text) => say(text, startListening);

function startListening() {
  if (!SR) { setStatus(t("noMic")); return; }
  stopListening();
  rec = new SR();
  rec.lang = SPEECH_LANG[state.lang]; rec.interimResults = true; rec.maxAlternatives = 1;
  let finalText = "";
  rec.onstart = () => { setMode("listening"); setStatus(t("listening")); startMeter(orb.setLevel).then((stop) => { stopMeter = stop; }); };
  rec.onresult = (e) => { let txt = ""; for (const r of e.results) txt += r[0].transcript; finalText = txt; $("you").dataset.label = t("youSaid"); $("you").textContent = txt; };
  rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") setStatus(t("noMic")); };
  rec.onend = () => {
    if (stopMeter) { stopMeter(); stopMeter = null; }
    setMode("idle"); setStatus(t("tapMic"));
    if (finalText.trim()) { retries = 0; handleInput(finalText.trim()); }
    else if (retries++ < 1) setTimeout(startListening, 300);
  };
  try { rec.start(); } catch { /* already started */ }
}
function stopListening() {
  if (rec) { rec.onend = null; try { rec.abort(); } catch {} rec = null; }
  if (stopMeter) { stopMeter(); stopMeter = null; }
  orb.setLevel(0);
}

// ---------- language + parsing ----------
function detectLang(text) { return /[઀-૿]/.test(text) ? "gu" : /[ऀ-ॿ]/.test(text) ? "hi" : null; }
function setLang(l) {
  state.lang = l; document.documentElement.lang = l;
  document.querySelectorAll(".langs button").forEach((b) => b.classList.toggle("on", b.dataset.lang === l));
}
function toAscii(s) {
  return s.replace(/[०-९]/g, (c) => c.charCodeAt(0) - 0x0966).replace(/[૦-૯]/g, (c) => c.charCodeAt(0) - 0x0AE6);
}
function parseNumber(text) {
  const m = toAscii(text).replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (m) return Math.round(parseFloat(m[0]));
  return parseSpokenNumber(text);
}
function has(text, list) { const low = text.toLowerCase(); return list.some((w) => low.includes(w.toLowerCase())); }
const isYes = (x) => has(x, T[state.lang].kw.yes) || has(x, T.en.kw.yes);
const isNo = (x) => has(x, T[state.lang].kw.no) || has(x, T.en.kw.no);
function findAppliance(text) { for (const k in APPLIANCES) if (has(text, APPLIANCES[k].words)) return k; return null; }
function intent(text) {
  const kw = T[state.lang].kw;
  for (const name of ["restart", "xray", "savings", "solar", "complaint", "family", "whatif"]) {
    if (has(text, kw[name]) || has(text, T.en.kw[name])) return name;
  }
  return null;
}

// ---------- panels ----------
function showPanel(id, title, html, { wide = false, after } = {}) {
  const inner = `<h3>${title}</h3>${html}`;
  panelHtml[id] = inner;
  let el = document.getElementById("panel-" + id);
  const fresh = !el;
  if (fresh) { el = document.createElement("section"); el.id = "panel-" + id; $("panels").appendChild(el); }
  el.className = "panel" + (wide ? " wide" : "");
  el.innerHTML = inner;
  if (after) after(el);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return el;
}
function bars(rows) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return rows.map((r) => `<div class="bar"><span>${r.label}</span><div class="track"><div class="fill ${r.hot ? "hot" : ""}" style="width:${Math.round((r.v / max) * 100)}%"></div></div><b>${r.text}</b></div>`).join("");
}

// ---------- analysis ----------
function analyse() {
  const { units, prev, amount } = state.bill;
  const diffUnits = units - prev;
  return {
    diffUnits, up: diffUnits > 0,
    pct: prev ? Math.round(Math.abs(diffUnits) / prev * 100) : 0,
    diffRupees: Math.abs(estimateBill(units) - estimateBill(prev)),
    check: compareBill(units, amount),
  };
}
function topTips() {
  const rate = marginalRate(state.bill.units);
  const order = [state.appliance, ...Object.keys(APPLIANCES).filter((k) => k !== state.appliance)].slice(0, 3);
  return order.map((k) => ({ key: k, rupees: Math.round(APPLIANCES[k].saveUnits * rate) }));
}
const whatIfNow = () => whatIf(state.bill.units, state.reductions, estimateBill);
const solarNow = () => solarPlan(state.bill.units, state.solarKw, estimateBill);

// ---------- panel builders ----------
function panelXray() {
  const a = analyse(), { units, prev, amount } = state.bill, flagged = a.check.diffPct >= 25;
  const b = breakdown(units);
  const items = b.items.map((i) => ({ ...i, label: t("lbl." + i.key) + (i.units ? ` · ${i.units}` : "") }));
  showPanel("xray", t("xrayTitle"), `
    <div class="amount"><span class="big">${rupees(amount)}</span> <span class="chip ${a.up ? "up" : "down"}">${a.up ? "▲" : "▼"} ${a.pct}%</span></div>
    <div class="meta">${units} ${t("units")} · ${t("prev")}: ${prev}</div>
    <div class="xrow">
      ${donutSvg(items, b.total, t("lbl.total"))}
      <div class="gaugewrap">${gaugeSvg(a.check.diffPct, { expected: t("expected") })}<div class="gcap">${t("lbl.gauge")} ${rupees(a.check.expected)}</div></div>
    </div>
    ${bars([{ label: t("prev"), v: prev, text: prev, hot: false }, { label: t("units"), v: units, text: units, hot: a.up }])}
    <div class="verdict ${flagged ? "warn" : "ok"}">${flagged ? "⚠️" : "✅"} ${flagged
      ? t("anomaly", { u: units, e: a.check.expected, a: amount, pct: a.check.diffPct })
      : t("fair", { u: units, e: a.check.expected, a: amount })}</div>`,
    { wide: true, after: (el) => { animateDonut(el); animateGauge(el); } });
}

function panelWhatIf(speak) {
  const names = T[state.lang].appNames;
  const rows = Object.keys(SIM_APPLIANCES).map((k) => `
    <label class="sl"><span>${names[k]}</span><input type="range" min="0" max="4" step="0.5" value="${state.reductions[k]}" data-k="${k}" aria-label="${names[k]} ${t("hoursLess")}"><b id="sv-${k}">${state.reductions[k]}h</b></label>`).join("");
  showPanel("whatif", t("whatifTitle"), `${rows}
    <div class="total"><span>${t("saves")} · ${t("perMonth")}</span><span class="big" id="wi-total">${rupees(whatIfNow().rupees)}</span></div>
    <div class="meta" id="wi-units">${whatIfNow().units} ${t("units2")}</div>`);
  if (speak) say(speak, startListening);
}
function refreshWhatIf() {
  const w = whatIfNow();
  for (const k in state.reductions) { const el = document.getElementById("sv-" + k); if (el) el.textContent = state.reductions[k] + "h"; }
  const tot = document.getElementById("wi-total"); if (tot) tot.textContent = rupees(w.rupees);
  const un = document.getElementById("wi-units"); if (un) un.textContent = `${w.units} ${t("units2")}`;
  panelHtml.whatif = (document.getElementById("panel-whatif") || {}).innerHTML || panelHtml.whatif;
}

function panelSolar(speak) {
  const p = solarNow();
  showPanel("solar", t("solarTitle"), `
    <label class="sl wide"><span>${t("system")}</span><input type="range" min="1" max="3" step="1" value="${state.solarKw}" id="solar-kw" aria-label="${t("system")}"><b id="sk">${state.solarKw} ${t("kwUnit")}</b></label>
    <div class="kv" id="solar-kv">${solarKv(p)}</div><div class="note">${t("solarNote")}</div>`);
  if (speak) say(t("solarSpeak", { kw: state.solarKw, u: p.offset, r: p.rupeesPerMonth, sub: p.subsidy, net: p.net, y: p.paybackYears ?? "-" }), startListening);
}
function solarKv(p) {
  return `<div><span>${t("saves")} · ${t("perMonth")}</span><b>${rupees(p.rupeesPerMonth)}</b></div>
    <div><span>${t("subsidy")}</span><b>${rupees(p.subsidy)}</b></div>
    <div><span>${t("netCost")}</span><b>${rupees(p.net)}</b></div>
    <div><span>${t("payback")}</span><b>${p.paybackYears ?? "-"} ${t("years")}</b></div>`;
}
function refreshSolar() {
  const p = solarNow();
  const kv = document.getElementById("solar-kv"); if (kv) kv.innerHTML = solarKv(p);
  const sk = document.getElementById("sk"); if (sk) sk.textContent = state.solarKw + " " + t("kwUnit");
  panelHtml.solar = (document.getElementById("panel-solar") || {}).innerHTML || panelHtml.solar;
}

function panelSavings(speak) {
  const tips = topTips(), total = tips.reduce((n, x) => n + x.rupees, 0);
  showPanel("savings", t("savingsCard"),
    `<div class="amount"><span class="big">${rupees(total)}</span> <span class="meta">/ ${t("perMonth")}</span></div>` +
    tips.map((x) => `<div class="tip"><span>${T[state.lang].tips[x.key]}</span><b>${rupees(x.rupees)}</b></div>`).join(""));
  if (speak) say(t("savings", { list: tips.map((x, i) => `${i + 1}. ${T[state.lang].tips[x.key]}`).join(" "), total }), startListening);
}

function letterText() {
  const { units, prev, amount } = state.bill, e = compareBill(units, amount).expected;
  return t("complaintText", { u: units, p: prev, a: amount }) + `\n${t("expected")}: ${rupees(e)}`;
}
function panelLetter(speak) {
  state.complaint = letterText();
  const date = new Date().toISOString().slice(0, 10);
  showPanel("letter", t("letterTitle"), `<div class="letter"><p><b>To,</b><br>The Executive Engineer / Customer Care<br>DISCOM</p>
    <p>${state.complaint.replace(/\n/g, "<br>")}</p><p>Consumer no: ____________<br>${date}</p></div>
    <div class="actions"><button class="pbtn" id="lt-save">${t("save")}</button><button class="pbtn" id="lt-dl">${t("download")}</button><button class="pbtn" id="lt-print">${t("print")}</button></div><div class="note" id="lt-ref"></div>`,
    { after: (el) => {
      el.querySelector("#lt-save").onclick = saveComplaint;
      el.querySelector("#lt-dl").onclick = downloadLetter;
      el.querySelector("#lt-print").onclick = () => window.print();
    } });
  if (speak) say(t("complaintAsk"), startListening);
}
async function saveComplaint() {
  try {
    const r = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: state.complaint, lang: state.lang, bill: state.bill }) });
    const item = await r.json();
    const ref = document.getElementById("lt-ref"); if (ref) ref.textContent = "✅ " + item.id;
    say(t("complaintDone", { id: item.id }), startListening);
    return item;
  } catch { say(t("complaintNo"), startListening); }
}
function downloadLetter() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([state.complaint], { type: "text/plain;charset=utf-8" }));
  a.download = "tally-complaint.txt"; a.click();
}

function panelFamily(speak) {
  const { units, prev, amount } = state.bill, tip = T[state.lang].tips[state.appliance] || "";
  const msg = t("waText", { u: units, p: prev, a: amount, tip });
  showPanel("family", "💬", `<div class="meta">${msg}</div><div class="actions"><a class="pbtn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a></div>`);
  if (speak) say(t("wa"), startListening);
}

// ---------- conversation ----------
function begin() {
  started = true;
  $("steps").hidden = false; $("panels").innerHTML = ""; $("log").innerHTML = "";
  for (const k in panelHtml) delete panelHtml[k];
  for (const k in state.reductions) state.reductions[k] = 0;
  Object.assign(state, { step: "units", bill: {}, appliance: null, complaint: null });
  heard(""); setChoices([]); showHints(false);
  ask(t("greet"));
}

function handleInput(text) {
  heard(text);
  const d = detectLang(text);
  if (d && d !== state.lang) setLang(d);
  const s = state.step;
  const yesNo = () => setChoices([[t("ch.yes"), () => handleInput(t("ch.yes"))], [t("ch.noo"), () => handleInput(t("ch.noo"))]]);

  if (s === "units" || s === "prev" || s === "amount") {
    const n = parseNumber(text);
    if (n === null || n <= 0) return ask(t("badNum"));
    if (s === "units") { state.bill.units = n; state.step = "prev"; return ask(t("askPrev")); }
    if (s === "prev") { state.bill.prev = n; state.step = "amount"; return ask(t("askAmt")); }
    state.bill.amount = n; state.step = "confirm"; yesNo();
    return ask(t("confirm", { u: state.bill.units, p: state.bill.prev, a: state.bill.amount }));
  }
  if (s === "confirm") {
    if (isYes(text)) { state.step = "appliance"; setChoices(applianceChoices()); return ask(t("askApp")); }
    if (isNo(text)) { state.step = "units"; setChoices([]); return ask(t("confirmRetry")); }
    return ask(t("badNum"));
  }
  if (s === "appliance") {
    const k = findAppliance(text);
    return k ? chooseAppliance(k) : ask(t("badApp"));
  }
  if (s === "menu") return handleCommand(text);
}

function applianceChoices() {
  const names = T[state.lang].appNames;
  return Object.keys(APPLIANCES).map((k) => [names[k] || k, () => chooseAppliance(k)]);
}

function chooseAppliance(k) {
  state.appliance = k;
  if (k in state.reductions) state.reductions[k] = 1; // start the what-if on the user's main culprit
  state.step = "menu"; setChoices([]);
  const a = analyse(), { units, prev } = state.bill, reason = T[state.lang].reasons[k];
  const text = a.diffUnits === 0 ? t("same", { reason })
    : t("explain", { dir: t(a.up ? "dirUp" : "dirDown"), pct: a.pct, p: prev, u: units, diff: a.diffRupees, reason });
  panelXray();
  const flagged = a.check.diffPct >= 25;
  const verdict = flagged ? t("anomaly", { u: units, e: a.check.expected, a: state.bill.amount, pct: a.check.diffPct }) : t("fair", { u: units, e: a.check.expected, a: state.bill.amount });
  say(text, () => say(verdict, () => { panelWhatIf(); showHints(true); say(t("dash"), startListening); }));
}

function handleCommand(text) {
  // "AC one hour less" style commands change a slider directly
  const k = findAppliance(text);
  if (k && k in state.reductions && !intent(text)?.match(/^(savings|solar|complaint|family|restart|xray)$/)) {
    const n = parseNumber(text); const hours = n === null || n <= 0 ? 1 : Math.min(n, 4);
    state.reductions[k] = hours;
    panelWhatIf();
    return say(t("whatifSet", { name: T[state.lang].appNames[k], h: hours, r: whatIfNow().rupees, t: whatIfNow().rupees }), startListening);
  }
  switch (intent(text)) {
    case "restart": return begin();
    case "xray": panelXray(); return say(t("explain", { dir: t(analyse().up ? "dirUp" : "dirDown"), pct: analyse().pct, p: state.bill.prev, u: state.bill.units, diff: analyse().diffRupees, reason: "" }), startListening);
    case "whatif": return panelWhatIf(t("whatifSpeak", { name: T[state.lang].appNames[state.appliance] || "AC", r: whatIfNow().rupees }));
    case "savings": return panelSavings(true);
    case "solar": return panelSolar(true);
    case "complaint": return panelLetter(true);
    case "family": return panelFamily(true);
    default:
      if (isNo(text)) return say(t("bye"));
      return ask(t("unknown"));
  }
}

// ---------- wiring ----------
$("mic").onclick = () => {
  speechSynthesis.cancel(); retries = 0;
  if (!started) begin(); else if (rec) { stopListening(); setMode("idle"); } else startListening();
};
$("textform").onsubmit = (e) => {
  e.preventDefault();
  const v = $("textin").value.trim(); if (!v) return;
  $("textin").value = ""; stopListening(); speechSynthesis.cancel();
  if (!started) { started = true; $("steps").hidden = false; state.step = "units"; }
  handleInput(v);
};
document.querySelectorAll(".langs button").forEach((b) => {
  b.onclick = () => { setLang(b.dataset.lang); stopListening(); speechSynthesis.cancel(); begin(); };
});
// sliders (event delegation, so re-rendered panels keep working)
$("panels").addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.k) { state.reductions[el.dataset.k] = parseFloat(el.value); refreshWhatIf(); }
  else if (el.id === "solar-kw") { state.solarKw = parseInt(el.value, 10); refreshSolar(); }
});
setStatus(SR ? t("tapMic") : t("noMic"));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
