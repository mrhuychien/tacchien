// views/luodo.js — Lưu đồ xưởng (port nguyên từ hgboard, nối tín hiệu sống).
//
// Ảnh nền + toàn bộ overlay SVG (6 dòng nguyên liệu, hạt chạy, cụm máy hoạt động,
// hotspot 10 công đoạn, thẻ chi tiết, thanh chọn) giữ đúng như app/flow-map.tsx của
// hgboard. Khác một điểm: hotspot KHÔNG còn trang trí — nó tô theo max severity của
// các mảng nghiệp vụ mà công đoạn đó phụ thuộc, lấy từ tacchien.api.luodo.get_luodo.
import { call } from "../lib/api.js";
import { html, setHTML } from "../lib/dom.js";
import { viewBanner } from "../components/banner.js";

// ── Bảng neo công đoạn → mảng nghiệp vụ ──────────────────────────────────────
// ĐÂY LÀ CHỖ DUY NHẤT cần sửa khi muốn đổi cách quy trách nhiệm cho công đoạn.
// Toạ độ x/y (%) và metric giữ nguyên của hgboard vì chúng bám ảnh nền.
const STAGES = [
  { number: "01", name: "Kho đỗ", detail: "Xuất đỗ nguyên liệu vào dây chuyền", metric: "Đầu vào", x: 81, y: 44,
    domains: ["Kho · tồn · HSD", "Mua hàng · NCC"] },
  { number: "02", name: "Luộc đỗ", detail: "Đỗ được luộc chín ở nhiệt độ sôi", metric: "100 kg · 20 phút", x: 90, y: 18,
    domains: ["Sản xuất", "Tài sản · bảo trì"] },
  { number: "03", name: "Rang đỗ", detail: "Ba máy rang vận hành theo dòng chảy", metric: "3 × 120 kg/giờ", x: 73, y: 18,
    domains: ["Sản xuất", "Tài sản · bảo trì"] },
  { number: "04", name: "Ủ nguội", detail: "Đỗ được phủ kín trong thùng gỗ", metric: "24 giờ", x: 56, y: 18,
    domains: ["Sản xuất", "Chất lượng · FSMS"] },
  { number: "05", name: "Vỡ đỗ", detail: "Chà vỏ, sàng, hút bụi và tách kim loại", metric: "2 tấn/7 giờ", x: 46, y: 18,
    domains: ["Sản xuất", "Tài sản · bảo trì"] },
  { number: "06", name: "Xay nghiền", detail: "Nghiền đỗ thành bột mịn", metric: "≤ 0,2 mm", x: 36, y: 18,
    domains: ["Sản xuất", "Tài sản · bảo trì"] },
  { number: "07", name: "Phối trộn", detail: "Bột đỗ gặp đường hoán tại máy trộn", metric: "114 kg/mẻ", x: 33.5, y: 44,
    domains: ["Sản xuất", "Chất lượng · FSMS"] },
  { number: "08", name: "Ủ · Cán", detail: "Ủ kín rồi cán bột thành trạng thái tơi xốp", metric: "24 giờ · 15 phút", x: 57, y: 44,
    domains: ["Sản xuất", "Chất lượng · FSMS"] },
  { number: "09", name: "Tạo viên · Đóng gói", detail: "Bánh chạy liên tục qua cụm máy đóng gói", metric: "20 máy · 50 viên/phút", x: 64, y: 63,
    domains: ["Sản xuất", "Chất lượng · FSMS", "Tài sản · bảo trì"] },
  { number: "10", name: "Vào hộp", detail: "Kiểm tra, vào hộp và chuyển tới kho thành phẩm", metric: "Thành phẩm", x: 64, y: 75,
    domains: ["Kho · tồn · HSD", "Vận chuyển"] },
];

// Các điểm gấp đặt theo đúng sơ đồ mũi tên của xưởng (toạ độ theo viewBox 1680×941).
const PATHS = {
  bean: "M1552 421 V160 H619 V387",
  sugar: "M341 725 H399 V171 H512 V381",
  oil: "M300 418 H500",
  cake: "M628 425 H881 V520 H1328 V608 H531 V705 H1405 V809",
  powder: "M642 106 H256",
  powderOut: "M303 283 H363 V819 H634",
};

const SEV_RANK = { P1: 3, P2: 2, P3: 1 };
const AUTO_MS = 5200;

