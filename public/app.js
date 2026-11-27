// Tally - voice-first flow. Uses the browser's built-in speech recognition and synthesis (no API keys).
const RATE_PER_UNIT = 5.5; // illustrative marginal rupees per unit, for savings estimates only
const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = { lang: "en", step: "units", bill: {}, appliance: null, complaint: null, busy: false };
let rec = null;
let retries = 0;

function t(key, vars = {}) {
  let s = T[state.lang][key];
  for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
  return s;
}

// ---------- UI helpers ----------
function addMsg(text, who) {
  const d = document.createElement("div");
  d.className = "msg " + who;
  d.textContent = text;
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
  $("cards").appendChild(d);
}
function setStatus(msg) { $("status").textContent = msg; }

// ---------- speech out ----------
function say(text, then) {
  addMsg(text, "bot");
  if (!("speechSynthesis" in window)) { if (then) then(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[state.lang];
  u.rate = 0.9;
  let done = false;
  const finish = () => { if (!done) { done = true; if (then) then(); } };
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
  return m ? Math.round(parseFloat(m[0])) : null;
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
  const diffRupees = Math.round(Math.abs(diffUnits) * RATE_PER_UNIT);
  return { diffUnits, pct, diffRupees, up: diffUnits > 0 };
}
function topTips() {
  // main appliance first, then two general ones, with rupee savings
  const order = [state.appliance, ...Object.keys(APPLIANCES).filter((k) => k !== state.appliance)].slice(0, 3);
  return order.map((k) => ({ key: k, rupees: Math.round(APPLIANCES[k].saveUnits * RATE_PER_UNIT) }));
}

// ---------- conversation ----------
function begin() {
  state.step = "units"; state.bill = {}; state.appliance = null; state.complaint = null;
  $("cards").innerHTML = ""; setChoices([]);
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
  $("cards").innerHTML = "";
  addCard(`<h3>${t("cardBill")}</h3><div class="big">₹${amount}</div>
    <div>${units} ${t("units")} · ${t("prev")}: ${prev} ${t("units")}
    <span class="${a.up ? "up" : "down"}"> ${a.up ? "▲" : "▼"} ${a.pct}%</span></div>`);
  showMenu();
  say(text, () => say(t("menu"), startListening));
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
  addCard(`<h3>${t("savingsCard")}</h3><div class="big">₹${total}</div>` +
    tips.map((x) => `<div>• ${T[state.lang].tips[x.key]} <b>₹${x.rupees}</b></div>`).join(""));
  say(t("savings", { list, total }), () => ask(t("more")));
}

function doSolar() { state.step = "roof"; setChoices([[t("ch.yes"), () => handleInput(t("ch.yes"))], [t("ch.noo"), () => handleInput(t("ch.noo"))]]); ask(t("ownRoof")); }

function doComplaint() {
  state.step = "complaint";
  const { units, prev, amount } = state.bill;
  state.complaint = t("complaintText", { u: units, p: prev, a: amount });
  addCard(`<h3>✉️</h3><div>${state.complaint}</div>`);
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
    addCard(`<h3>✅ ${item.id}</h3><div>${item.createdAt.slice(0, 10)}</div>`);
    say(t("complaintDone", { id: item.id }), () => ask(t("more")));
  } catch { say(t("complaintNo"), () => ask(t("more"))); }
}

function doFamily() {
  state.step = "menu";
  const { units, prev, amount } = state.bill;
  const tip = T[state.lang].tips[state.appliance] || "";
  const msg = t("waText", { u: units, p: prev, a: amount, tip });
  addCard(`<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a>`);
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
addMsg("👋 Tap the 🎤 to begin / माइक दबाइए / માઇક દબાવો", "bot");
