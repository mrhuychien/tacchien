// views/bophan.js — #/bophan: nhịp bộ phận (bảng → card mobile).
import { call } from "../lib/api.js";
import { html, setHTML } from "../lib/dom.js";
import { formatNumber } from "../lib/format.js";
import { viewBanner } from "../components/banner.js";

const PILL = { green: "Trôi chảy", amber: "Chậm", red: "Tắc" };

export async function render({ container }) {
  setHTML(container, html`<div class="tc-skeleton" style="height:200px"></div>`);
  let d;
  try {
    d = await call("tacchien.api.bophan.get_bophan");
  } catch (e) {
    setHTML(container, html`<div class="tc-empty"><div class="tc-empty-icon">⚠️</div>
      <div class="tc-empty-title">Lỗi tải nhịp bộ phận</div><div>${e.message || e}</div></div>`);
    return;
  }
  setHTML(
    container,
    html`
      ${viewBanner({ title: "Nhịp bộ phận", subtitle: `Điểm tắc = draft quá ${d.sla_hours}h` })}
      <div class="tc-card tc-mt-3">
        <table class="tc-table">
          <thead><tr><th>Bộ phận</th><th>Hôm nay</th><th>Điểm tắc</th><th>Cũ nhất</th><th>Trạng thái</th></tr></thead>
          <tbody>
            ${d.rows.map((r) => html`
              <tr>
                <td data-label="Bộ phận"><strong>${r.dept}</strong></td>
                <td data-label="Hôm nay">${formatNumber(r.today)}</td>
                <td data-label="Điểm tắc">${r.stuck ? formatNumber(r.stuck) : "—"}</td>
                <td data-label="Cũ nhất">${r.oldest_h ? r.oldest_h + "h" : "—"}</td>
                <td data-label="Trạng thái"><span class="tc-pill tc-flow-${r.status}">${PILL[r.status] || r.status}</span></td>
              </tr>`)}
          </tbody>
        </table>
      </div>`
  );
}
