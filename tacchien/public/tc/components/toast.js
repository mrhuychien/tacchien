// toast.js — góc trên phải, viền trái màu trạng thái (shared: import map)
import { html, setHTML } from "../lib/dom.js";

export function showToast(msg, type = "info") {
  const mount = document.getElementById("tc-toast-mount");
  if (!mount) return;
  const node = document.createElement("div");
  node.className = "tc-toast tc-" + type;
  setHTML(node, html`${msg}`);
  mount.appendChild(node);
  setTimeout(() => {
    node.style.animation = "tcToastOut .25s ease forwards";
    setTimeout(() => node.remove(), 250);
  }, 3500);
}
