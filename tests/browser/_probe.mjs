import { chromium } from "playwright-core";
const EXE = process.env.TC_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:8123";
const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e));
page.on("console", m => { if (m.type()==="error") errs.push("console: " + m.text()); });

await page.goto(BASE + "/#/luodo", { waitUntil: "load" });
await page.waitForTimeout(1500);

const r = {};
// A. cardIn animation on active card
r.cardAnim = await page.evaluate(() => {
  const c = document.querySelector(".tc-lo-active");
  if (!c) return "NO CARD";
  const cs = getComputedStyle(c);
  return { animationName: cs.animationName, animationDuration: cs.animationDuration };
});
// B. counts
r.counts = await page.evaluate(() => ({
  lines: document.querySelectorAll(".tc-lo-line").length,
  dashes: document.querySelectorAll(".tc-lo-dashes").length,
  particles: document.querySelectorAll(".tc-lo-particle").length,
  animateMotion: document.querySelectorAll("animateMotion").length,
  hotspots: document.querySelectorAll(".tc-lo-hotspot").length,
  navbtn: document.querySelectorAll(".tc-lo-nav-btn").length,
  trolley: document.querySelectorAll(".tc-lo-trolley").length,
}));
// C. bg image loaded?
r.bg = await page.evaluate(async () => {
  const cv = document.querySelector(".tc-lo-canvas");
  const url = getComputedStyle(cv).backgroundImage;
  const m = /url\("?([^")]+)"?\)/.exec(url);
  if (!m) return { url, ok: false };
  const res = await fetch(m[1]);
  return { url: m[1], status: res.status };
});
// D. aria-current staleness: initial state
r.before = await page.evaluate(() => ({
  active: [...document.querySelectorAll(".tc-lo-nav-btn")].findIndex(b=>b.classList.contains("tc-active")),
  ariaTrue: [...document.querySelectorAll(".tc-lo-nav-btn")].map(b=>b.getAttribute("aria-current")).indexOf("true"),
  progress: document.querySelector(".tc-lo-nav-progress i").style.width,
  hotspotActive: [...document.querySelectorAll(".tc-lo-hotspot")].findIndex(b=>b.classList.contains("tc-active")),
}));
// click stage 5
await page.click('.tc-lo-nav-btn[data-lo-stage="5"]');
await page.waitForTimeout(300);
r.afterClick = await page.evaluate(() => ({
  active: [...document.querySelectorAll(".tc-lo-nav-btn")].findIndex(b=>b.classList.contains("tc-active")),
  ariaTrue: [...document.querySelectorAll(".tc-lo-nav-btn")].map(b=>b.getAttribute("aria-current")).indexOf("true"),
  progress: document.querySelector(".tc-lo-nav-progress i").style.width,
  hotspotActive: [...document.querySelectorAll(".tc-lo-hotspot")].findIndex(b=>b.classList.contains("tc-active")),
  cardNo: document.querySelector(".tc-lo-active-no").textContent.trim(),
}));
// E. pause button once
const btnText = () => page.locator("[data-lo=play]").textContent();
r.playBefore = (await btnText()).trim();
await page.click("[data-lo=play]");
await page.waitForTimeout(200);
r.playAfter1 = (await btnText()).trim();
r.pausedClass1 = await page.evaluate(()=>document.querySelector(".tc-lo-canvas").classList.contains("tc-lo-paused"));
await page.click("[data-lo=play]");
await page.waitForTimeout(200);
r.playAfter2 = (await btnText()).trim();

// F. revisit route twice -> duplicate listener?
await page.goto(BASE + "/#/", { waitUntil: "load" }); await page.waitForTimeout(600);
await page.goto(BASE + "/#/luodo", { waitUntil: "load" }); await page.waitForTimeout(1200);
r.revisit_playBefore = (await btnText()).trim();
await page.click("[data-lo=play]");
await page.waitForTimeout(250);
r.revisit_playAfter = (await btnText()).trim();
r.revisit_pausedClass = await page.evaluate(()=>document.querySelector(".tc-lo-canvas").classList.contains("tc-lo-paused"));

// G. hotspot active vs hover computed style
r.hotspotStyles = await page.evaluate(() => {
  const hs = document.querySelectorAll(".tc-lo-hotspot");
  const act = [...hs].find(h=>h.classList.contains("tc-active")) || hs[0];
  const other = [...hs].find(h=>!h.classList.contains("tc-active"));
  const g = e => { const c = getComputedStyle(e); return { transform: c.transform, bg: c.backgroundColor, cls: e.className }; };
  return { active: g(act), other: g(other) };
});
r.errs = errs;
console.log(JSON.stringify(r, null, 2));
await b.close();
