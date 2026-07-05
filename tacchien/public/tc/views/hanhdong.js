// views/hanhdong.js — Trụ 3: Hệ thống hành động (hàng đợi mọi signal mở).
import { call } from "../lib/api.js";
import { html, setHTML } from "../lib/dom.js";
import { relTime } from "../lib/format.js";
import { showToast } from "../components/toast.js";
import { viewBanner } from "../components/banner.js";
import { replaceQuery } from "../lib/router.js";

const SEVERITIES = ["P1", "P2", "P3"];
const STATUSES = ["Open", "Acked", "Resolved", "Muted"];
const PILLARS = [
  { key: "giam_sat", label: "Giám sát" },
  { key: "bao_cao", label: "Báo cáo" },
];
const MUTE_PRESETS = [
  { key: "1h", label: "1 giờ" },
  { key: "1d", label: "1 ngày" },
  { key: "1w", label: "1 tuần" },
];

let S = {};

export async function render({ container, query }) {
  S = {
    container,
    filters: {
      severity: query.severity || "",
      domain: query.domain || "",
      status: query.status || "",
      pillar: query.pillar || "",
      user: query.user || "",
      page: parseInt(query.page || "1", 10),
    },
    data: null,
    bound: false,
  };
  bind();
  await load();
}

async function load() {
  const f = S.filters;
  setHTML(S.container, html`<div class="tc-skeleton" style="height:200px"></div>`);
  try {
    S.data = await call("tacchien.api.signals.get_signals", {
      severity: f.severity, domain: f.domain, status: f.status, pillar: f.pillar,
      user: f.user, page: f.page, page_size: 20,
    });
  } catch (e) {
    setHTML(S.container, html`<div class="tc-empty"><div class="tc-empty-icon">⚠️</div>
      <div class="tc-empty-title">Lỗi tải hành động</div><div>${e.message || e}</div></div>`);
    return;
  }
  paint();
}

function paint() {
  const d = S.data;
  const f = S.filters;
  const pages = Math.max(1, Math.ceil(d.total / d.page_size));
  setHTML(
    S.container,
    html`
      ${viewBanner({ title: "Hành động", subtitle: `${d.total} việc cần xử lý`, badge: `Trang ${f.page}/${pages}` })}
      <div class="tc-card tc-filter-bar">
        ${sel("pillar", "Trụ", PILLARS.map((p) => p.key), f.pillar, "Tất cả", PILLARS)}
        ${sel("severity", "Mức", SEVERITIES, f.severity)}
        ${sel("domain", "Mảng", d.domains, f.domain)}
        ${sel("status", "Trạng thái", STATUSES, f.status, "Open+Acked")}
      </div>
      <div class="tc-signals-list tc-mt-3">
        ${d.rows.length ? d.rows.map(rowCard) : html`<div class="tc-empty"><div class="tc-empty-icon">✅</div><div class="tc-empty-title">Không có việc khớp lọc</div></div>`}
      </div>
      ${pager(f.page, pages)}`
  );
}

function sel(name, label, options, value, allLabel = "Tất cả", labeled) {
  const lbl = (o) => (labeled ? (labeled.find((x) => x.key === o) || {}).label || o : o);
  return html`<label class="tc-filter-field">
    <span class="tc-label">${label}</span>
    <select data-filter="${name}">
      <option value="" ${value ? "" : "selected"}>${allLabel}</option>
      ${options.map((o) => html`<option value="${o}" ${value === o ? "selected" : ""}>${lbl(o)}</option>`)}
    </select>
  </label>`;
}

