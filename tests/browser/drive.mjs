import { chromium } from "playwright-core";

const EXE = process.env.TC_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:" + (process.env.TC_PORT || 8123);
const errs = [];
const log = [];

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/Failed to load resource|ERR_TUNNEL|favicon/.test(t)) return;
  errs.push("console: " + t);
});

function check(name, cond) {
  log.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

// ── Trụ 1: Báo cáo (mặc định #/) ──
await page.goto(BASE + "/#/", { waitUntil: "load" });
await page.waitForTimeout(1200);
const header = await page.locator(".tc-header-title").textContent();
check("mặc định = Báo cáo (" + header + ")", /Báo cáo/.test(header));
check("KPI tiles (>=3)", (await page.locator(".tc-kpi-value").count()) >= 3);
const rev = await page.locator(".tc-kpi-value").first().textContent();
check('doanh thu "tỷ" (' + rev + ")", /tỷ/.test(rev));
check("thẻ mảng nghiệp vụ (health-cell)", (await page.locator(".tc-health-cell").count()) >= 3);
check("tóm tắt nhịp bộ phận (chan)", (await page.locator(".tc-chan").count()) >= 1);
check("nav 3 trụ", (await page.locator(".tc-nav-item").count()) === 3);
const badge = await page.locator("[data-nav-badge]").textContent();
check("badge Hành động = P1+P2 = 10 (" + badge + ")", badge === "10");

// ── Trụ 2: Giám sát ──
await page.goto(BASE + "/#/giamsat", { waitUntil: "load" });
await page.waitForTimeout(800);
check("Giám sát: summary tiles", (await page.locator(".tc-kpi-card").count()) >= 4);
check("Giám sát: indicator rows", (await page.locator(".tc-ind-row").count()) >= 2);
check("Giám sát: có dot đỏ", (await page.locator(".tc-dot-red").count()) >= 1);
check("Giám sát: mảng chưa có rule có chú thích", (await page.locator(".tc-text-muted").count()) >= 1);

// ── Trụ 3: Hành động ──
await page.goto(BASE + "/#/hanhdong", { waitUntil: "load" });
await page.waitForTimeout(800);
check("Hành động: 2 card", (await page.locator(".tc-sig-card").count()) === 2);
check("Hành động: 4 filter (có Trụ)", (await page.locator("select[data-filter]").count()) === 4);
await page.click('.tc-sig-card[data-row="SIG-00001"] [data-do="ack"]');
await page.waitForTimeout(400);
const st = await page.locator('.tc-sig-card[data-row="SIG-00001"] [data-status]').textContent();
check("Ack → Acked (" + st + ")", /Acked/.test(st));

// alias #/signals vẫn ra Hành động
await page.goto(BASE + "/#/signals", { waitUntil: "load" });
await page.waitForTimeout(600);
const aliasHeader = await page.locator(".tc-header-title").textContent();
check("alias #/signals → Hành động (" + aliasHeader + ")", /Hành động/.test(aliasHeader));

// ── TV mode + self-heal ──
await page.goto(BASE + "/#/?tv=1", { waitUntil: "load" });
await page.waitForTimeout(700);
const navDisp = await page.evaluate(() => {
  const n = document.getElementById("tc-bottom-nav");
  return n ? getComputedStyle(n).display : "missing";
});
check("TV mode ẩn nav", navDisp === "none");

await page.goto(BASE + "/#/khong-ton-tai", { waitUntil: "load" });
await page.waitForTimeout(1500);
const finalHash = await page.evaluate(() => location.hash);
check("route lạ self-heal về #/ (" + finalHash + ")", finalHash === "#/" || finalHash === "");

check("KHÔNG có pageerror/console error", errs.length === 0);

console.log(log.join("\n"));
if (errs.length) console.log("\nERRORS:\n" + errs.join("\n"));
await browser.close();
process.exit(log.some((l) => l.startsWith("FAIL")) || errs.length ? 1 : 0);
