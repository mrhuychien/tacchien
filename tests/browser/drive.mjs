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

// Bấm chồng khi request đang bay phải bị CHẶN THẬT (opacity đơn thuần không chặn
// được click → từng gây lệch UI/DB im lặng: DB Acked nhưng UI đã xoá thẻ).
await page.goto(BASE + "/#/hanhdong", { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const orig = window.fetch;
  window.fetch = async (...a) => {
    if (String(a[0]).includes("act_on_signal")) await new Promise((r) => setTimeout(r, 600));
    return orig(...a);
  };
});
const busy = await page.evaluate(async () => {
  const card = document.querySelector('.tc-sig-card[data-row="SIG-00001"]');
  card.querySelector('[data-do="resolve"]').click();
  await new Promise((r) => setTimeout(r, 120));
  const actions = card.querySelector("[data-actions]");
  return {
    cls: actions.classList.contains("tc-busy"),
    disabled: card.querySelector('[data-do="ack"]').disabled === true,
    pe: getComputedStyle(actions).pointerEvents,
  };
});
check("hành động đang chạy chặn được bấm chồng", busy.cls && busy.disabled && busy.pe === "none");
await page.waitForTimeout(900);

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

// ── Lớp giao diện (reskin hgboard) ──
// Các check dưới đây gác đúng 2 lỗi CSS đã từng lọt: reset `a{color:inherit}` nuốt
// màu component, và overlay bám modifier dùng chung tràn ra ngoài component.
await page.goto(BASE + "/#/", { waitUntil: "load" });
await page.waitForTimeout(1300);

const chrome = await page.evaluate(() => {
  const g = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
  const rail = document.querySelector(".tc-nav-progress i");
  return {
    brand: !!document.querySelector(".tc-brand-mark"),
    live: document.querySelector("[data-live]")?.dataset.state || null,
    eyebrow: !!document.querySelector(".tc-view-banner-eyebrow"),
    railWidth: rail ? Math.round(parseFloat(getComputedStyle(rail).width) / parseFloat(getComputedStyle(rail.parentElement).width) * 100) : null,
    linkColor: g("a.tc-link", "color"),
    navRestColor: g("a.tc-nav-item:not(.tc-active)", "color"),
    cellColor: g("a.tc-health-cell.tc-cell-p2", "color"),
    appBg: g(".tc-app", "backgroundColor"),
  };
});
check("brand mark hiện ở route gốc", chrome.brand);
check("đèn live có trạng thái thật (" + chrome.live + ")", chrome.live === "ok");
check("banner có eyebrow", chrome.eyebrow);
check("lưới mảng có dải legend khoá màu", (await page.locator(".tc-legend i").count()) === 4);
check("rail tiến độ = 1/3 ở trụ Báo cáo (" + chrome.railWidth + "%)", chrome.railWidth === 33);
// nếu `.tc-app a{color:inherit}` quay lại, 3 giá trị dưới sẽ đều thành rgb(21,53,47)
check("màu .tc-link không bị reset <a> nuốt (" + chrome.linkColor + ")", chrome.linkColor === "rgb(13, 77, 66)");
check("màu .tc-nav-item không bị nuốt (" + chrome.navRestColor + ")", chrome.navRestColor === "rgb(74, 97, 92)");
check("màu ô mức P2 không bị nuốt (" + chrome.cellColor + ")", chrome.cellColor === "rgb(116, 82, 10)");

await page.goto(BASE + "/#/giamsat", { waitUntil: "load" });
await page.waitForTimeout(900);
const overlay = await page.evaluate(() => {
  const pill = document.querySelector(".tc-pill.tc-cell-p1");
  const rail = document.querySelector(".tc-nav-progress i");
  return {
    pillAfter: pill ? getComputedStyle(pill, "::after").content : "no-pill",
    railWidth: rail ? Math.round(parseFloat(getComputedStyle(rail).width) / parseFloat(getComputedStyle(rail.parentElement).width) * 100) : null,
  };
});
check("vòng nhấp nháy KHÔNG rò ra pill rollup (" + overlay.pillAfter + ")", overlay.pillAfter === "none");
check("rail = 2/3 ở trụ Giám sát (" + overlay.railWidth + "%)", overlay.railWidth === 67);

