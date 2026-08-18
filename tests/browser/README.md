# Browser harness — verify SPA /tc KHÔNG cần bench

Theo `frappe-portal-spa/references/browser-test-harness.md`. Serve `public/tc`
tĩnh + `index.html` giả lập www page (import map + `TC_CONTEXT` + **stub `fetch`**
trả payload đúng shape các API), rồi Playwright kiểm router/render/binding.

`index.html` **có nạp `shell.css`** nên harness kiểm được cả lớp giao diện bằng
`getComputedStyle`, không chỉ hành vi. Hai lỗi CSS im lặng đã từng lọt và nay có
check gác riêng: reset `.tc-app a { color: inherit }` (specificity 0,1,1) nuốt màu
mọi component đặt trên thẻ `<a>`; và overlay `::after` bám modifier dùng chung
(`tc-cell-p1` có ở cả ô health lẫn pill rollup) tràn ra khỏi component. Cả hai
check đã được mutation-test: cố tình tái tạo lỗi → harness FAIL, khôi phục → PASS.

## Chạy

```bash
npm i playwright-core            # 1 lần
# Chromium: đặt TC_CHROME nếu khác mặc định
TC_CHROME=/path/to/chrome node tests/browser/server.mjs &   # cổng 8123
node tests/browser/drive.mjs                                # 28 check, exit!=0 nếu fail
```

## Giới hạn (không thay bench)

Harness KHÔNG test: quyền server, SQL thật, Jinja www, socket.io realtime,
CDN cache, và **font/icon từ CDN** (bị chặn trong sandbox → trang render bằng font
dự phòng; màu và layout vẫn đúng nên `getComputedStyle` vẫn tin được). Các lớp đó nghiệm thu bằng runbook (`docs/runbook.md`) trên site dev.
CDN (Chart.js/socket.io) bị chặn trong sandbox → stub; lỗi `ERR_TUNNEL`/`favicon`
đã được lọc, không phải lỗi code.
