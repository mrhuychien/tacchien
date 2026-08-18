// banner.js — dải đầu view (kính xanh rêu + blob chanh/cam) (shared: import map)
// Port .active-card + .flow-title của hgboard: eyebrow chữ nhỏ giãn ký tự,
// tiêu đề display font, chip accent chanh bên phải.
import { html } from "../lib/dom.js";

export function viewBanner({ title, subtitle, badge, eyebrow }) {
  return html`
    <div class="tc-view-banner">
      <div>
        ${eyebrow ? html`<div class="tc-view-banner-eyebrow">${eyebrow}</div>` : ""}
        <div class="tc-view-banner-title">${title}</div>
        ${subtitle ? html`<div class="tc-view-banner-subtitle">${subtitle}</div>` : ""}
      </div>
      ${badge ? html`<div class="tc-view-banner-badge">${badge}</div>` : ""}
    </div>`;
}
