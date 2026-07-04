// format.js — định dạng VN tập trung (shared: trong import map)

const VN = "vi-VN";

export function formatNumber(n) {
  return new Intl.NumberFormat(VN, { maximumFractionDigits: 0 }).format(Math.round(n || 0));
}

export function formatCurrency(n) {
  return formatNumber(n) + " ₫";
}

// Thẻ lớn: 1.600.000.000 → "1,6 tỷ"; 33.000.000 → "33 tr".
export function formatVNDShort(n) {
  n = Number(n) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim(n / 1e9) + " tỷ";
  if (abs >= 1e6) return trim(n / 1e6) + " tr";
  if (abs >= 1e3) return trim(n / 1e3) + " k";
  return formatNumber(n);
}

function trim(x) {
  return new Intl.NumberFormat(VN, { maximumFractionDigits: 1 }).format(x);
}

export function formatDate(d) {
  if (!d) return "";
  const dt = new Date(String(d).replace(" ", "T"));
  return new Intl.DateTimeFormat(VN, { day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
}

export function formatDateTime(d) {
  if (!d) return "";
  const dt = new Date(String(d).replace(" ", "T"));
  return new Intl.DateTimeFormat(VN, {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(dt);
}

export function relTime(d) {
  if (!d) return "";
  const dt = new Date(String(d).replace(" ", "T"));
  const diff = (Date.now() - dt.getTime()) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return Math.floor(diff / 60) + " phút";
  if (diff < 86400) return Math.floor(diff / 3600) + " giờ";
  return formatDate(d);
}

// Severity → class/nhãn.
export const SEV_LABEL = { P1: "P1", P2: "P2", P3: "P3" };
export function sevClass(sev) {
  return { P1: "tc-sev-p1", P2: "tc-sev-p2", P3: "tc-sev-p3" }[sev] || "tc-sev-none";
}
