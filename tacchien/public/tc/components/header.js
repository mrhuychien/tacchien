// header.js — thanh trên cố định (glass). (shared: import map)
import { html } from "../lib/dom.js";

export function headerHTML({ title, back }) {
  const ctx = window.TC_CONTEXT || {};
  return html`
    <div class="tc-header-inner">
      <div class="tc-header-left">
        ${back ? html`<button class="tc-icon-btn" data-act="back" aria-label="Quay lại"><i class="fas fa-arrow-left"></i></button>` : ""}
        <span class="tc-header-title">${title || "Tác chiến"}</span>
      </div>
      <div class="tc-header-actions">
        <button class="tc-icon-btn" data-act="refresh" aria-label="Làm mới"><i class="fas fa-sync-alt"></i></button>
        <span class="tc-header-user" title="${ctx.user || ""}"><i class="fas fa-circle-user"></i></span>
      </div>
    </div>`;
}