// ⚠️ @media (prefers-reduced-motion) chỉ tắt được CSS animation/transition.
// Hạt trên lưu đồ là SMIL (<animateMotion>) nên CSS KHÔNG chạm tới — đã đo:
// với reduce, animationDuration về 1e-05s mà hạt vẫn chạy. Phải tắt bằng JS.
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");

function reduced() {
  // Cài đặt hệ điều hành là MẶC ĐỊNH, không phải khoá cứng: người dùng bấm
  // "Tiếp tục" là ý muốn tường minh. Không cho ghi đè thì nhãn nút nói dối.
  return REDUCE.matches && !S.motionOverride;
}

function applyMotionPref() {
  const svg = S.container && S.container.querySelector("[data-lo-svg]");
  if (!svg || !svg.pauseAnimations) return;
  if (reduced() || !S.playing) svg.pauseAnimations();
  else svg.unpauseAnimations();
  syncPlayLabel();
}

// Người dùng đổi cài đặt giảm chuyển động GIỮA CHỪNG: hoạt ảnh dừng nhưng nhãn nút
// vẫn ghi "Tạm dừng" thì nút đang nói dối. Đồng bộ nhãn + băng chuyền theo.
function onReduceChange() {
  applyMotionPref();
  schedule();               // reduce bật → dừng băng chuyền; tắt → cho chạy lại
}

function syncPlayLabel() {
  const btn = S.container && S.container.querySelector("[data-lo=play]");
  if (!btn) return;
  const dangChay = S.playing && !reduced();
  const nhan = dangChay ? "❚❚ Tạm dừng" : "▶ Tiếp tục";
  if (btn.textContent.trim() !== nhan) btn.textContent = nhan;
  const canvas = S.container.querySelector("[data-lo-canvas]");
  if (canvas) canvas.classList.toggle("tc-lo-paused", !dangChay);
}

let S = {};

// #tc-view là node DÙNG CHUNG cho mọi route (shell chỉ thay innerHTML), nên:
//  - listener phải gỡ trong destroy(), nếu không vào lại màn lần 2 là nút Tạm dừng
//    toggle hai lần → triệt tiêu nhau (đo được: 2 listener, bấm không ăn).
//  - mọi await phải kiểm token, nếu không promise của màn cũ vẽ đè lên màn mới.
let MOUNT = 0;
let onClick = null;

// ── Trạng thái công đoạn ─────────────────────────────────────────────────────
// "chưa giám sát" ≠ "sạch": mảng không có rule nào BẬT thì không được tô xanh.
function stageState(stage, domains) {
  let maxSev = null, count = 0, watched = 0, failing = 0;
  const parts = [];
  for (const name of stage.domains) {
    const d = domains[name];
    if (!d) { parts.push({ name, missing: true }); continue; }
    // "đang canh" = có rule CHẠY ĐƯỢC (bật và không lỗi), không phải chỉ "bật".
    const ok = d.rules_ok !== undefined ? d.rules_ok : (d.rules_on || 0);
    if (ok > 0) watched += 1;
    failing += d.rules_failing || 0;
    count += d.count || 0;
    if (SEV_RANK[d.max_sev] > (SEV_RANK[maxSev] || 0)) maxSev = d.max_sev;
    parts.push({
      name, count: d.count || 0, acked: d.acked || 0, max_sev: d.max_sev,
      rules_ok: ok, rules_failing: d.rules_failing || 0,
    });
  }
  // Phòng thủ: có tín hiệu mà không đọc được mức thì KHÔNG được nói "sạch".
  if (count > 0 && !maxSev) {
    console.error("[tc] lưu đồ: công đoạn", stage.number, "có", count, "tín hiệu nhưng max_sev rỗng");
    maxSev = "P3";
  }
  // Chỉ tô XANH khi MỌI mảng gác công đoạn đều có rule đang bật và đều sạch.
  // Chỉ cần một mảng chưa có rule là công đoạn đó chưa thực sự được canh —
  // xanh lúc đó là nói dối, đúng loại lỗi mà đèn "đang giám sát" từng mắc.
  const allWatched = watched === stage.domains.length;
  const state = maxSev ? maxSev.toLowerCase() : (allWatched ? "clean" : "unwatched");
  return { state, maxSev, count, watched, allWatched, failing, parts };
}

const STATE_LABEL = { p1: "Nguy", p2: "Cảnh báo", p3: "Theo dõi", clean: "Sạch", unwatched: "Chưa giám sát" };

