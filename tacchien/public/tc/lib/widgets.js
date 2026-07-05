// widgets.js — mảnh render dùng chung cho các view (shared: trong import map).
import { html } from "./dom.js";
import { formatVNDShort, formatNumber, relTime } from "./format.js";

export function kpiCard(label, value, sub) {
  return html`<div class="tc-kpi-card">
    <div class="tc-kpi-label">${label}</div>
    <div class="tc-kpi-value">${value}</div>
    ${sub ? html`<div class="tc-kpi-sub">${sub}</div>` : ""}
  </div>`;
}

export function signalsKpi(s) {
  return html`<div class="tc-kpi-card">
    <div class="tc-kpi-label">Tín hiệu mở</div>
    <div class="tc-kpi-badges">
      <span class="tc-pill tc-sev-p1">P1 ${s.P1 || 0}</span>
      <span class="tc-pill tc-sev-p2">P2 ${s.P2 || 0}</span>
      <span class="tc-pill tc-sev-p3">P3 ${s.P3 || 0}</span>
    </div>
  </div>`;
}

export function channelSub(byChannel) {
  const parts = Object.entries(byChannel || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${formatVNDShort(v)}`);
  return parts.length ? parts.join(" · ") : "—";
}

// Ô/thẻ mảng — màu theo max severity signal Open; click ra drill-down.
export function domainCell(x) {
  const cls = x.max_sev ? "tc-cell-" + x.max_sev.toLowerCase() : "tc-cell-clean";
  const href = "#/domain/" + encodeURIComponent(x.domain);
  return html`<a class="tc-health-cell ${cls}" href="${href}" title="${x.domain}">
    <span class="tc-health-name">${x.domain}</span>
    <span class="tc-health-count">${x.count ? x.count : ""}</span>
  </a>`;
}

export function feedCard(rows, title, seeAllHref) {
  if (!rows || !rows.length) {
    return html`<div class="tc-card tc-mt-3"><div class="tc-empty">
      <div class="tc-empty-icon">📭</div><div class="tc-empty-title">Chưa có tín hiệu</div></div></div>`;
  }
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">${title}</span>
      ${seeAllHref ? html`<a class="tc-link" href="${seeAllHref}">Xem tất cả</a>` : ""}</div>
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

let _chartLibP = null;
export function loadChartLib() {
  if (window.Chart) return Promise.resolve();
  if (_chartLibP) return _chartLibP;
  _chartLibP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _chartLibP;
}

// Vẽ line chart doanh thu vs TB; trả instance để caller destroy khi vẽ lại.
export async function drawSparkline(canvasId, sp, prev) {
  if (!sp || !sp.labels) return null;
  await loadChartLib();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (prev) prev.destroy();
  return new window.Chart(canvas, {
    type: "line",
    data: {
      labels: sp.labels.map((d) => d.slice(5)),
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

export { formatVNDShort, formatNumber, relTime };
