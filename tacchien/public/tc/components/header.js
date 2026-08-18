// header.js — thanh trên cố định (glass ấm). (shared: import map)
// Chrome port từ hgboard: brand mark lệch trục (lime-on-ink) + đèn "đang giám sát".
import { html } from "../lib/dom.js";

export function headerHTML({ title, back }) {
  const ctx = window.TC_CONTEXT || {};
  return html`
    <div class="tc-header-inner">
      <div class="tc-header-left">
        ${back
          ? html`<button class="tc-icon-btn" data-act="back" aria-label="Quay lại"><i class="fas fa-arrow-left"></i></button>`
          : html`<a class="tc-brand" href="#/" aria-label="Màn hình tác chiến">
              <span class="tc-brand-mark" aria-hidden="true">TC</span>
              <span class="tc-brand-text"><strong>TÁC CHIẾN</strong><small>Điều hành realtime</small></span>
            </a>`}
        <span class="tc-header-title">${title || "Tác chiến"}</span>
      </div>
      <div class="tc-header-actions">
        <span class="tc-live"><i aria-hidden="true"></i>Đang giám sát</span>
        <button class="tc-icon-btn" data-act="refresh" aria-label="Làm mới"><i class="fas fa-sync-alt"></i></button>
        <span class="tc-header-user" title="${ctx.user || ""}"><i class="fas fa-circle-user"></i></span>
      </div>
    </div>`;
}