export async function render({ container, tv }) {
  const my = ++MOUNT;
  const d = await call("tacchien.api.luodo.get_luodo");
  if (my !== MOUNT) return;   // đã rời màn trong lúc chờ
  const domains = d.domains || {};
  const unknown = [...new Set(STAGES.flatMap((x) => x.domains))].filter((n) => !domains[n]);
  if (unknown.length) {
    // Gõ sai tên mảng trông y hệt "mảng thật chưa có rule" → phải kêu to.
    // Validator tĩnh (scripts/validate_shipped_docs.py) chặn ở khâu ship; đây là
    // lưới thứ hai cho trường hợp seed trên server đổi mà view chưa deploy lại.
    console.error("[tc] lưu đồ: STAGES neo vào mảng không có trong dữ liệu:", unknown);
  }
  S = {
    container,
    domains,
    unknown,
    active: 0,
    playing: !REDUCE.matches,  // chuyển động nền của bản đồ
    motionOverride: false,     // người dùng bấm play → ghi đè cài đặt hệ thống
    auto: true,                // băng chuyền tự đổi công đoạn (khái niệm RIÊNG)
    timer: null,
    tv: !!tv,
  };
  // Mở thẳng vào công đoạn nặng nhất — màn này để phát hiện, không để ngắm.
  // Có công đoạn nguy → dừng BĂNG CHUYỀN để người dùng đọc kỹ, nhưng vẫn để bản
  // đồ chạy: chính chuyển động đó tạo cảm giác "dây chuyền đang sống" cho 2-giây test.
  const worst = worstStage();
  if (worst) { S.active = worst.i; S.auto = false; }

  paint();
  bind();
  schedule();
  applyMotionPref();
  scrollActiveIntoView();
  REDUCE.addEventListener("change", onReduceChange);
}

export function destroy() {
  MOUNT += 1;                 // vô hiệu hoá mọi promise đang bay
  if (S.timer) clearInterval(S.timer);
  S.timer = null;
  REDUCE.removeEventListener("change", onReduceChange);
  if (onClick && S.container) S.container.removeEventListener("click", onClick);
  onClick = null;
}

// Poll 60s gọi hàm này thay vì render lại cả view. Dựng lại overlay = mọi
// animateMotion khởi động lại từ t=0 → đã đo: hạt nhảy vị trí mỗi 60 giây.
// Ở đây chỉ cập nhật phần phụ thuộc dữ liệu, KHÔNG đụng vào <svg>.
export async function update() {
  const my = MOUNT;
  const d = await call("tacchien.api.luodo.get_luodo");
  if (my !== MOUNT) return;
  // Guard: repaintData ghi vào .tc-view-banner-badge — class dùng chung với mọi view.
  if (!S.container || !S.container.querySelector("[data-lo-canvas]")) return;
  const truoc = SEV_RANK[stageState(STAGES[S.active], S.domains).maxSev] || 0;
  S.domains = d.domains || {};
  // P1 mới nổi lên phải KÉO ĐƯỢC SỰ CHÚ Ý — nếu không băng chuyền vẫn thản nhiên
  // quay qua các công đoạn sạch trong khi xưởng đang cháy.
  const worst = worstStage();
  if (worst && worst.rank > truoc) { S.active = worst.i; S.auto = false; schedule(); }
  repaintData();
}

function worstStage() {
  const top = STAGES.map((s, i) => ({ i, rank: SEV_RANK[stageState(s, S.domains).maxSev] || 0 }))
    .sort((a, b) => b.rank - a.rank)[0];
  return top && top.rank > 0 ? top : null;
}

function repaintData() {
  const root = S.container;
  if (!root || !root.querySelector("[data-lo-canvas]")) return;
  STAGES.forEach((stage, i) => {
    const st = stageState(stage, S.domains);
    const hot = root.querySelector(`.tc-lo-hotspot[data-lo-stage="${i}"]`);
    if (hot) {
      hot.className = `tc-lo-hotspot tc-lo-h-${st.state}${i === S.active ? " tc-active" : ""}`;
      hot.setAttribute("aria-label", `${stage.number}. ${stage.name} — ${STATE_LABEL[st.state]}`);
      hot.setAttribute("aria-current", i === S.active ? "true" : "false");
    }
    const nav = root.querySelector(`.tc-lo-nav-btn[data-lo-stage="${i}"]`);
    if (nav) {
      // Mức độ phải nằm trong TÊN KHẢ TRUY CẬP của nút, không chỉ trong title chấm màu.
      nav.setAttribute("aria-label", `${stage.number}. ${stage.name} — ${STATE_LABEL[st.state]}`);
      const dot = nav.querySelector(".tc-dot");
      if (dot) { dot.className = `tc-dot tc-lo-dot-${st.state}`; dot.title = STATE_LABEL[st.state]; }
    }
  });
  const badge = root.querySelector(".tc-view-banner-badge");
  if (badge) badge.textContent = summaryBadge(summary());
  repaintCard();
}