// ── Lưu đồ xưởng (#/luodo) ──
await page.goto(BASE + "/#/luodo", { waitUntil: "load" });
await page.waitForTimeout(1600);
const lo = await page.evaluate(() => {
  const hs = [...document.querySelectorAll(".tc-lo-hotspot")];
  const cls = (i) => (hs[i] ? [...hs[i].classList].find((c) => c.startsWith("tc-lo-h-")) : null);
  const canvas = document.querySelector(".tc-lo-canvas");
  return {
    hotspots: hs.length,
    legend: document.querySelectorAll(".tc-lo-legend span i").length,
    badge: document.querySelector(".tc-view-banner-badge")?.textContent.trim(),
    // mock: Kho·tồn·HSD P1 → công đoạn 01 và 10
    s01: cls(0), s10: cls(9),
    // mock: Sản xuất rules_on=0 → 02/03/05/06 PHẢI là unwatched, KHÔNG được clean
    s02: cls(1), s03: cls(2), s06: cls(5),
    // mock: Chất lượng·FSMS P3 → 04/07/08/09
    s04: cls(3),
    bg: getComputedStyle(canvas).backgroundImage,
    domChips: document.querySelectorAll("[data-lo-active] .tc-lo-dom").length,
    navBtns: document.querySelectorAll(".tc-lo-nav-btn").length,
  };
});
check("lưu đồ: 10 hotspot", lo.hotspots === 10);
check("lưu đồ: legend 5 trạng thái", lo.legend === 5);
check("lưu đồ: ảnh nền nạp được (webp)", /production-flow\.webp/.test(lo.bg));
check("lưu đồ: 10 nút chọn công đoạn", lo.navBtns === 10);
check("lưu đồ: badge = 2 công đoạn nguy + nêu điểm mù (" + lo.badge + ")",
  /2 công đoạn nguy/.test(lo.badge || "") && /chưa canh/.test(lo.badge || ""));
check("lưu đồ: công đoạn 01 & 10 đỏ theo signal P1 của Kho", lo.s01 === "tc-lo-h-p1" && lo.s10 === "tc-lo-h-p1");
check("lưu đồ: công đoạn 04 xanh biển theo P3 của Chất lượng", lo.s04 === "tc-lo-h-p3");
// Guard chống "xanh giả": mảng Sản xuất không có rule nào bật thì công đoạn
// phụ thuộc nó KHÔNG được tô xanh, dù 0 signal.
check("lưu đồ: công đoạn chưa có rule ra 'chưa giám sát', KHÔNG xanh giả",
  lo.s02 === "tc-lo-h-unwatched" && lo.s03 === "tc-lo-h-unwatched" && lo.s06 === "tc-lo-h-unwatched");
check("lưu đồ: thẻ công đoạn liệt kê mảng đang gác", lo.domChips === 2);
// Đếm chip là chưa đủ: một lần sửa hụt đã làm mọi chip in "chưa có rule" trong
// khi mock cho rules_ok=3. Phải soi ĐÚNG CHỮ.
const chipTexts = await page.evaluate(() =>
  [...document.querySelectorAll("[data-lo-active] .tc-lo-dom")].map((e) => e.textContent.trim()));
check("lưu đồ: chip mảng có rule + có tín hiệu ghi đúng số (" + chipTexts[0] + ")",
  /Kho · tồn · HSD · 3 \(1 đã ack\)/.test(chipTexts[0] || ""));
check("lưu đồ: chip mảng có rule mà sạch ghi 'sạch' (" + chipTexts[1] + ")",
  /Mua hàng · NCC · sạch/.test(chipTexts[1] || ""));

// aria-current phải là token hợp lệ. html`` escape dấu nháy nên nội suy CẢ cụm
// attribute (`aria-current="true"`) sẽ render thành aria-current='"true"'.
const ariaVals = await page.evaluate(() => ({
  luodo: document.querySelector(".tc-lo-nav-btn.tc-active")?.getAttribute("aria-current"),
  nav: null,
}));
check("lưu đồ: aria-current là token hợp lệ (" + ariaVals.luodo + ")", ariaVals.luodo === "true");

// Rule BẬT nhưng đang lỗi thì không phải "đang canh": công đoạn phải là
// "chưa giám sát", tuyệt đối không xanh. Ép payload rồi đi qua update().
const loFail = await page.evaluate(async () => {
  const orig = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).includes("get_luodo")) {
      return { ok: true, status: 200, json: async () => ({ message: { domains: {
        "Sản xuất":          { count:0, open:0, acked:0, max_sev:null, rules:2, rules_on:2, rules_failing:0, rules_ok:2 },
        "Tài sản · bảo trì": { count:0, open:0, acked:0, max_sev:null, rules:1, rules_on:1, rules_failing:1, rules_ok:0 },
        "Kho · tồn · HSD":   { count:0, open:0, acked:0, max_sev:null, rules:1, rules_on:1, rules_failing:0, rules_ok:1 },
        "Mua hàng · NCC":    { count:0, open:0, acked:0, max_sev:null, rules:1, rules_on:1, rules_failing:0, rules_ok:1 },
        "Chất lượng · FSMS": { count:0, open:0, acked:0, max_sev:null, rules:1, rules_on:1, rules_failing:0, rules_ok:1 },
        "Vận chuyển":        { count:0, open:0, acked:0, max_sev:null, rules:1, rules_on:1, rules_failing:0, rules_ok:1 }
      } } }) };
    }
    return orig(u, o);
  };
  await window.APP.refresh();
  await new Promise((r) => setTimeout(r, 400));
  const cls = (i) => [...document.querySelector(`.tc-lo-hotspot[data-lo-stage="${i}"]`).classList]
    .find((c) => c.startsWith("tc-lo-h-"));
  window.fetch = orig;
  return { s02: cls(1), s01: cls(0), badge: document.querySelector(".tc-view-banner-badge")?.textContent.trim() };
});
// 02 = Sản xuất (ok) + Tài sản·bảo trì (bật nhưng LỖI) → không được xanh
check("lưu đồ: rule bật-nhưng-lỗi KHÔNG tính là đang canh (" + loFail.s02 + ")",
  loFail.s02 === "tc-lo-h-unwatched");
