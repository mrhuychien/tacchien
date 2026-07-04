// views/domain.js — #/domain/:name: metric mảng + signals + link desk.
import { call } from "../lib/api.js";
import { html, setHTML } from "../lib/dom.js";
import { formatVNDShort, formatNumber, relTime } from "../lib/format.js";
import { viewBanner } from "../components/banner.js";

function deskUrl(dt, name) {
  if (!dt || !name) return null;
  return "/app/" + dt.toLowerCase().replace(/ /g, "-") + "/" + encodeURIComponent(name);
}

export async function render({ container, params }) {
  const domain = params.name;
  setHTML(container, html`<div class="tc-skeleton" style="height:200px"></div>`);
  let d;
  try {
    d = await call("tacchien.api.domain.get_domain", { domain });
  } catch (e) {
    setHTML(container, html`<div class="tc-empty"><div class="tc-empty-icon">⚠️</div>
      <div class="tc-empty-title">Lỗi tải mảng</div><div>${e.message || e}</div></div>`);
    return;
  }
  setHTML(
    container,
    html`
      ${viewBanner({ title: domain, subtitle: `${d.signals.length} tín hiệu mở`, badge: d.deep ? "Chi tiết" : "" })}
      ${detailBlock(d)}
      ${signalsBlock(d.signals)}`
  );
}

function detailBlock(d) {
  if (d.deep === "finance") return finance(d.detail);
  if (d.deep === "inventory") return inventory(d.detail);
  if (d.deep === "sales") return sales(d.detail);
  return "";
}

function finance(dt) {
  const aging = dt.aging || [];
  return html`
    <div class="tc-card tc-mt-3">
      <div class="tc-card-head"><span class="tc-label">Công nợ theo khách (top 15)</span></div>
      <table class="tc-table">
        <thead><tr><th>Khách</th><th>Trong hạn</th><th>1-30</th><th>31-60</th><th>60+</th><th>Tổng</th></tr></thead>
        <tbody>
          ${aging.length ? aging.map((r) => html`
            <tr>
              <td data-label="Khách"><strong>${r.customer}</strong></td>
              <td data-label="Trong hạn">${formatVNDShort(r.current)}</td>
              <td data-label="1-30">${formatVNDShort(r.d30)}</td>
              <td data-label="31-60">${formatVNDShort(r.d60)}</td>
              <td data-label="60+"><span class="${r.d60p > 0 ? "tc-txt-danger" : ""}">${formatVNDShort(r.d60p)}</span></td>
              <td data-label="Tổng"><strong>${formatVNDShort(r.total)}</strong></td>
            </tr>`) : emptyRow(6)}
        </tbody>
      </table>
    </div>
    ${miniSeries("Tiền về 7 ngày", dt.cash_7d)}`;
}

function inventory(dt) {
  return html`
    ${listCard("Tồn âm", dt.negative, (r) => html`<strong>${r.item_code}</strong> @ ${r.warehouse}
      <span class="tc-txt-danger">${formatNumber(r.actual_qty)}</span>`)}
    ${listCard("Dưới định mức", dt.below_reorder, (r) => html`<strong>${r.item}</strong> @ ${r.warehouse}
      — tồn ${formatNumber(r.proj)} / định mức ${formatNumber(r.lvl)}`)}`;
}

function sales(dt) {
  const chans = Object.entries(dt.by_channel || {});
  return html`
    <div class="tc-card tc-mt-3">
      <div class="tc-card-head"><span class="tc-label">Doanh thu hôm nay theo kênh</span></div>
      <div class="tc-chan-row">
        ${chans.length ? chans.map(([k, v]) => html`<div class="tc-chan"><div class="tc-label">${k}</div>
          <div class="tc-kpi-value">${formatVNDShort(v)}</div></div>`) : html`<div class="tc-text-muted">—</div>`}
      </div>
    </div>
    ${miniSeries("Doanh thu 7 ngày", dt.rev_7d)}`;
}

function miniSeries(label, rows) {
  rows = rows || [];
  const max = Math.max(1, ...rows.map((r) => Number(r.v) || 0));
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">${label}</span></div>
    <div class="tc-bars">
      ${rows.length ? rows.map((r) => html`
        <div class="tc-bar-col">
          <div class="tc-bar" style="height:${Math.round((Number(r.v) / max) * 100)}%"></div>
          <div class="tc-bar-lbl">${String(r.d).slice(5)}</div>
          <div class="tc-bar-val">${formatVNDShort(r.v)}</div>
        </div>`) : html`<div class="tc-text-muted">Không có dữ liệu</div>`}
    </div>
  </div>`;
}

function listCard(label, rows, rowFn) {
  rows = rows || [];
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">${label} (${rows.length})</span></div>
    ${rows.length
      ? html`<div class="tc-list">${rows.map((r) => html`<div class="tc-list-row">${rowFn(r)}</div>`)}</div>`
      : html`<div class="tc-text-muted">— sạch —</div>`}
  </div>`;
}

function signalsBlock(signals) {
  if (!signals || !signals.length) {
    return html`<div class="tc-card tc-mt-3"><div class="tc-empty"><div class="tc-empty-icon">✅</div>
      <div class="tc-empty-title">Không có tín hiệu mở</div></div></div>`;
  }
  return html`<div class="tc-card tc-mt-3">
    <div class="tc-card-head"><span class="tc-label">Tín hiệu của mảng</span></div>
    <div class="tc-feed">
      ${signals.map((r) => {
        const url = deskUrl(r.ref_doctype, r.ref_name);
        return html`<div class="tc-feed-row">
          <span class="tc-pill tc-sev-${r.severity.toLowerCase()}">${r.severity}</span>
          <span class="tc-feed-main">
            <span class="tc-feed-title">${r.title}${(r.occurrence_count || 1) > 1 ? html`<span class="tc-feed-x"> ×${r.occurrence_count}</span>` : ""}</span>
            <span class="tc-feed-meta">${r.status} · ${relTime(r.last_seen || r.creation)}${url ? html` · <a class="tc-link" href="${url}" target="_blank" rel="noopener">mở chứng từ ↗</a>` : ""}</span>
          </span>
        </div>`;
      })}
    </div>
  </div>`;
}

function emptyRow(cols) {
  return html`<tr><td colspan="${cols}" class="tc-text-muted">— sạch —</td></tr>`;
}
