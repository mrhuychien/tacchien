// views/overview.js — #/ Tổng quan (view động, nạp qua withV).
import { call } from "../lib/api.js";
import { html, setHTML, raw } from "../lib/dom.js";
import { formatVNDShort, formatNumber, relTime } from "../lib/format.js";

const CLUSTERS = [
  { key: "Dau vao & nha may", label: "Đầu vào & nhà máy" },
  { key: "Dau ra & thi truong", label: "Đầu ra & thị trường" },
  { key: "Nen tang", label: "Nền tảng" },
];

let chart = null;
let chartLibP = null;

export async function render({ container }) {
  const data = await call("tacchien.api.overview.get_overview");
  setHTML(container, template(data));
  drawSparkline(data.sparkline);
}

function template(d) {
  const m = d.metrics;
  return html`
    ${healthStrip(d.health)}
    <div class="tc-kpi-grid">
      ${kpi("Doanh thu hôm nay", formatVNDShort(m.revenue_today), channelSub(m.revenue_by_channel))}
      ${kpi("Tiền về hôm nay", formatVNDShort(m.cash_in_today), "Payment Entry Receive")}
      ${kpi("Đơn mới hôm nay", formatNumber(m.new_orders), "SO + hoá đơn POS")}
      ${signalsKpi(m.signals_open)}
    </div>
    <div class="tc-card tc-mt-3">
      <div class="tc-card-head"><span class="tc-label">Doanh thu 14 ngày vs TB cùng thứ</span></div>
      <div class="tc-chart-wrap"><canvas id="tc-spark"></canvas></div>
    </div>
    ${feed(d.feed)}`;
}

function healthStrip(cells) {
  return html`<div class="tc-health">
    ${CLUSTERS.map((c) => {
      const items = cells.filter((x) => x.cluster === c.key);
      return html`
        <div class="tc-health-cluster">
          <div class="tc-label tc-health-cluster-label">${c.label}</div>
          <div class="tc-health-grid">
            ${items.map(healthCell)}
          </div>
        </div>`;
    })}
  </div>`;
}

function healthCell(x) {
  const cls = x.max_sev ? "tc-cell-" + x.max_sev.toLowerCase() : "tc-cell-clean";
  const href = "#/domain/" + encodeURIComponent(x.domain);
  return html`
    <a class="tc-health-cell ${cls}" href="${href}" title="${x.domain}">
      <span class="tc-health-name">${x.domain}</span>
      <span class="tc-health-count">${x.count ? x.count : ""}</span>
    </a>`;
}

function kpi(label, value, sub) {
  return html`<div class="tc-kpi-card">
    <div class="tc-kpi-label">${label}</div>
    <div class="tc-kpi-value">${value}</div>
    ${sub ? html`<div class="tc-kpi-sub">${sub}</div>` : ""}
  </div>`;
}

function signalsKpi(s) {
  return html`<div class="tc-kpi-card">
    <div class="tc-kpi-label">Tín hiệu mở</div>
    <div class="tc-kpi-badges">
      <span class="tc-pill tc-sev-p1">P1 ${s.P1 || 0}</span>
      <span class="tc-pill tc-sev-p2">P2 ${s.P2 || 0}</span>
      <span class="tc-pill tc-sev-p3">P3 ${s.P3 || 0}</span>
    </div>
  </div>`;
}

function channelSub(byChannel) {
  const parts = Object.entries(byChannel || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${formatVNDShort(v)}`);
  return parts.length ? parts.join(" · ") : "—";
}

function feed(rows) {
  if (!rows || !rows.length) {
    return html`<div class="tc-card tc-mt-3"><div class="tc-empty">
      <div class="tc-empty-icon">📭</div><div class="tc-empty-title">Chưa có tín hiệu</div></div></div>`;
  }
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">Tín hiệu mới nhất</span>
      <a class="tc-link" href="#/signals">Xem tất cả</a></div>
    <div class="tc-feed">
      ${rows.map((r) => html`
        <a class="tc-feed-row" href="#/domain/${encodeURIComponent(r.domain)}">
          <span class="tc-pill tc-sev-${r.severity ? r.severity.toLowerCase() : "none"}">${r.severity || ""}</span>
          <span class="tc-feed-main">
            <span class="tc-feed-title">${r.title}${(r.occurrence_count || 1) > 1 ? html`<span class="tc-feed-x"> ×${r.occurrence_count}</span>` : ""}</span>
            <span class="tc-feed-meta">${r.domain} · ${relTime(r.creation)}</span>
          </span>
        </a>`)}
    </div>
  </div>`;
}

function loadChartLib() {
  if (window.Chart) return Promise.resolve();
  if (chartLibP) return chartLibP;
  chartLibP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return chartLibP;
}

async function drawSparkline(sp) {
  if (!sp || !sp.labels) return;
  await loadChartLib();
  const canvas = document.getElementById("tc-spark");
  if (!canvas) return;
  if (chart) { chart.destroy(); chart = null; } // destroy trước khi vẽ lại (chống leak)
  const labels = sp.labels.map((d) => d.slice(5)); // mm-dd
  chart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Doanh thu", data: sp.revenue, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,.12)", fill: true, tension: 0.3, pointRadius: 0 },
        { label: "TB cùng thứ", data: sp.avg_same_weekday, borderColor: "#94a3b8", borderDash: [4, 4], fill: false, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { ticks: { callback: (v) => formatVNDShort(v) } } },
    },
  });
}
