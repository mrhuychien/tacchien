# Runbook — deploy & nghiệm thu `tacchien` (site dev)

> Session build không có bench nên phần bench (install/migrate/realtime/Telegram/
> digest/dedup runtime) do anh chạy theo đây. Thay `dev.rvhg` bằng site thật.

## 1. Cài & deploy

```bash
bench get-app tacchien <git-url>        # nhánh claude/skills-design-patterns-iwpioc
bench --site dev.rvhg install-app tacchien
bench --site dev.rvhg migrate
bench build --app tacchien
bench restart
```

Nếu `install-app` báo `ModuleNotFoundError`: kiểm mọi thư mục có `__init__.py`
(đã ship đủ; `bash scripts/verify_all.sh` xác nhận). Deploy rồi không thấy đổi:
`migrate → build → restart → refresh` đúng thứ tự; SPA có import map nên refresh
thường là đủ (không cần hard-refresh).

## 2. Cấu hình sau cài (Desk → **TC Settings**)

1. **Telegram**: dán `telegram_bot_token` + `telegram_chat_id` (KHÔNG commit vào git).
2. **POS Watch**: thêm từng POS Profile + `gio_mo_cham_nhat` (+ `hoat_dong_cn` nếu mở CN).
3. **Mapping kênh**: `channel_source` mặc định `pkd`. Nếu site **không** cài `pkd`
   (hoặc path hàm khác — xem R2 blueprint): đổi sang `settings` và khai bảng
   **Mapping kênh (fallback)**: mỗi dòng root Customer Group → kênh MT/NPP/DL/Khac.
4. **Quyền**: gán Role **Tac Chien** cho tài khoản Trợ lý GĐ + Giám đốc
   (Administrator đã có System Manager). `perm_whitelist_users` mặc định `Administrator`.

Mở `/tc` bằng một tài khoản có role → thấy dashboard. Thiếu role → 403 (đúng).

## 3. Nghiệm thu Definition of Done (bench console)

```bash
bench --site dev.rvhg console
```

**a) Tạo signal + realtime + dedup 3×** (mở `/tc` sẵn ở tab khác):
```python
from tacchien.tc.emit import emit_signal
for _ in range(3):
    emit_signal(signal_type="He thong", severity="P2", domain="Hệ thống",
                title="Test dedup", source_rule="RULE-TEST", ref_doctype="Warehouse", ref_name="W-TEST")
frappe.db.commit()
frappe.db.get_value("TC Signal", {"source_rule": "RULE-TEST"}, "occurrence_count")   # -> 3 (KHÔNG tạo 3 bản)
```
→ `/tc` phải thấy tín hiệu xuất hiện không cần refresh (realtime; nếu socket bị chặn thì ≤60s do polling).

**b) P1 → Telegram < 30s** (cần worker chạy: `bench worker` hoặc supervisor):
```python
emit_signal(signal_type="He thong", severity="P1", domain="Hệ thống",
            title="Test P1 Telegram", description="kiểm tra kênh", source_rule="RULE-TEST-P1")
frappe.db.commit()
```
→ nhóm Telegram nhận `🔴 P1 · Test P1 Telegram …` trong ~vài giây.

**c) RULE-POS-02 (opening treo)** — dựng case: tạo 1 POS Opening Entry `posting_date`
hôm qua, `status = Open`, submit. Rồi:
```python
from tacchien.tc.rules.pos import opening_stuck_open
opening_stuck_open({}, frappe.get_doc("TC Rule", "RULE-POS-02").as_dict())
frappe.db.commit()
```
→ có TC Signal P1 "POS Opening treo Open".

**d) Digest** (gửi tay):
```python
from tacchien.tc.notify.digest import send_digest
send_digest()          # rỗng → "✅ Không có tín hiệu mở"
```

**e) Ack/Resolve/Mute + role gate**: trên `/tc#/signals` bấm Ack/Resolve/Mute (1h/1ngày/1tuần).
Đăng nhập tài khoản KHÔNG có role Tac Chien → gọi API bị chặn (PermissionError) và `/tc` = 403.

**f) Dọn dữ liệu test**:
```python
frappe.db.delete("TC Signal", {"source_rule": ["like", "RULE-TEST%"]}); frappe.db.commit()
```

## 4. Chạy unit test

```bash
bench --site dev.rvhg set-config allow_tests true
bench --site dev.rvhg run-tests --app tacchien
```
Gồm: dedup emit_signal (3 case), OBL-01 (mốc + escalate), AR-02 (skip nếu site
thiếu scaffolding kế toán), act_on_signal permission.

## 5. Verify không cần bench (đã chạy khi build)

```bash
bash scripts/verify_all.sh            # py_compile + node --check + validator
HARNESS=1 bash scripts/verify_all.sh  # + Chromium harness (cần playwright-core)
```

## 6. Bật Batch B — SAU ≥ 1 tuần chạy êm (kỷ luật chống nhiễu)

Chỉ bật khi Batch A đã chạy sạch ≥1 tuần và anh đã tinh chỉnh ngưỡng trong
`TC Rule.params`. Bật bằng Desk (TC Rule → tick **enabled**) hoặc console:

```python
for code in ["RULE-INV-03","RULE-FIN-01","RULE-SAL-01","RULE-SAL-02",
             "RULE-PUR-01","RULE-FLOW-02","RULE-SEC-02","RULE-SYS-01"]:
    frappe.db.set_value("TC Rule", code, "enabled", 1)
frappe.db.commit()
```

Khuyến nghị bật **từng cụm**, theo dõi 1–2 ngày rồi bật tiếp — không bật cả 8 cùng lúc.
Ngưỡng mặc định (variance 15%, pace 60%, error 5×…) chỉnh trong `params` từng rule.

## 7. Xử lý sự cố nhanh

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `/tc` 403 | tài khoản thiếu role | gán **Tac Chien** |
| Không nhận Telegram | thiếu token/chat_id hoặc worker chết | điền TC Settings; `bench worker`; xem Error Log "tacchien telegram" |
| Số liệu kênh trống | `pkd` chưa cài mà `channel_source=pkd` | đổi `settings` + khai bảng mapping |
| Realtime không tức thì | socket.io bị chặn | polling 60s vẫn cập nhật; kiểm proxy `/socket.io` |
| Rule không chạy | scheduler tắt | `bench doctor`; `bench enable-scheduler`; xem `TC Rule.last_error` |
| Deploy rồi vẫn bản cũ | cache asset | `bench build --app tacchien` + refresh; banner đỏ "bản cũ" nếu lệch build |
