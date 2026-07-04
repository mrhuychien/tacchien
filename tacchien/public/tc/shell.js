// shell.js — orchestrator SPA /tc: router + chrome + realtime + TV mode.
import { parseHash, matchRoute } from "./lib/router.js";
import { el, setHTML, html } from "./lib/dom.js";
import { startRealtime } from "./lib/realtime.js";
import { headerHTML } from "./components/header.js";
import { navHTML } from "./components/bottom-nav.js";
import { showToast } from "./components/toast.js";

const BUILD = "0.1.0"; // Luật vàng #2: phải khớp TC_CONTEXT.build (server)
const CTX = window.TC_CONTEXT || {};
const base = CTX.base || "/assets/tacchien/tc";
const withV = (p) => p + (p.includes("?") ? "&" : "?") + "v=" + (CTX.assetVersion || "");

const ROUTES = [
  { pattern: "/", view: "overview", title: "Tổng quan", back: false },
  { pattern: "/signals", view: "signals", title: "Tín hiệu", back: false },
  { pattern: "/bophan", view: "bophan", title: "Nhịp bộ phận", back: false },
  { pattern: "/domain/:name", view: "domain", title: "Mảng", back: true },
];

let renderToken = 0;
let currentView = null;

function ensureChrome() {
  const app = el("tc-app");
  if (!el("tc-header")) {
    const h = document.createElement("header");
    h.id = "tc-header";
    h.className = "tc-header";
    app.insertBefore(h, app.firstChild);
  }
  if (!el("tc-bottom-nav")) {
    const n = document.createElement("nav");
    n.id = "tc-bottom-nav";
    n.className = "tc-bottom-nav";
    app.appendChild(n);
  }
}

function buildBanner() {
  // Luật vàng #2: shell cũ (tab mở trước deploy) → banner đỏ thay vì hỏng ngầm.
  if (CTX.build && CTX.build !== BUILD) {
    const bar = document.createElement("div");
    bar.className = "tc-stale-bar";
    bar.textContent = "Đang chạy bản cũ do cache — tải lại trang (Ctrl+Shift+R).";
    document.body.appendChild(bar);
  }
}

async function renderRoute() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const tv = query.tv === "1";

  let matched = null;
  for (const r of ROUTES) {
    const params = matchRoute(r.pattern, path);
    if (params) { matched = { ...r, params }; break; }
  }

  // Router self-heal: route lạ → reload 1 lần (chống loop) rồi fallback "/".
  if (!matched) {
    const key = "tc_healed_" + path;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      location.reload();
      return;
    }
    location.hash = "#/";
    return;
  }

  document.getElementById("tc-app").classList.toggle("tc-tv", tv);
  setHTML(el("tc-header"), headerHTML({ title: matched.title, back: matched.back }));
  setHTML(el("tc-bottom-nav"), navHTML(path));
  el("tc-header").style.display = tv ? "none" : "";
  el("tc-bottom-nav").style.display = tv ? "none" : "";

  const view = el("tc-view");
  setHTML(view, html`<div class="tc-skeleton" style="height:200px"></div>`);

  try {
    const mod = await import(withV(`${base}/views/${matched.view}.js`));
    if (token !== renderToken) return; // race: điều hướng khác đã tới
    currentView = mod;
    await mod.render({ container: view, query, params: matched.params, tv });
  } catch (e) {
    console.error("[tc] view error", e);
    if (token === renderToken) {
      setHTML(view, html`<div class="tc-empty"><div class="tc-empty-icon">⚠️</div>
        <div class="tc-empty-title">Lỗi tải màn hình</div><div>${e.message || e}</div></div>`);
    }
  }
}

function refreshCurrent() {
  renderRoute();
}

function bindEvents() {
  window.addEventListener("hashchange", renderRoute);
  document.getElementById("tc-app").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "refresh") refreshCurrent();
    if (act === "back") history.back();
  });
}

function init() {
  ensureChrome();
  buildBanner();
  bindEvents();
  startRealtime({
    onPoll: refreshCurrent,
    onNewSignal: (payload) => {
      showToast(`${payload.severity} · ${payload.title}`, payload.severity === "P1" ? "error" : "warning");
      refreshCurrent();
    },
    pollMs: 60000,
  });
  renderRoute();
}

// expose để view mới guard link cho tab shell cũ (Luật vàng #2)
window.APP = { build: BUILD, refresh: refreshCurrent };
init();
