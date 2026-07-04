// dom.js — html`` template có auto-escape + tiện ích DOM. (shared: trong import map)

const RAW = Symbol("raw");

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function raw(s) {
  return { [RAW]: String(s == null ? "" : s) };
}

function render(v) {
  if (v === null || v === undefined || v === false) return "";
  if (Array.isArray(v)) return v.map(render).join("");
  if (typeof v === "object" && RAW in v) return v[RAW];
  return escapeHtml(v);
}

// html`...${x}...` — x được escape; kết quả html`` lồng nhau giữ nguyên (raw).
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return { [RAW]: out, toString() { return out; } };
}

export function setHTML(el, tpl) {
  el.innerHTML = typeof tpl === "object" && RAW in tpl ? tpl[RAW] : String(tpl);
  return el;
}

export function el(id) {
  return document.getElementById(id);
}
