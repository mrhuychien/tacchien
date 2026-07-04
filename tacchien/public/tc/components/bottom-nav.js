// bottom-nav.js — điều hướng đáy (glass, ẩn ở TV mode). (shared: import map)
import { html } from "../lib/dom.js";

const ITEMS = [
  { path: "/", icon: "fa-gauge-high", label: "Tổng quan" },
  { path: "/signals", icon: "fa-bell", label: "Tín hiệu" },
  { path: "/bophan", icon: "fa-diagram-project", label: "Bộ phận" },
];

export function navHTML(activePath) {
  return html`${ITEMS.map(
    (it) => html`
      <a href="#${it.path}" class="tc-nav-item ${activePath === it.path ? "tc-active" : ""}">
        <i class="fas ${it.icon}"></i><span>${it.label}</span>
      </a>`
  )}`;
}
