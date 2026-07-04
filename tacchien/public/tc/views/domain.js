// views/domain.js — placeholder, hoàn thiện ở Build 5/6.
import { html, setHTML } from "../lib/dom.js";
export async function render({ container }) {
  setHTML(container, html`<div class="tc-empty"><div class="tc-empty-icon">🚧</div>
    <div class="tc-empty-title">Màn hình đang phát triển</div>
    <div>#/domain — sẽ hoàn thiện ở Build kế tiếp.</div></div>`);
}
