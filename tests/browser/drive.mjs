import { chromium } from "playwright-core";

const EXE = process.env.TC_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const errs = [];
const log = [];

const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  // Bỏ qua tài nguyên CDN bị proxy chặn (socket.io) + favicon 404 — không phải lỗi code.
  if (/Failed to load resource|ERR_TUNNEL|favicon/.test(t)) return;
  errs.push("console: " + t);
});

function check(name, cond) {
  log.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

// 1) Overview
await page.goto("http://127.0.0.1:8123/#/", { waitUntil: "load" });
await page.waitForTimeout(1200);
const healthCells = await page.locator(".tc-health-cell").count();
check("health strip có 13 ô", healthCells === 13);
const p1cells = await page.locator(".tc-cell-p1").count();
check("có ô P1 (đỏ)", p1cells >= 1);
const kpiVals = await page.locator(".tc-kpi-value").count();
check("KPI tiles render (>=3)", kpiVals >= 3);
const revText = await page.locator(".tc-kpi-value").first().textContent();
check('doanh thu format "tỷ" (' + revText + ")", /tỷ/.test(revText));
const feedRows = await page.locator(".tc-feed-row").count();
check("feed có dòng", feedRows >= 2);
const header = await page.locator(".tc-header-title").textContent();
check('header title = "Tổng quan" (' + header + ")", /Tổng quan/.test(header));
const navActive = await page.locator(".tc-nav-item.tc-active").count();
check("bottom-nav có item active", navActive === 1);

// 2) #/signals: feed + filter + Ack optimistic
await page.goto("http://127.0.0.1:8123/#/signals", { waitUntil: "load" });
await page.waitForTimeout(800);
const sigCards = await page.locator(".tc-sig-card").count();
check("#/signals render 2 card", sigCards === 2);
const filters = await page.locator("select[data-filter]").count();
check("filter bar 3 select", filters === 3);
// Ack card đầu → status đổi thành Acked (optimistic + mock)
await page.click('.tc-sig-card[data-row="SIG-00001"] [data-do="ack"]');
await page.waitForTimeout(400);
const st = await page.locator('.tc-sig-card[data-row="SIG-00001"] [data-status]').textContent();
check("Ack đổi status → Acked (" + st + ")", /Acked/.test(st));

// 2b) #/bophan
await page.goto("http://127.0.0.1:8123/#/bophan", { waitUntil: "load" });
await page.waitForTimeout(700);
const deptRows = await page.locator(".tc-table tbody tr").count();
check("#/bophan có 4 hàng bộ phận", deptRows === 4);
const redPill = await page.locator(".tc-flow-red").count();
check("#/bophan có pill 'Tắc' (đỏ)", redPill >= 1);

// 2c) #/domain/:name (Tài chính, deep)
await page.goto("http://127.0.0.1:8123/#/domain/T%C3%A0i%20ch%C3%ADnh%20%C2%B7%20d%C3%B2ng%20ti%E1%BB%81n", { waitUntil: "load" });
await page.waitForTimeout(700);
const banner = await page.locator(".tc-view-banner-title").textContent();
check("#/domain banner = tên mảng (" + banner + ")", /Tài chính/.test(banner));
const agingRows = await page.locator(".tc-table tbody tr").count();
check("#/domain aging table render", agingRows >= 1);
const domSignals = await page.locator(".tc-feed-row").count();
check("#/domain signals list render", domSignals >= 1);

// 3) TV mode ẩn nav
await page.goto("http://127.0.0.1:8123/#/?tv=1", { waitUntil: "load" });
await page.waitForTimeout(800);
const navDisplay = await page.evaluate(() => {
  const n = document.getElementById("tc-bottom-nav");
  return n ? getComputedStyle(n).display : "missing";
});
check("TV mode ẩn bottom-nav", navDisplay === "none");

// 4) Route lạ → self-heal (reload 1 lần) rồi về #/
let loads = 0;
page.on("load", () => loads++);
await page.goto("http://127.0.0.1:8123/#/khong-ton-tai", { waitUntil: "load" });
await page.waitForTimeout(1500);
const finalHash = await page.evaluate(() => location.hash);
check("route lạ self-heal về #/ (" + finalHash + ")", finalHash === "#/" || finalHash === "");

check("KHÔNG có pageerror/console error", errs.length === 0);

console.log(log.join("\n"));
if (errs.length) console.log("\nERRORS:\n" + errs.join("\n"));
await browser.close();
process.exit(log.some((l) => l.startsWith("FAIL")) || errs.length ? 1 : 0);
