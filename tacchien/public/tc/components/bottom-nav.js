// bottom-nav.js — 3 trụ (glass, ẩn ở TV mode). (shared: import map)
// Rail tiến độ port từ .stage-nav/.nav-progress của hgboard: vệt cam cho biết
// đang đứng ở trụ thứ mấy trong 3 trụ.
import { html } from "../lib/dom.js";

const ITEMS = [
  { path: "/", icon: "fa-chart-line", label: "Báo cáo" },
  { path: "/giamsat", icon: "fa-shield-halved", label: "Giám sát" },
  { path: "/hanhdong", icon: "fa-list-check", label: "Hành động", badge: true, alias: ["/signals"] },
];

function activeIndex(activePath) {
  return ITEMS.findIndex((it) => it.path === activePath || (it.alias || []).includes(activePath));
}

export function navHTML(activePath) {
  const idx = activeIndex(activePath);
  const progress = idx < 0 ? 0 : ((idx + 1) / ITEMS.length) * 100;
  return html`
    <div class="tc-nav-progress" aria-hidden="true"><i style="width:${progress}%"></i></div>
    ${ITEMS.map(
      (it, i) => html`
      <a href="#${it.path}" class="tc-nav-item ${i === idx ? "tc-active" : ""}">
        <span class="tc-nav-icon-wrap"><i class="fas ${it.icon}"></i>${it.badge ? html`<span class="tc-nav-badge" data-nav-badge hidden></span>` : ""}</span>
        <span>${it.label}</span>
      </a>`
    )}`;
}
