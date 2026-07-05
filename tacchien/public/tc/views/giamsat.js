// views/giamsat.js — Trụ 2: Hệ thống giám sát (bảng chỉ số an toàn, read-only).
import { call } from "../lib/api.js";
import { html, setHTML } from "../lib/dom.js";
import { relTime } from "../lib/format.js";
import { viewBanner } from "../components/banner.js";

const STATE_LABEL = { green: "OK", amber: "Cảnh báo", red: "Nguy", blue: "Theo dõi", off: "Tắt" };

export async function render({ container }) {
  setHTML(container, html`<div class="tc-skeleton" style="height:200px"></div>`);
  let d;
  try {
    d = await call("tacchien.api.giamsat.get_giamsat");
  } catch (e) {
    setHTML(container, html`<div class="tc-empty"><div class="tc-empty-icon">⚠️</div>
      <div class="tc-empty-title">Lỗi tải giám sát</div><div>${e.message || e}</div></div>`);
    return;
  }
  const s = d.summary;
  setHTML(
    container,
    html`
      ${viewBanner({ title: "Giám sát an toàn", subtitle: "Trạng thái các chỉ số — bấm để xử lý", badge: `${s.checks_off} tắt` })}
      <div class="tc-kpi-grid">
        <div class="tc-kpi-card"><div class="tc-kpi-label">Nguy (P1)</div><div class="tc-kpi-value tc-txt-danger">${s.P1 || 0}</div></div>
        <div class="tc-kpi-card"><div class="tc-kpi-label">Cảnh báo (P2)</div><div class="tc-kpi-value">${s.P2 || 0}</div></div>
        <div class="tc-kpi-card"><div class="tc-kpi-label">Theo dõi (P3)</div><div class="tc-kpi-value">${s.P3 || 0}</div></div>
        <div class="tc-kpi-card"><div class="tc-kpi-label">Kiểm tra lỗi</div><div class="tc-kpi-value">${s.checks_failing || 0}</div></div>
      </div>
      ${(d.domains || []).map(domainCard)}`
  );
  if (window.APP) window.APP.setActionBadge((s.P1 || 0) + (s.P2 || 0));
}

function domainCard(dom) {
  const rollup = dom.max_sev ? "tc-cell-" + dom.max_sev.toLowerCase() : "tc-cell-clean";
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head">
      <span class="tc-label">${dom.domain}</span>
      <span class="tc-pill ${rollup}">${dom.open ? dom.open + " mở" : "sạch"}</span>
    </div>
    ${dom.indicators.length
      ? html`<div class="tc-ind-list">${dom.indicators.map((i) => indicator(i, dom.domain))}</div>`
      : html`<div class="tc-text-muted">Chưa có rule giám sát cho mảng này.</div>`}
  </div>`;
}

function indicator(i, domain) {
  const href = `#/hanhdong?pillar=giam_sat&domain=${encodeURIComponent(domain)}`;
  return html`<a class="tc-ind-row" href="${i.open ? href : "javascript:void 0"}">
    <span class="tc-dot tc-dot-${i.state}" title="${STATE_LABEL[i.state] || i.state}"></span>
    <span class="tc-ind-main">
      <span class="tc-ind-title">${i.title}${i.has_error ? html`<span class="tc-txt-danger"> · lỗi kiểm tra</span>` : ""}</span>
      <span class="tc-ind-meta">${i.rule_code} · ${i.schedule}${i.last_run ? " · chạy " + relTime(i.last_run) : " · chưa chạy"}</span>
    </span>
    ${i.open ? html`<span class="tc-pill tc-sev-${(i.max_sev || "p3").toLowerCase()}">${i.open}</span>` : html`<span class="tc-ind-ok">✓</span>`}
  </a>`;
}