// 01 = Kho + Mua hàng, cả hai rule chạy được và sạch → mới được xanh
check("lưu đồ: mọi mảng canh được và sạch thì mới xanh (" + loFail.s01 + ")",
  loFail.s01 === "tc-lo-h-clean");
check("lưu đồ: badge nêu số công đoạn mù (" + loFail.badge + ")", /chưa canh/.test(loFail.badge || ""));

await page.goto(BASE + "/#/luodo", { waitUntil: "load" });
await page.waitForTimeout(1400);

// Poll 60s KHÔNG được dựng lại overlay: dựng lại làm mọi animateMotion (SMIL)
// nhảy về đầu đường mỗi phút. shell.js phải đi qua update() của view.
const loPoll = await page.evaluate(async () => {
  const before = document.querySelector("[data-lo-svg]");
  await window.APP.refresh();
  await new Promise((r) => setTimeout(r, 500));
  return { giuNguyenSvg: before === document.querySelector("[data-lo-svg]"),
           conHotspot: document.querySelectorAll(".tc-lo-hotspot").length };
});
check("lưu đồ: poll cập nhật tại chỗ, không dựng lại overlay",
  loPoll.giuNguyenSvg && loPoll.conHotspot === 10);

// prefers-reduced-motion phải dừng CẢ hạt SMIL. @media chỉ tắt được CSS animation
// nên riêng chỗ này phải tắt bằng JS (svg.pauseAnimations).
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(BASE + "/#/luodo", { waitUntil: "load" });
await page.waitForTimeout(1500);
const loRM = await page.evaluate(async () => {
  const pos = () => { const d = document.querySelector(".tc-lo-particle"); const m = d && d.getCTM && d.getCTM();
                      return m ? Math.round(m.e) + "," + Math.round(m.f) : "n/a"; };
  const a = pos();
  await new Promise((r) => setTimeout(r, 1000));
  return { truoc: a, sau: pos() };
});
check("lưu đồ: reduced-motion dừng cả hạt SMIL (" + loRM.truoc + " → " + loRM.sau + ")",
  loRM.truoc === loRM.sau && loRM.truoc !== "n/a");
await page.emulateMedia({ reducedMotion: "no-preference" });
await page.goto(BASE + "/#/luodo", { waitUntil: "load" });
await page.waitForTimeout(1500);

await page.click('.tc-lo-nav-btn[data-lo-stage="3"]');
await page.waitForTimeout(400);
const loPick = await page.evaluate(async () => {
  const t = document.querySelector("[data-lo-active] strong")?.textContent.trim();
  const pos = () => { const d = document.querySelector(".tc-lo-particle"); const m = d && d.getCTM && d.getCTM();
                      return m ? Math.round(m.f) : null; };
  const a = pos();
  await new Promise((r) => setTimeout(r, 900));
  return { title: t, banDoConChay: a !== pos() };
});
check("lưu đồ: bấm công đoạn 04 đổi thẻ (" + loPick.title + ")", /Ủ nguội/.test(loPick.title || ""));
// Chọn thủ công dừng BĂNG CHUYỀN nhưng KHÔNG đóng băng bản đồ — chính chuyển động
// đó tạo cảm giác "dây chuyền đang sống" cho 2-giây test.
check("lưu đồ: chọn công đoạn không đóng băng bản đồ", loPick.banDoConChay === true);

// Lớp nền: KHÔNG được là pseudo-element fixed (nó nằm ở stacking context gốc và
// phủ luôn navbar/footer của templates/web.html — đã đo bằng pixel).
const bgLayer = await page.evaluate(() => {
  const app = document.querySelector(".tc-app");
  return {
    beforeContent: getComputedStyle(app, "::before").content,
    attach: getComputedStyle(app).backgroundAttachment,
  };
});
check("nền app không dùng lớp fixed phủ ra ngoài .tc-app",
  bgLayer.beforeContent === "none" && bgLayer.attach === "fixed");

await page.goto(BASE + "/#/bophan", { waitUntil: "load" });
await page.waitForTimeout(900);
const bophanNav = await page.evaluate(() => document.querySelector(".tc-nav-item.tc-active")?.textContent.trim() || null);
check("drill-down /bophan vẫn sáng trụ Báo cáo (" + bophanNav + ")", /Báo cáo/.test(bophanNav || ""));

check("KHÔNG có pageerror/console error", errs.length === 0);

console.log(log.join("\n"));
if (errs.length) console.log("\nERRORS:\n" + errs.join("\n"));
await browser.close();
process.exit(log.some((l) => l.startsWith("FAIL")) || errs.length ? 1 : 0);
