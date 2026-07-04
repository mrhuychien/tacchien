# Browser harness — verify SPA /tc KHÔNG cần bench

Theo `frappe-portal-spa/references/browser-test-harness.md`. Serve `public/tc`
tĩnh + `index.html` giả lập www page (import map + `TC_CONTEXT` + **stub `fetch`**
trả payload đúng shape các API), rồi Playwright kiểm router/render/binding.

## Chạy

```bash
npm i playwright-core            # 1 lần
# Chromium: đặt TC_CHROME nếu khác mặc định
TC_CHROME=/path/to/chrome node tests/browser/server.mjs &   # cổng 8123
node tests/browser/drive.mjs                                # 18 check, exit!=0 nếu fail
```

## Giới hạn (không thay bench)

Harness KHÔNG test: quyền server, SQL thật, Jinja www, socket.io realtime,
CDN cache. Các lớp đó nghiệm thu bằng runbook (`docs/runbook.md`) trên site dev.
CDN (Chart.js/socket.io) bị chặn trong sandbox → stub; lỗi `ERR_TUNNEL`/`favicon`
đã được lọc, không phải lỗi code.
