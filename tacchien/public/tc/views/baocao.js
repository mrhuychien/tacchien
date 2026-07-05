// views/baocao.js — Trụ 1: Báo cáo hoạt động (màn mặc định).
import { call } from "../lib/api.js";
import { html, setHTML } from "../lib/dom.js";
import {
  kpiCard, signalsKpi, channelSub, feedCard, domainCell, drawSparkline,
  formatVNDShort, formatNumber,
} from "../lib/widgets.js";

const FLOW = { green: "Trôi chảy", amber: "Chậm", red: "Tắc" };
let chart = null;

export async function render({ container }) {
  const d = await call("tacchien.api.baocao.get_baocao");
  const m = d.metrics;
  setHTML(
    container,
    html`
      <div class="tc-kpi-grid">
        ${kpiCard("Doanh thu hôm nay", formatVNDShort(m.revenue_today), channelSub(m.revenue_by_channel))}
        ${kpiCard("Tiền về hôm nay", formatVNDShort(m.cash_in_today), "Payment Entry Receive")}
        ${kpiCard("Đơn mới hôm nay", formatNumber(m.new_orders), "SO + hoá đơn POS")}
        ${signalsKpi(m.signals_open)}
      </div>
      <div class="tc-card tc-mt-3">
        <div class="tc-card-head"><span class="tc-label">Doanh thu 14 ngày vs TB cùng thứ</span></div>
        <div class="tc-chart-wrap"><canvas id="tc-spark"></canvas></div>
      </div>
      ${domainBlock(d.domains)}
      ${bophanBlock(d.bophan)}
      ${feedCard(d.feed, "Diễn biến nghiệp vụ mới", "#/hanhdong?pillar=bao_cao")}`
  );
  chart = await drawSparkline("tc-spark", d.sparkline, chart);
  if (window.APP) window.APP.setActionBadge((m.signals_open.P1 || 0) + (m.signals_open.P2 || 0));
}

function domainBlock(domains) {
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">Mảng nghiệp vụ</span></div>
    <div class="tc-health-grid">${(domains || []).map(domainCell)}</div>
  </div>`;
}

function bophanBlock(b) {
  if (!b || !b.rows) return "";
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">Nhịp bộ phận</span>
      <a class="tc-link" href="#/bophan">Chi tiết</a></div>
    <div class="tc-chan-row">
      ${b.rows.map((r) => html`<div class="tc-chan">
        <div class="tc-label">${r.dept}</div>
        <div><span class="tc-pill tc-flow-${r.status}">${FLOW[r.status] || r.status}</span></div>
        <div class="tc-kpi-sub">${formatNumber(r.today)} hôm nay${r.stuck ? ` · ${r.stuck} tắc` : ""}</div>
      </div>`)}
    </div>
  </div>`;
}