function schedule() {
  if (S.timer) clearInterval(S.timer);
  if (!S.playing || !S.auto || reduced()) return;
  S.timer = setInterval(() => {
    // Đang rê chuột lên khu bản đồ hoặc đang focus trong đó = đang đọc → nhường.
    const wrap = S.container && S.container.querySelector(".tc-lo-stage");
    if (wrap && (wrap.matches(":hover") || wrap.contains(document.activeElement))) return;
    S.active = (S.active + 1) % STAGES.length;
    repaintActive();
  }, AUTO_MS);
}

function summary() {
  const counts = { p1: 0, p2: 0, p3: 0, clean: 0, unwatched: 0 };
  STAGES.forEach((s) => { counts[stageState(s, S.domains).state] += 1; });
  return counts;
}

// Nhãn phải nói đúng điều đang thấy: "sạch" chỉ khi CẢ 10 công đoạn đều được canh.
function summaryBadge(c) {
  // Điểm mù phải LUÔN hiện, kể cả khi đã có sự cố: "1 công đoạn cảnh báo" trong
  // khi 8/10 công đoạn không ai canh là câu nói đúng mà gây hiểu sai.
  const blind = c.unwatched ? ` · ${c.unwatched}/${STAGES.length} chưa canh` : "";
  if (c.p1) return `${c.p1} công đoạn nguy${blind}`;
  if (c.p2) return `${c.p2} công đoạn cảnh báo${blind}`;
  if (c.p3) return `${c.p3} công đoạn theo dõi${blind}`;
  if (c.unwatched === STAGES.length) return "Chưa công đoạn nào được canh";
  if (c.unwatched) return `${c.unwatched}/${STAGES.length} công đoạn chưa canh`;
  return "Dây chuyền sạch";
}

function paint() {
  const c = summary();
  const badge = summaryBadge(c);
  setHTML(
    S.container,
    html`
      ${viewBanner({
        eyebrow: "Lưu đồ xưởng · 01–10",
        title: "Dòng chảy sản xuất",
        subtitle: "Bấm công đoạn để xem mảng nghiệp vụ đang gác nó",
        badge,
      })}
      <div class="tc-card tc-mt-3 tc-lo-card">
        <div class="tc-legend tc-lo-legend">
          <span class="tc-cell-p1"><i></i>Nguy (P1)</span>
          <span class="tc-cell-p2"><i></i>Cảnh báo (P2)</span>
          <span class="tc-cell-p3"><i></i>Theo dõi (P3)</span>
          <span class="tc-cell-clean"><i></i>Sạch</span>
          <span class="tc-cell-unwatched"><i></i>Chưa giám sát</span>
          <button class="tc-btn tc-btn-ghost tc-lo-play" data-lo="play">
            ${S.playing ? "❚❚ Tạm dừng" : "▶ Tiếp tục"}
          </button>
        </div>

        <div class="tc-lo-stage">
          <div class="tc-lo-viewport" data-lo-viewport>
            <div class="tc-lo-canvas ${S.playing ? "" : "tc-lo-paused"}" data-lo-canvas>
              <div class="tc-lo-shade"></div>
              ${overlaySVG()}
              ${STAGES.map((s, i) => hotspot(s, i))}
            </div>
          </div>
          <!-- Thẻ nằm NGOÀI canvas: canvas rộng cố định 980px nên để trong sẽ bị
               cắt mất trên điện thoại. Desktop định vị đè lên bản đồ bằng CSS. -->
          ${activeCard()}
        </div>

        <nav class="tc-lo-nav" aria-label="Chọn công đoạn">
          <div class="tc-lo-nav-progress" aria-hidden="true"><i style="width:${((S.active + 1) / STAGES.length) * 100}%"></i></div>
          ${STAGES.map((s, i) => {
            const st = stageState(s, S.domains);
            // Nội suy GIÁ TRỊ chứ không nội suy cả attribute: html`` escape dấu
            // nháy nên `aria-current="true"` render ra aria-current="&quot;true&quot;".
            return html`<button class="tc-lo-nav-btn ${i === S.active ? "tc-active" : ""}" data-lo-stage="${i}"
              aria-current="${i === S.active ? "true" : "false"}">
              <span class="tc-lo-nav-no">${s.number}</span>
              <strong>${s.name}</strong>
              <em class="tc-dot tc-lo-dot-${st.state}" title="${STATE_LABEL[st.state]}"></em>
            </button>`;
          })}
        </nav>
      </div>`
  );
}

