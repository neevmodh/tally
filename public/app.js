// Tally - voice-first flow. Uses the browser's built-in speech recognition and synthesis (no API keys).
const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = { lang: "en", step: "units", bill: {}, appliance: null, complaint: null, busy: false };
let rec = null;
let retries = 0;

function t(key, vars = {}) {
  let s = key.split(".").reduce((o, k) => (o ? o[k] : undefined), T[state.lang]);
  if (s === undefined) s = key.split(".").reduce((o, k) => (o ? o[k] : undefined), T.en) || key;
  for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
  return s;
}

// ---------- UI helpers ----------
function addMsg(text, who) {
  const d = document.createElement("div");
  d.className = "msg " + who;
  const b = document.createElement("div");
  b.className = "b";
  b.textContent = text;
  d.appendChild(b);
  $("chat").appendChild(d);
  d.scrollIntoView({ behavior: "smooth", block: "end" });
}
function setChoices(list) {
  const box = $("choices");
  box.innerHTML = "";
  list.forEach(([label, fn]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => { stopListening(); speechSynthesis.cancel(); fn(); };
    box.appendChild(b);
  });
}
function addCard(html) {
  const d = document.createElement("div");
  d.className = "card";
  d.innerHTML = html;
  $("chat").appendChild(d);
  d.scrollIntoView({ behavior: "smooth", block: "end" });
}
function setStatus(msg) { $("status").textContent = msg; }

