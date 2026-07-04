// api.js — gọi whitelisted method qua REST (www page KHÔNG có frappe.call).

const CTX = window.TC_CONTEXT || {};

export async function call(method, args = {}) {
  const res = await fetch("/api/method/" + method, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": CTX.csrfToken || "",
      "Accept": "application/json",
    },
    body: JSON.stringify(args),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* non-json (redirect/html) */
  }
  if (!res.ok) {
    const msg = extractError(data) || res.statusText || "Lỗi máy chủ";
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data.message;
}

function extractError(data) {
  if (!data) return "";
  if (data._server_messages) {
    try {
      const arr = JSON.parse(data._server_messages);
      return arr.map((m) => JSON.parse(m).message).join("; ");
    } catch (e) {
      return data._server_messages;
    }
  }
  return data.exc_type || "";
}