function hotspot(stage, i) {
  const st = stageState(stage, S.domains);
  return html`<button class="tc-lo-hotspot tc-lo-h-${st.state} ${i === S.active ? "tc-active" : ""}"
    style="left:${stage.x}%; top:${stage.y}%" data-lo-stage="${i}"
    aria-current="${i === S.active ? "true" : "false"}"
    aria-label="${stage.number}. ${stage.name} — ${STATE_LABEL[st.state]}">
    <span>${stage.number}</span>
  </button>`;
}

// Nhãn chip mảng: phân biệt rule lỗi / chưa có rule / sạch / đang có tín hiệu.
function domLabel(p) {
  // Số tín hiệu và tình trạng rule là HAI thông tin, không loại trừ nhau: rule bị
  // tắt trong khi signal cũ vẫn Open là trạng thái có thật, không được nuốt số.
  const n = p.count ? (p.acked ? ` · ${p.count} (${p.acked} đã ack)` : ` · ${p.count}`) : "";
  if (p.rules_failing && !p.rules_ok) return `${n} · rule đang lỗi`;
  if (!p.rules_ok) return `${n} · chưa có rule`;
  return n || " · sạch";
}

function domChip(p) {
  if (p.missing) {
    return html`<span class="tc-lo-dom tc-lo-dom-missing" title="Tên mảng trong STAGES không khớp dữ liệu — lỗi cấu hình, không phải trạng thái vận hành">${p.name} · chưa khai mảng</span>`;
  }
  // Chỉ làm mờ khi mảng vừa không canh được VỪA không có tín hiệu nào.
  const dim = !p.rules_ok && !p.count ? "tc-lo-dom-missing" : "";
  return html`<a class="tc-lo-dom ${dim}" href="#/domain/${encodeURIComponent(p.name)}">${p.name}${domLabel(p)}</a>`;
}

function activeCard() {
  const s = STAGES[S.active];
  const st = stageState(s, S.domains);
  return html`<div class="tc-lo-active tc-lo-h-${st.state}" data-lo-active>
    <span class="tc-lo-active-no">${s.number}</span>
    <div class="tc-lo-active-main">
      <small role="status">${STATE_LABEL[st.state]}${st.count ? ` · ${st.count} tín hiệu chưa xong` : ""}${st.failing ? ` · ${st.failing} rule lỗi` : ""}</small>
      <strong>${s.name}</strong>
      <p>${s.detail}</p>
      <div class="tc-lo-domains" data-key="${JSON.stringify(st.parts)}">
        ${st.parts.map(domChip)}
      </div>
    </div>
    <b>${s.metric}</b>
  </div>`;
}

