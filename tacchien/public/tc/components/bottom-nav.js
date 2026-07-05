// bottom-nav.js — 3 trụ (glass, ẩn ở TV mode). (shared: import map)
import { html } from "../lib/dom.js";

const ITEMS = [
  { path: "/", icon: "fa-chart-line", label: "Báo cáo" },
  { path: "/giamsat", icon: "fa-shield-halved", label: "Giám sát" },
  { path: "/hanhdong", icon: "fa-list-check", label: "Hành động", badge: true },
];

export function navHTML(activePath) {
  return html`${ITEMS.map(
    (it) => html`
      <a href="#${it.path}" class="tc-nav-item ${activePath === it.path ? "tc-active" : ""}">
        <span class="tc-nav-icon-wrap"><i class="fas ${it.icon}"></i>${it.badge ? html`<span class="tc-nav-badge" data-nav-badge hidden></span>` : ""}</span>
        <span>${it.label}</span>
      </a>`
  )}`;
}