// ---------- speech out ----------
const STEP_INDEX = { units: 0, prev: 1, amount: 2, confirm: 3, appliance: 4, menu: 5, roof: 5, complaint: 5 };
function updateSteps() {
  const now = STEP_INDEX[state.step] ?? 0;
  document.querySelectorAll("#steps li").forEach((li, i) => {
    li.className = i < now ? "done" : i === now ? "now" : "";
  });
}
function say(text, then) {
  addMsg(text, "bot");
  updateSteps();
  if (!("speechSynthesis" in window)) { if (then) then(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[state.lang];
  u.rate = 0.9;
  let done = false;
  const finish = () => { if (!done) { done = true; $("mic").classList.remove("speaking"); if (then) then(); } };
  $("mic").classList.add("speaking");
  u.onend = finish;
  u.onerror = finish;
  setTimeout(finish, 2000 + text.length * 120); // safety net if a voice is missing
  speechSynthesis.speak(u);
}
function ask(text) { say(text, startListening); }

// ---------- speech in ----------
function startListening() {
  if (!SR) { setStatus(t("noMic")); return; }
  stopListening();
  rec = new SR();
  rec.lang = SPEECH_LANG[state.lang];
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  rec.onstart = () => { $("mic").classList.add("listening"); setStatus(t("listening")); };
  rec.onresult = (e) => {
    let txt = "";
    for (const r of e.results) txt += r[0].transcript;
    finalText = txt;
    $("heard").textContent = "🗣 " + txt;
  };
  rec.onerror = (e) => {
    $("mic").classList.remove("listening");
    if (e.error === "not-allowed" || e.error === "service-not-allowed") setStatus(t("noMic"));
  };
  rec.onend = () => {
    $("mic").classList.remove("listening");
    setStatus(t("tapMic"));
    if (finalText.trim()) { retries = 0; handleInput(finalText.trim()); }
    else if (retries++ < 1) setTimeout(startListening, 300);
  };
  try { rec.start(); } catch { /* already started */ }
}
function stopListening() { if (rec) { rec.onend = null; try { rec.abort(); } catch {} rec = null; } $("mic").classList.remove("listening"); }

// ---------- language ----------
function detectLang(text) {
  if (/[઀-૿]/.test(text)) return "gu";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  return null;
}
function setLang(l) {
  state.lang = l;
  document.documentElement.lang = l;
  document.querySelectorAll(".langs button").forEach((b) => b.classList.toggle("on", b.dataset.lang === l));
}

// ---------- parsing ----------
function toAscii(s) {
  return s.replace(/[०-९]/g, (c) => c.charCodeAt(0) - 0x0966)
          .replace(/[૦-૯]/g, (c) => c.charCodeAt(0) - 0x0AE6);
}
function parseNumber(text) {
  const m = toAscii(text).replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (m) return Math.round(parseFloat(m[0]));
  return parseSpokenNumber(text); // "teen sau bees", "तीन सौ बीस", "three hundred twenty"
}
function has(text, list) {
  const low = text.toLowerCase();
  return list.some((w) => low.includes(w.toLowerCase()));
}
function isYes(text) { return has(text, T[state.lang].kw.yes) || has(text, T.en.kw.yes); }
function isNo(text) { return has(text, T[state.lang].kw.no) || has(text, T.en.kw.no); }
function findAppliance(text) {
  for (const key in APPLIANCES) if (has(text, APPLIANCES[key].words)) return key;
  return null;
}

// ---------- core logic ----------
function analyse() {
  const { units, prev, amount } = state.bill;
  const diffUnits = units - prev;
  const pct = prev ? Math.round(Math.abs(diffUnits) / prev * 100) : 0;
  const diffRupees = Math.abs(estimateBill(units) - estimateBill(prev));
  const check = compareBill(units, amount); // expected bill vs what they were charged
  return { diffUnits, pct, diffRupees, up: diffUnits > 0, check };
}
function topTips() {
  // main appliance first, then the next two, valued at the rupee rate of the user's current slab
  const rate = marginalRate(state.bill.units);
  const order = [state.appliance, ...Object.keys(APPLIANCES).filter((k) => k !== state.appliance)].slice(0, 3);
  return order.map((k) => ({ key: k, rupees: Math.round(APPLIANCES[k].saveUnits * rate) }));
}
function bars(rows) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return `<div class="bars">` + rows.map((r) =>
    `<div class="bar"><span>${r.label}</span><div class="track"><div class="fill ${r.hot ? "hot" : ""}" data-w="${Math.round((r.v / max) * 100)}" style="width:${Math.round((r.v / max) * 100)}%"></div></div><b>${r.text}</b></div>`
  ).join("") + `</div>`;
}

// ---------- conversation ----------
function begin() {
  $("app").classList.add("started"); $("hero").hidden = false; $("steps").hidden = false;
  state.step = "units"; state.bill = {}; state.appliance = null; state.complaint = null;
  setChoices([]);
  ask(t("greet"));
}

function handleInput(text) {
  addMsg(text, "user");
  $("heard").textContent = "";
  const detected = detectLang(text);
  if (detected && detected !== state.lang) setLang(detected);
  const s = state.step;

  if (s === "units" || s === "prev" || s === "amount") {
    const n = parseNumber(text);
    if (n === null || n <= 0) return ask(t("badNum"));
    if (s === "units") { state.bill.units = n; state.step = "prev"; return ask(t("askPrev")); }
    if (s === "prev") { state.bill.prev = n; state.step = "amount"; return ask(t("askAmt")); }
    state.bill.amount = n; state.step = "confirm";
    setChoices([[t("ch.yes"), () => handleInput(t("ch.yes"))], [t("ch.noo"), () => handleInput(t("ch.noo"))]]);
    return ask(t("confirm", { u: state.bill.units, p: state.bill.prev, a: state.bill.amount }));
  }

  if (s === "confirm") {
    if (isYes(text)) { state.step = "appliance"; setChoices(applianceChoices()); return ask(t("askApp")); }
    if (isNo(text)) { state.step = "units"; setChoices([]); return ask(t("confirmRetry")); }
    return ask(t("badNum"));
  }

  if (s === "appliance") {
    const k = findAppliance(text);
    if (!k) return ask(t("badApp"));
    return chooseAppliance(k);
  }

  if (s === "roof") {
    if (isYes(text)) { state.step = "menu"; showMenu(); return say(t("solarYes"), () => ask(t("more"))); }
    if (isNo(text)) { state.step = "menu"; showMenu(); return say(t("solarNo"), startListening); }
    return ask(t("ownRoof"));
  }

  if (s === "complaint") {
    if (isYes(text)) return saveComplaint();
    state.step = "menu"; showMenu();
    return say(t("complaintNo"), () => ask(t("more")));
  }

  if (s === "menu") {
    const kw = T[state.lang].kw;
    if (has(text, kw.savings) || has(text, T.en.kw.savings)) return doSavings();
    if (has(text, kw.complaint) || has(text, T.en.kw.complaint)) return doComplaint();
    if (has(text, kw.solar) || has(text, T.en.kw.solar)) return doSolar();
    if (has(text, kw.family) || has(text, T.en.kw.family)) return doFamily();
    if (isNo(text)) return say(t("bye"));
    return ask(t("unknown"));
  }
}

function applianceChoices() {
  const names = { en: ["AC", "Cooler", "Geyser", "Fridge", "Motor", "Guests"], hi: ["एसी", "कूलर", "गीजर", "फ्रिज", "मोटर", "मेहमान"], gu: ["એસી", "કુલર", "ગીઝર", "ફ્રીજ", "મોટર", "મહેમાન"] }[state.lang];
  return Object.keys(APPLIANCES).map((k, i) => [names[i], () => chooseAppliance(k)]);
}

function chooseAppliance(k) {
  state.appliance = k;
  state.step = "menu";
  const a = analyse();
  const { units, prev, amount } = state.bill;
  const reason = T[state.lang].reasons[k];
  const text = a.diffUnits === 0 ? t("same", { reason })
    : t("explain", { dir: t(a.up ? "dirUp" : "dirDown"), pct: a.pct, p: prev, u: units, diff: a.diffRupees, reason });
  const flaggedBill = a.check.diffPct >= 25;
  addCard(`<h3>${t("cardBill")}</h3>
    <div class="amount"><span class="big">₹${amount}</span>
      <span class="chip ${a.up ? "up" : "down"}">${a.up ? "▲" : "▼"} ${a.pct}%</span></div>
    <div class="meta">${units} ${t("units")} · ${t("prev")}: ${prev} ${t("units")}</div>
    ${bars([
      { label: t("prev"), v: prev, text: prev, hot: false },
      { label: t("units"), v: units, text: units, hot: a.up },
    ])}
    ${bars([
      { label: t("expected"), v: a.check.expected, text: "₹" + a.check.expected, hot: false },
      { label: t("cardBill"), v: amount, text: "₹" + amount, hot: flaggedBill },
    ])}
    <div class="verdict ${flaggedBill ? "warn" : "ok"}">${flaggedBill ? "⚠️" : "✅"} ${a.check.diffPct >= 0 ? "+" : ""}${a.check.diffPct}% ${t("expected").toLowerCase()}</div>`);
  showMenu();
  const flagged = a.check.diffPct >= 25;
  const verdict = flagged
    ? t("anomaly", { u: units, e: a.check.expected, a: amount, pct: a.check.diffPct })
    : t("fair", { u: units, e: a.check.expected, a: amount });
  say(text, () => say(verdict, () => say(t("menu"), startListening)));
}

function showMenu() {
  setChoices([
    [t("ch.savings"), doSavings], [t("ch.complaint"), doComplaint],
    [t("ch.solar"), doSolar], [t("ch.family"), doFamily], [t("ch.no"), () => say(t("bye"))],
  ]);
}

function doSavings() {
  state.step = "menu";
  const tips = topTips();
  const total = tips.reduce((n, x) => n + x.rupees, 0);
  const list = tips.map((x, i) => `${i + 1}. ${T[state.lang].tips[x.key]} (₹${x.rupees})`).join(" ");
  addCard(`<h3>${t("savingsCard")}</h3><div class="amount"><span class="big">₹${total}</span><span class="meta">/ month</span></div>` +
    tips.map((x) => `<div class="tip"><span>${T[state.lang].tips[x.key]}</span><b>₹${x.rupees}</b></div>`).join(""));
  say(t("savings", { list, total }), () => ask(t("more")));
}

function doSolar() { state.step = "roof"; setChoices([[t("ch.yes"), () => handleInput(t("ch.yes"))], [t("ch.noo"), () => handleInput(t("ch.noo"))]]); ask(t("ownRoof")); }

function doComplaint() {
  state.step = "complaint";
  const { units, prev, amount } = state.bill;
  state.complaint = t("complaintText", { u: units, p: prev, a: amount });
  addCard(`<h3>✉️</h3><div class="draft">${state.complaint}</div>`);
  setChoices([[t("ch.yes"), () => handleInput(t("ch.yes"))], [t("ch.noo"), () => handleInput(t("ch.noo"))]]);
  ask(t("complaintAsk"));
}

async function saveComplaint() {
  state.step = "menu"; showMenu();
  try {
    const r = await fetch("/api/complaints", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: state.complaint, lang: state.lang, bill: state.bill }),
    });
    const item = await r.json();
    addCard(`<h3>✅ ${item.id}</h3><div class="meta">${item.createdAt.slice(0, 10)}</div>`);
    say(t("complaintDone", { id: item.id }), () => ask(t("more")));
  } catch { say(t("complaintNo"), () => ask(t("more"))); }
}

