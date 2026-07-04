// realtime.js — polling 60s (đảm bảo) + socket.io best-effort (tc_signal_new).
// Polling là backbone tin cậy; socket chỉ để tức thì hơn, hỏng thì im lặng.

let pollTimer = null;
let socket = null;

export function startRealtime({ onNewSignal, onPoll, pollMs = 60000 } = {}) {
  stopRealtime();
  if (onPoll) pollTimer = setInterval(() => safe(onPoll), pollMs);
  if (onNewSignal) trySocket(onNewSignal);
}

export function stopRealtime() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (socket) {
    try { socket.disconnect(); } catch (e) { /* noop */ }
  }
  socket = null;
}

function safe(fn) {
  try { fn(); } catch (e) { console.warn("[tc] poll error", e); }
}

function trySocket(onNewSignal) {
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js")
    .then(() => {
      if (!window.io) return;
      socket = window.io(window.location.origin, {
        path: "/socket.io",
        withCredentials: true,
        reconnectionAttempts: 5,
      });
      socket.on("tc_signal_new", (payload) => safe(() => onNewSignal(payload)));
    })
    .catch(() => { /* không có socket → polling lo */ });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.io) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