// Overlay giữ nguyên hình học của hgboard; chỉ đổi prefix class sang tc-lo-.
function overlaySVG() {
  const line = (id, kind, d) => html`
    <path id="${id}" class="tc-lo-line tc-lo-line-${kind}" d="${d}" pathLength="1"></path>
    <path class="tc-lo-dashes tc-lo-dashes-${kind}" d="${d}" pathLength="1"></path>`;
  const particle = (pathId, color, dur, delay, r) => html`
    <circle r="${r || 6}" fill="${color}" class="tc-lo-particle">
      <animateMotion dur="${dur}s" begin="${delay || 0}s" repeatCount="indefinite" rotate="auto">
        <mpath href="#${pathId}"></mpath>
      </animateMotion>
    </circle>`;

  return html`
    <svg class="tc-lo-overlay" viewBox="0 0 1680 941" preserveAspectRatio="none" aria-hidden="true" data-lo-svg>
      <defs>
        <filter id="tc-lo-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur>
          <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
        </filter>
      </defs>

      ${line("tc-lo-bean", "bean", PATHS.bean)}
      ${line("tc-lo-sugar", "sugar", PATHS.sugar)}
      ${line("tc-lo-oil", "oil", PATHS.oil)}
      ${line("tc-lo-cake", "cake", PATHS.cake)}
      ${line("tc-lo-powder", "powder", PATHS.powder)}
      ${line("tc-lo-powder-out", "powder", PATHS.powderOut)}

      <g class="tc-lo-machines">
        <g class="tc-lo-loader">
          <path d="M1370 420 H1480"></path>
          <circle class="tc-lo-loader-dot" cx="1370" cy="420" r="5"></circle>
          <circle class="tc-lo-loader-dot tc-lo-loader-dot-b" cx="1370" cy="420" r="4"></circle>
        </g>
        <g class="tc-lo-boiler">
          <ellipse class="tc-lo-heat" cx="1510" cy="178" rx="55" ry="25"></ellipse>
          <path class="tc-lo-steam" d="M1485 135 C1468 112 1498 98 1483 73"></path>
          <path class="tc-lo-steam tc-lo-steam-b" d="M1510 130 C1494 106 1525 93 1512 65"></path>
          <path class="tc-lo-steam tc-lo-steam-c" d="M1535 136 C1520 112 1550 100 1538 78"></path>
        </g>
        <g class="tc-lo-roasters">
          <circle class="tc-lo-ring" cx="1105" cy="162" r="24"></circle>
          <circle class="tc-lo-ring tc-lo-ring-b" cx="1200" cy="162" r="24"></circle>
          <circle class="tc-lo-ring tc-lo-ring-c" cx="1295" cy="162" r="24"></circle>
        </g>
        <g class="tc-lo-cooling">
          <circle class="tc-lo-pulse" cx="875" cy="142" r="27"></circle>
          <circle class="tc-lo-pulse tc-lo-pulse-b" cx="930" cy="142" r="27"></circle>
          <circle class="tc-lo-pulse tc-lo-pulse-c" cx="902" cy="202" r="27"></circle>
        </g>
        <g class="tc-lo-breaker">
          <rect x="742" y="125" width="70" height="95" rx="8"></rect>
          <path d="M754 148 H800 M754 173 H800 M754 198 H800"></path>
        </g>
        <g class="tc-lo-grinder">
          <circle class="tc-lo-grinder-ring" cx="620" cy="170" r="38"></circle>
          <circle class="tc-lo-grinder-core" cx="620" cy="170" r="11"></circle>
        </g>
        <g class="tc-lo-mixer">
          <ellipse class="tc-lo-mixer-ring" cx="560" cy="414" rx="48" ry="26"></ellipse>
          <path class="tc-lo-mixer-blade" d="M522 414 H598 M560 390 V438"></path>
        </g>
        <g class="tc-lo-rollers">
          <circle class="tc-lo-roller" cx="1008" cy="418" r="18"></circle>
          <circle class="tc-lo-roller tc-lo-roller-b" cx="1048" cy="418" r="18"></circle>
          <path d="M990 418 H1066"></path>
        </g>
        <g class="tc-lo-packaging">
          <path class="tc-lo-conveyor" d="M545 608 H1305"></path>
          <rect class="tc-lo-pack" x="545" y="598" width="18" height="14" rx="3"></rect>
          <rect class="tc-lo-pack tc-lo-pack-b" x="545" y="598" width="18" height="14" rx="3"></rect>
          <rect class="tc-lo-pack tc-lo-pack-c" x="545" y="598" width="18" height="14" rx="3"></rect>
        </g>
        <g class="tc-lo-boxing">
          <path class="tc-lo-conveyor" d="M650 705 H1375"></path>
          <rect class="tc-lo-box" x="650" y="693" width="22" height="18" rx="3"></rect>
          <rect class="tc-lo-box tc-lo-box-b" x="650" y="693" width="22" height="18" rx="3"></rect>
        </g>
      </g>

      ${particle("tc-lo-bean", "#ff765f", 48, 0)}
      ${particle("tc-lo-bean", "#ffb2a4", 48, -24, 5)}
      ${particle("tc-lo-sugar", "#ffe08a", 36, 0)}
      ${particle("tc-lo-oil", "#8be9aa", 16, 0)}
      ${particle("tc-lo-cake", "#ff9bd2", 50, 0)}
      ${particle("tc-lo-cake", "#ffd1ea", 50, -25, 5)}
      ${particle("tc-lo-powder", "#9be8ff", 18, 0)}
      ${particle("tc-lo-powder-out", "#9be8ff", 28, -14)}
      <g class="tc-lo-trolley">
        <rect x="-16" y="-8" width="32" height="17" rx="4"></rect>
        <circle cx="-10" cy="12" r="4"></circle><circle cx="10" cy="12" r="4"></circle>
        <animateMotion dur="48s" begin="-12s" repeatCount="indefinite" rotate="auto">
          <mpath href="#tc-lo-bean"></mpath>
        </animateMotion>
      </g>
    </svg>`;
}

