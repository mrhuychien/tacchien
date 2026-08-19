import { chromium } from "playwright-core";
const EXE = process.env.TC_CHROME;
const BASE = "http://127.0.0.1:8123";
const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const r = {};
await page.goto(BASE + "/#/luodo", { waitUntil: "load" });
await page.waitForTimeout(1200);

// progress bar css params
r.progressCss = await page.evaluate(() => {
  const bar = document.querySelector(".tc-lo-nav-progress");
  const i = bar.querySelector("i");
  const cb = getComputedStyle(bar), ci = getComputedStyle(i);
  return { height: cb.height, bg: cb.backgroundColor, transition: ci.transitionDuration + " " + ci.transitionTimingFunction, w: i.style.width };
});

// hotspot click works?
await page.click('.tc-lo-hotspot[data-lo-stage="3"] span');
await page.waitForTimeout(250);
r.afterHotspotClick = await page.evaluate(() => document.querySelector(".tc-lo-active-no").textContent.trim());

// re-enable auto: click play twice, then time the advance
await page.click("[data-lo=play]"); await page.waitForTimeout(120);
await page.click("[data-lo=play]"); await page.waitForTimeout(120);
const t0 = Date.now();
const n0 = await page.evaluate(() => document.querySelector(".tc-lo-active-no").textContent.trim());
await page.waitForFunction((prev) => document.querySelector(".tc-lo-active-no").textContent.trim() !== prev, n0, { timeout: 9000 }).catch(()=>{});
r.autoAdvanceMs = Date.now() - t0;
r.autoFrom = n0;
r.autoTo = await page.evaluate(() => document.querySelector(".tc-lo-active-no").textContent.trim());

// ring pulse: which elements animate?
r.rings = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll(".tc-lo-hotspot").forEach((h, i) => {
    const bef = getComputedStyle(h, "::before"), aft = getComputedStyle(h, "::after");
    out.push({ i, cls: h.className.trim(), before: bef.animationName, after: aft.animationName, beforeContent: bef.content });
  });
  return out;
});

// SMIL pause check
r.smil = await page.evaluate(() => {
  const svg = document.querySelector("[data-lo-svg]");
  const a = svg.getCurrentTime();
  return { hasPause: typeof svg.pauseAnimations === "function", t: a, paused: svg.animationsPaused && svg.animationsPaused() };
});
await page.click("[data-lo=play]"); await page.waitForTimeout(400);
r.smilAfterPause = await page.evaluate(() => {
  const svg = document.querySelector("[data-lo-svg]");
  return { paused: svg.animationsPaused(), t1: svg.getCurrentTime() };
});
await page.waitForTimeout(600);
r.smilStillFrozen = await page.evaluate(() => document.querySelector("[data-lo-svg]").getCurrentTime());

// legend content
r.legend = await page.evaluate(() => [...document.querySelectorAll(".tc-lo-legend span")].map(s=>s.textContent.trim()));

// card focus/DOM identity after repaint (outerHTML replace)
r.cardTag = await page.evaluate(() => {
  const c = document.querySelector("[data-lo-active]");
  return { tag: c.tagName, cls: c.className };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
