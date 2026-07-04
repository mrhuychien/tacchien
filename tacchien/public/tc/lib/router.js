// router.js — hash router hỗ trợ :param + ?query (shared: trong import map)

export function parseHash() {
  let h = location.hash.slice(1) || "/";
  const [path, qs] = h.split("?");
  const query = {};
  new URLSearchParams(qs || "").forEach((val, key) => (query[key] = val));
  return { path: path || "/", query };
}

// Khớp path với mẫu "/domain/:name" → {name: ...} hoặc null.
export function matchRoute(pattern, path) {
  const pp = pattern.split("/").filter(Boolean);
  const cp = path.split("/").filter(Boolean);
  if (pp.length !== cp.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(cp[i]);
    else if (pp[i] !== cp[i]) return null;
  }
  return params;
}

// Đổi query trong URL mà KHÔNG re-render (đồng bộ address bar).
export function replaceQuery(query) {
  const { path } = parseHash();
  const qs = new URLSearchParams(query).toString();
  history.replaceState(null, "", "#" + path + (qs ? "?" + qs : ""));
}
