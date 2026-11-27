// End-to-end browser test. Needs the app on :3000 and Playwright (npm i playwright; not a project dependency).
const { chromium } = require("playwright");
const OUT = require("os").tmpdir();
const errors = []; let fails = 0;
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fails++; };

async function setup(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { // headless Chrome has no working speech: stub synthesis so the flow advances; typed input stays real
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 20);
    window.speechSynthesis.cancel = () => {};
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return page;
}
const say = (p, text) => p.fill("#textin", text).then(() => p.press("#textin", "Enter")).then(() => p.waitForTimeout(250));
const caption = (p) => p.textContent("#say");
async function toDashboard(p, appliance = "AC") {
  await p.click("#mic"); await p.waitForTimeout(300);
  for (const v of ["three hundred twenty", "250", "2400", "yes", appliance]) await say(p, v);
  await p.waitForTimeout(1600);
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });

  // ===== mobile, light
  const m = await setup(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
  await m.goto("http://localhost:3000/");
  ok("title is Tally", (await m.title()) === "Tally");
  ok("hero caption shown", (await caption(m)).includes("Talk to your"));
  ok("orb button visible", await m.isVisible("#mic canvas"));
  await m.waitForTimeout(400);
  const drawn = await m.$eval("#orb", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; });
  ok("orb canvas actually drawn (" + drawn + " px)", drawn > 5000);
  await m.screenshot({ path: OUT + "/c1-landing-mobile.png" });

  await toDashboard(m);
  ok("x-ray panel present", await m.isVisible("#panel-xray"));
  ok("donut has legend rows", (await m.$$("#panel-xray .legend li")).length >= 5);
  ok("donut arcs animated in", await m.$$eval("#panel-xray .donut circle[data-len]", (n) => n.length > 0 && n.every((c) => parseFloat(c.getAttribute("stroke-dasharray")) > 0)));
  ok("gauge needle rotated", await m.$eval(".needle", (n) => n.style.transform.includes(n.dataset.angle)));
  ok("warning verdict for inflated bill", await m.isVisible("#panel-xray .verdict.warn"));
  ok("what-if panel with 5 sliders", (await m.$$("#panel-whatif input[type=range]")).length === 5);
  ok("steps tracker at dashboard", (await m.$$eval("#steps li.done", (n) => n.length)) === 5);
  ok("5 voice hint chips", (await m.$$("#hints button")).length === 5);
  ok("no horizontal overflow", await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await m.screenshot({ path: OUT + "/c2-dashboard-mobile.png", fullPage: true });

  const before = await m.textContent("#wi-total");
  await m.$eval('input[data-k="geyser"]', (el) => { el.value = 3; el.dispatchEvent(new Event("input", { bubbles: true })); });
  const after = await m.textContent("#wi-total");
  ok(`moving geyser slider changes saving (${before} -> ${after})`, before !== after);

  await m.click("#hints button:nth-child(1)"); await m.waitForTimeout(400);
  ok("chip sets AC slider to 1h", await m.$eval('input[data-k="ac"]', (e) => e.value === "1"));
  await say(m, "cooler two hours less");
  ok("typed voice command sets cooler 2h", await m.$eval('input[data-k="cooler"]', (e) => e.value === "2"));
  ok("spoken reply mentions rupees", (await caption(m)).includes("rupees"));

  await say(m, "solar"); await m.waitForTimeout(500);
  ok("solar panel shown", await m.isVisible("#panel-solar"));
  const pb2 = await m.textContent("#solar-kv div:nth-child(4) b");
  await m.$eval("#solar-kw", (el) => { el.value = 3; el.dispatchEvent(new Event("input", { bubbles: true })); });
  const pb3 = await m.textContent("#solar-kv div:nth-child(4) b");
  ok(`solar slider updates payback (${pb2} -> ${pb3})`, pb2 !== pb3);
  ok("no [object Object] on the page", !(await m.textContent("body")).includes("[object Object]"));
  ok("solar slider shows kW unit", (await m.textContent("#sk")).includes("kW"));
  ok("solar subsidy 78,000 at 3kW", (await m.textContent("#solar-kv")).includes("78,000"));

  await say(m, "savings"); ok("savings panel with 3 tips", (await m.$$("#panel-savings .tip")).length === 3);
  await say(m, "complaint"); await m.waitForTimeout(300);
  ok("letter panel", await m.isVisible("#panel-letter .letter"));
  await m.click("#lt-save"); await m.waitForTimeout(600);
  ok("complaint saved with reference", /BS-\d+/.test(await m.textContent("#lt-ref")));
  const saved = await (await fetch("http://localhost:3000/api/complaints")).json();
  ok("server stored the complaint", saved.at(-1).text.includes("2400"));
  const [dl] = await Promise.all([m.waitForEvent("download"), m.click("#lt-dl")]);
  ok("letter downloads as txt", dl.suggestedFilename() === "tally-complaint.txt");
  await say(m, "family");
  ok("whatsapp link", (await m.$$eval("#panel-family a", (n) => n.map((a) => a.href))).some((h) => h.startsWith("https://wa.me/?text=")));
  ok("transcript logs the conversation", (await m.$$("#log li")).length > 10);
  await m.screenshot({ path: OUT + "/c3-actions-mobile.png", fullPage: true });

  // ===== Hindi + Gujarati
  await m.click('.langs button[data-lang="hi"]'); await m.waitForTimeout(300);
  ok("hindi greeting", (await caption(m)).includes("नमस्ते"));
  await say(m, "तीन सौ बीस"); ok("hindi number words", (await caption(m)).includes("पिछले महीने"));
  await say(m, "250"); await say(m, "2400"); await say(m, "हाँ"); await say(m, "एसी"); await m.waitForTimeout(1600);
  ok("hindi dashboard built", await m.isVisible("#panel-xray"));
  ok("hindi panel title", (await m.textContent("#panel-xray h3")).includes("एक्स-रे"));
  await say(m, "सोलर"); ok("hindi solar command", await m.isVisible("#panel-solar"));
  await m.screenshot({ path: OUT + "/c4-hindi-mobile.png", fullPage: true });
  await m.click('.langs button[data-lang="gu"]'); await m.waitForTimeout(300);
  ok("gujarati greeting", (await caption(m)).includes("નમસ્તે"));
  for (const v of ["320", "250", "900", "હા", "એસી"]) await say(m, v);
  await m.waitForTimeout(1600);
  ok("gujarati dashboard built", (await m.textContent("#panel-xray h3")).includes("એક્સ-રે"));
  await m.screenshot({ path: OUT + "/c5-gujarati-mobile.png", fullPage: true });

  // ===== bad input + restart
  const b = await setup(browser, { viewport: { width: 390, height: 844 } });
  await b.goto("http://localhost:3000/"); await b.click("#mic"); await b.waitForTimeout(300);
  await say(b, "blah blah");
  ok("non-number re-prompts", (await caption(b)).includes("did not catch a number"));
  for (const v of ["320", "250", "900", "yes", "fridge"]) await say(b, v);
  await b.waitForTimeout(1600);
  ok("fair bill gets the green verdict", await b.isVisible("#panel-xray .verdict.ok"));
  await say(b, "start again"); await b.waitForTimeout(300);
  ok("restart clears dashboard", (await b.$$(".panel")).length === 0 && (await caption(b)).includes("Namaste"));

  // ===== desktop dark
  const d = await setup(browser, { viewport: { width: 1360, height: 860 }, colorScheme: "dark" });
  await d.goto("http://localhost:3000/");
  await d.screenshot({ path: OUT + "/c6-landing-desktop-dark.png" });
  await toDashboard(d, "geyser");
  const box = async (s) => (await d.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width }; }));
  const st = await box("#stage"), pn = await box("#panels");
  ok("desktop is two columns (stage left of panels)", st.x + st.w <= pn.x + 2);
  ok("dark theme applied", (await d.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(8, 18, 16)");
  await say(d, "solar"); await d.waitForTimeout(500);
  await d.screenshot({ path: OUT + "/c7-dashboard-desktop-dark.png", fullPage: true });

  // ===== PWA + API
  ok("manifest served", (await (await fetch("http://localhost:3000/manifest.json")).json()).name === "Tally");
  ok("service worker registered", await d.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  const real = errors.filter((e) => !/speech|net::ERR|favicon|getUserMedia|NotAllowed/i.test(e));
  ok("no page/console errors (" + real.length + ")", real.length === 0);
  if (real.length) console.log(real.join("\n"));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL E2E PASSED");
  process.exit(fails ? 1 : 0);
})();