function doFamily() {
  state.step = "menu";
  const { units, prev, amount } = state.bill;
  const tip = T[state.lang].tips[state.appliance] || "";
  const msg = t("waText", { u: units, p: prev, a: amount, tip });
  addCard(`<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">💬 WhatsApp</a>`);
  say(t("wa"), () => ask(t("more")));
}

// ---------- wiring ----------
let started = false;
$("mic").onclick = () => {
  speechSynthesis.cancel(); retries = 0;
  if (!started) { started = true; $("chat").innerHTML = ""; begin(); } else startListening();
};
$("textform").onsubmit = (e) => {
  e.preventDefault();
  const v = $("textin").value.trim();
  if (!v) return;
  $("textin").value = "";
  stopListening(); speechSynthesis.cancel();
  handleInput(v);
};
document.querySelectorAll(".langs button").forEach((b) => {
  b.onclick = () => { setLang(b.dataset.lang); stopListening(); speechSynthesis.cancel(); $("chat").innerHTML = ""; started = true; begin(); };
});
if (!SR) setStatus(T.en.noMic); else setStatus(T.en.tapMic);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
// Browsers block audio until the user interacts, so wait for the first tap.
addMsg("👋 Tap the mic to begin · माइक दबाइए · માઇક દબાવો", "bot");
