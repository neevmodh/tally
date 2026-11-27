// End-to-end browser test. Needs the app running on :3000 and Playwright: npm i playwright (not a project dependency).

const { chromium } = require("playwright");
const OUT = require("os").tmpdir(); // screenshots land here
const errors = [];
let fails = 0;
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fails++; };

async function setup(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    // headless Chrome has no working speech recognition/synthesis: stub synthesis so the flow advances, keep typed input path
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 30);
    window.speechSynthesis.cancel = () => {};
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return page;
}
const type = async (page, text) => { await page.fill("#textin", text); await page.press("#textin", "Enter"); await page.waitForTimeout(250); };
const botMsgs = (page) => page.$$eval("#chat .msg.bot .b", (n) => n.map((x) => x.textContent));

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });

  // ---- mobile light, full English flow
  const m = await setup(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", permissions: [] });
  await m.goto("http://localhost:3000/");
  ok("title is Tally", (await m.title()) === "Tally");
  ok("hero visible before start", await m.isVisible("#hero"));
  await m.screenshot({ path: OUT + "/1-hero-mobile.png" });
  await m.click("#mic"); await m.waitForTimeout(400);
  ok("hero hidden after start", !(await m.isVisible("#hero")));
  ok("stepper visible", await m.isVisible("#steps"));
  ok("greeting spoken", (await botMsgs(m)).some((t) => t.includes("Namaste")));
  await type(m, "three hundred twenty");
  await type(m, "250");
  await type(m, "2400");
  ok("confirm step asked", (await botMsgs(m)).some((t) => t.includes("Is that right")));
  await type(m, "yes");
  await type(m, "AC");
  await m.waitForTimeout(1200);
  ok("bill card rendered", await m.isVisible(".card .big"));
  ok("amount shown", (await m.textContent(".card .big")).includes("2400"));
  ok("warning verdict for inflated bill", await m.isVisible(".verdict.warn"));
  ok("bars animate to width", (await m.$$eval(".bar .fill", (n) => n.every((x) => parseFloat(x.style.width) > 0))));
  ok("stepper at last stage", (await m.$$eval("#steps li.done", (n) => n.length)) >= 5);
  const noH = await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok("no horizontal overflow on mobile", noH);
  await m.screenshot({ path: OUT + "/2-bill-mobile.png", fullPage: true });
  const labels = await m.$$eval("#choices button", (n) => n.map((b) => b.textContent.trim()));
  ok("menu buttons have labels: " + labels.join(" | "), labels.length === 5 && labels.every((l) => l.length > 2 && l !== "undefined"));
  await m.click("#choices button:nth-child(1)"); await m.waitForTimeout(500);   // tap "Savings tips" instead of typing
  ok("tapping Savings tips button works", (await m.$$(".tip")).length === 3);
  const lastCardInView = await m.evaluate(() => { const c = [...document.querySelectorAll("#chat .card")].pop(); const r = c.getBoundingClientRect(); return r.top < window.innerHeight; });
  ok("newest card scrolled into view", lastCardInView);
  ok("savings tips rendered", (await m.$$(".tip")).length === 3);
  await m.click("#choices button:nth-child(2)"); await m.waitForTimeout(400);    // tap "File complaint"
  ok("complaint draft shown", await m.isVisible(".draft"));
  const yn = await m.$$eval("#choices button", (n) => n.map((b) => b.textContent.trim()));
  ok("yes/no buttons labelled: " + yn.join(" | "), yn.length === 2 && yn.every((l) => l.length > 0 && l !== "undefined"));
  await m.click("#choices button:nth-child(1)"); await m.waitForTimeout(800);   // tap "Yes"
  const saved = await (await fetch("http://localhost:3000/api/complaints")).json();
  ok("complaint saved on server", saved.length >= 1 && saved.at(-1).text.includes("2400"));
  await m.screenshot({ path: OUT + "/3-actions-mobile.png", fullPage: true });
  await m.click("#choices button:nth-child(4)"); await m.waitForTimeout(400);   // tap "Send to family"
  ok("whatsapp link", (await m.$$eval("a.btn", (n) => n.map((a) => a.href))).some((h) => h.startsWith("https://wa.me/?text=")));

  // ---- Hindi switch by script
  await m.click('.langs button[data-lang="hi"]'); await m.waitForTimeout(400);
  ok("hindi greeting after toggle", (await botMsgs(m)).some((t) => t.includes("नमस्ते")));
  await type(m, "तीन सौ बीस");
  ok("hindi number words accepted", (await botMsgs(m)).some((t) => t.includes("पिछले महीने")));
  await m.screenshot({ path: OUT + "/4-hindi-mobile.png" });

  // ---- Gujarati
  await m.click('.langs button[data-lang="gu"]'); await m.waitForTimeout(400);
  ok("gujarati greeting", (await botMsgs(m)).some((t) => t.includes("નમસ્તે")));
  await type(m, "320"); await type(m, "250"); await type(m, "900"); await type(m, "હા");
  ok("gujarati yes accepted -> appliance question", (await botMsgs(m)).some((t) => t.includes("એસી")));
  await m.screenshot({ path: OUT + "/5-gujarati-mobile.png" });

  // ---- bad input handling
  const b = await setup(browser, { viewport: { width: 390, height: 844 } });
  await b.goto("http://localhost:3000/"); await b.click("#mic"); await b.waitForTimeout(300);
  await type(b, "blah blah");
  ok("non-number re-prompts", (await botMsgs(b)).some((t) => t.includes("did not catch a number")));

  // ---- desktop dark
  const d = await setup(browser, { viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
  await d.goto("http://localhost:3000/");
  await d.screenshot({ path: OUT + "/6-hero-desktop-dark.png" });
  await d.click("#mic"); await d.waitForTimeout(300);
  for (const v of ["320", "250", "2400", "yes", "geyser"]) await type(d, v);
  await d.waitForTimeout(1200);
  await d.screenshot({ path: OUT + "/7-bill-desktop-dark.png" });
  ok("dark theme applied", (await d.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== "rgb(243, 247, 246)");

  // ---- PWA + API
  ok("manifest served", (await (await fetch("http://localhost:3000/manifest.json")).json()).name === "Tally");
  ok("service worker registered", await d.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));

  const real = errors.filter((e) => !/speech|net::ERR|favicon/i.test(e));
  ok("no page/console errors (" + real.length + ")", real.length === 0);
  if (real.length) console.log(real.join("\n"));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL E2E PASSED");
  process.exit(fails ? 1 : 0);
})();