// Chỉ vẽ lại phần đổi theo công đoạn — KHÔNG render lại cả overlay, nếu không
// animateMotion khởi động lại và hạt nhảy về đầu đường mỗi 5 giây.
function repaintActive() {
  const root = S.container;
  root.querySelectorAll("[data-lo-stage]").forEach((el) => {
    const on = Number(el.dataset.loStage) === S.active;
    el.classList.toggle("tc-active", on);
    if (el.classList.contains("tc-lo-hotspot")) el.setAttribute("aria-current", on ? "true" : "false");
  });
  const rail = root.querySelector(".tc-lo-nav-progress i");
  if (rail) rail.style.width = ((S.active + 1) / STAGES.length) * 100 + "%";
  repaintCard();
  scrollActiveIntoView();
}

// Cập nhật TẠI CHỖ. Dựng lại thẻ bằng outerHTML huỷ node đang giữ focus → bàn phím
// bị thổi về <body> mỗi 5,2 giây (băng chuyền) và mỗi 60 giây (poll).
function repaintCard() {
  const card = S.container && S.container.querySelector("[data-lo-active]");
  if (!card) return;
  const stage = STAGES[S.active];
  const st = stageState(stage, S.domains);
  const set = (sel, text) => {
    const n = card.querySelector(sel);
    if (n && n.textContent !== text) n.textContent = text;
  };
  card.className = `tc-lo-active tc-lo-h-${st.state}`;
  set(".tc-lo-active-no", stage.number);
  set(".tc-lo-active-main small",
      `${STATE_LABEL[st.state]}${st.count ? ` · ${st.count} tín hiệu chưa xong` : ""}${st.failing ? ` · ${st.failing} rule lỗi` : ""}`);
  set(".tc-lo-active-main strong", stage.name);
  set(".tc-lo-active-main p", stage.detail);
  set("b", stage.metric);
  // Chip chỉ dựng lại khi DỮ LIỆU thực sự đổi — tránh cướp focus khi đang tab qua.
  // So bằng khoá dữ liệu chứ KHÔNG so innerHTML: trình duyệt chuẩn hoá khoảng
  // trắng nên chuỗi vừa sinh không bao giờ khớp innerHTML đã parse.
  const box = card.querySelector(".tc-lo-domains");
  const key = JSON.stringify(st.parts);
  if (box && box.dataset.key !== key) {
    box.innerHTML = String(html`${st.parts.map(domChip)}`);
    box.dataset.key = key;
  }
}

// Bản đồ rộng hơn màn hình (canvas min-width 980px) → tự kéo hotspot đang chọn
// vào giữa khung, nếu không trên điện thoại người dùng không thấy nó ở đâu.
function scrollActiveIntoView() {
  const vp = S.container.querySelector("[data-lo-viewport]");
  const hot = S.container.querySelector(`.tc-lo-hotspot[data-lo-stage="${S.active}"]`);
  if (!vp || !hot || vp.scrollWidth <= vp.clientWidth) return;
  const target = hot.offsetLeft - vp.clientWidth / 2;
  vp.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
}

function bind() {
  if (onClick) S.container.removeEventListener("click", onClick);
  onClick = (ev) => {
    const play = ev.target.closest("[data-lo=play]");
    if (play) {
      S.playing = !S.playing;
      if (S.playing) S.motionOverride = true;   // bấm là muốn thật
      S.auto = S.playing;        // bật lại chuyển động thì bật lại cả băng chuyền
      applyMotionPref();        // tự đồng bộ nhãn + class paused
      schedule();
      return;
    }
    const btn = ev.target.closest("[data-lo-stage]");
    if (!btn) return;
    S.active = Number(btn.dataset.loStage);
    S.auto = false;   // người dùng đã chọn → đừng cướp quyền, nhưng KHÔNG đóng băng bản đồ
    schedule();
    repaintActive();
  };
  S.container.addEventListener("click", onClick);
}