function rowCard(r) {
  const closed = r.status === "Resolved" || r.status === "Muted";
  const pillarLabel = r.pillar === "bao_cao" ? "Báo cáo" : "Giám sát";
  return html`<div class="tc-card tc-sig-card" data-row="${r.name}">
    <div class="tc-sig-head">
      <span class="tc-pill tc-sev-${r.severity.toLowerCase()}">${r.severity}</span>
      <span class="tc-sig-title">${r.title}${(r.occurrence_count || 1) > 1 ? html`<span class="tc-feed-x"> ×${r.occurrence_count}</span>` : ""}</span>
      <span class="tc-badge-status tc-st-${r.status.toLowerCase()}" data-status>${r.status}</span>
    </div>
    <div class="tc-sig-meta">${pillarLabel} · ${r.domain}${r.source_rule ? " · " + r.source_rule : ""}${r.user ? " · " + r.user : ""} · ${relTime(r.last_seen || r.creation)}</div>
    ${r.description ? html`<div class="tc-sig-desc">${r.description}</div>` : ""}
    <div class="tc-sig-actions" data-actions>
      ${closed
        ? html`<button class="tc-btn tc-btn-ghost" data-sig="${r.name}" data-do="reopen">Mở lại</button>`
        : html`
          <button class="tc-btn" data-sig="${r.name}" data-do="ack">Ack</button>
          <button class="tc-btn tc-btn-primary" data-sig="${r.name}" data-do="resolve">Resolve</button>
          <span class="tc-mute-wrap">
            <button class="tc-btn tc-btn-ghost" data-sig="${r.name}" data-do="mute-menu">Mute ▾</button>
            <span class="tc-mute-menu" hidden>
              ${MUTE_PRESETS.map((p) => html`<button class="tc-mute-opt" data-sig="${r.name}" data-do="mute" data-preset="${p.key}">${p.label}</button>`)}
            </span>
          </span>`}
    </div>
  </div>`;
}

function pager(page, pages) {
  if (pages <= 1) return "";
  return html`<div class="tc-pager">
    <button class="tc-pager-btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Trước</button>
    <span class="tc-pager-info">Trang ${page}/${pages}</span>
    <button class="tc-pager-btn" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Sau ›</button>
  </div>`;
}

function bind() {
  if (S.bound) return;
  S.bound = true;
  S.container.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-filter]");
    if (!s) return;
    S.filters[s.dataset.filter] = s.value;
    S.filters.page = 1;
    syncUrl();
    load();
  });
  S.container.addEventListener("click", (e) => onClick(e));
}

function syncUrl() {
  const f = S.filters;
  const q = {};
  ["severity", "domain", "status", "pillar", "user"].forEach((k) => f[k] && (q[k] = f[k]));
  if (f.page > 1) q.page = f.page;
  replaceQuery(q);
}

async function onClick(e) {
  const pageBtn = e.target.closest(".tc-pager-btn");
  if (pageBtn && !pageBtn.disabled) {
    S.filters.page = parseInt(pageBtn.dataset.page, 10);
    syncUrl();
    return load();
  }
  const btn = e.target.closest("[data-do]");
  if (!btn) return;
  const doIt = btn.dataset.do;
  const name = btn.dataset.sig;
  if (doIt === "mute-menu") {
    const menu = btn.parentElement.querySelector(".tc-mute-menu");
    if (menu) menu.hidden = !menu.hidden;
    return;
  }
  await act(name, doIt, btn.dataset.preset);
}

async function act(name, action, preset) {
  const card = S.container.querySelector(`[data-row="${name}"]`);
  const actions = card ? card.querySelector("[data-actions]") : null;
  if (actions) actions.style.opacity = "0.5";
  try {
    const res = await call("tacchien.api.signals.act_on_signal", { name, action, mute_preset: preset || null });
    showToast(`${name} → ${res.status}`, "success");
    if (S.filters.status && res.status !== S.filters.status) {
      await load();
    } else if (!S.filters.status && (res.status === "Resolved" || res.status === "Muted")) {
      if (card) card.remove();
    } else {
      updateCard(card, res);
    }
  } catch (e) {
    if (actions) actions.style.opacity = "";
    showToast("Lỗi: " + (e.message || e), "error");
    load();
  }
}

function updateCard(card, res) {
  if (!card) return;
  const st = card.querySelector("[data-status]");
  if (st) {
    st.textContent = res.status;
    st.className = "tc-badge-status tc-st-" + res.status.toLowerCase();
  }
  const actions = card.querySelector("[data-actions]");
  if (actions) actions.style.opacity = "";
}
