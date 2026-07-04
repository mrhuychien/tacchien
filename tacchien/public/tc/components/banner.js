// banner.js — dải đầu view (nền tối + blob mùa) (shared: import map)
import { html } from "../lib/dom.js";

export function viewBanner({ title, subtitle, badge }) {
  return html`
    <div class="tc-view-banner">
      <div>
        <div class="tc-view-banner-title">${title}</div>
        ${subtitle ? html`<div class="tc-view-banner-subtitle">${subtitle}</div>` : ""}
      </div>
      ${badge ? html`<div class="tc-view-banner-badge">${badge}</div>` : ""}
    </div>`;
}
