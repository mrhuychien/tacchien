# Build brief — App `tacchien` (Màn hình tác chiến RVHG)

> **Cách dùng:** paste vào Claude Code câu mở màn:
> *"Build app `tacchien` theo kiểu NPP (frappe-app-build-profile + nextcode-design/build + frappe-portal-spa + frappe-app-shipping-gotchas). Brief đầy đủ trong file `tacchien-build-brief.md`. Bắt đầu bằng Gate 0 — hỏi tôi các quyết định mở ở mục 12 trước khi viết bất kỳ dòng code nào."*
>
> Nền tảng: Frappe/ERPNext v16 custom app. Spec-first, approval gates, commit-per-feature.
> **Chưa duyệt blueprint chi tiết thì chưa code. Build trên site dev trước, không đụng production.**

---

## 1. Domain & nghiệp vụ

Màn hình tác chiến (war room) cho **Trợ lý Giám đốc + Giám đốc** của RVHG — trả lời một câu duy nhất: *"ngay bây giờ có gì cần can thiệp không?"* Nhịp thời gian: phút → hôm nay. **Không** phải BOD dashboard (KPI chiến lược đã có app khác lo), không nhồi VNPI/KPI tháng vào đây.

Nguyên tắc thiết kế (bắt buộc tuân thủ khi ra quyết định implementation):

1. **2-giây test**: đứng cách màn hình 2m, liếc 2 giây phải biết có sự cố hay không.
2. **Đo dòng chảy, không đo gõ phím**: chỉ số về bộ phận là độ trễ (draft→submit, chờ duyệt), không phải số lượng chứng từ/người.
3. **Exception-based với cá nhân**: tên user chỉ xuất hiện khi có bất thường. Không leaderboard.
4. **Chống alert fatigue là ưu tiên số 1**: dedup bắt buộc, severity kỷ luật, P3 gom digest. Thà ít rule sạch hơn nhiều rule ồn.
5. Mọi so sánh giờ giấc theo timezone `Asia/Ho_Chi_Minh`.

## 2. Kiến trúc tổng (Signal spine)

```
PRODUCERS                          SPINE                    CONSUMERS
─────────────                      ─────                    ─────────
Cron rules (dispatcher)   ──┐
doc_events hooks (SEC-01) ──┼──►  TC Signal  ──►  SPA /tc (realtime + polling)
Quét Sổ Nghĩa Vụ          ──┤     (dedup,         Telegram P1 (tức thì, qua queue)
[Guardian AI — phase sau] ──┘      ack/resolve)   Digest 07:00 (P2/P3)
```

- Mọi producer **bắt buộc** đi qua helper `emit_signal()` — cấm insert `TC Signal` trực tiếp. Helper lo dedup, realtime publish, và notify P1.
- Guardian AI **không** thuộc phase 1; chỉ chừa sẵn: sau này Guardian gọi `emit_signal()` là xong.

## 3. DocTypes (tất cả mới, prefix `TC`, label tiếng Việt, **fieldname ASCII**)

### 3.1 `TC Domain` — danh mục mảng hoạt động (seed 13 records qua fixtures)

Fields: `title` (Data), `cluster` (Select: `Dau vao & nha may` / `Dau ra & thi truong` / `Nen tang`), `sort_order` (Int), `is_active` (Check).

Seed: Mua hàng · NCC / Kho · tồn · HSD / Sản xuất / Chất lượng · FSMS / Tài sản · bảo trì / Bán hàng / Vận chuyển / Sau bán · khiếu nại / Trade · trưng bày / Tài chính · dòng tiền / Nhân sự / Pháp lý · tuân thủ / Hệ thống.

Lý do là DocType chứ không phải Select cứng: thêm mảng sau này = thêm record, không sửa schema.

### 3.2 `TC Signal` — tín hiệu (autoname `SIG-.#####`)

| Field | Type | Ghi chú |
|---|---|---|
| `signal_type` | Select | `Nguong` / `Bat thuong` / `He thong` / `Su kien` / `Han dinh ky` |
| `severity` | Select | `P1` / `P2` / `P3` |
| `domain` | Link TC Domain | reqd |
| `title` | Data | reqd, ngắn gọn hiển thị trên feed |
| `description` | Small Text | chi tiết + con số |
| `source_rule` | Data | mã rule, vd `RULE-POS-01` |
| `user` | Link User | optional — tín hiệu hành vi cá nhân |
| `ref_doctype` | Link DocType | optional |
| `ref_name` | Dynamic Link (ref_doctype) | click ra thẳng document |
| `status` | Select | `Open` / `Acked` / `Resolved` / `Muted`, default `Open` |
| `first_seen`, `last_seen` | Datetime | |
| `occurrence_count` | Int | default 1 |
| `dedup_key` | Data | index; xem logic dưới |
| `acked_by`, `acked_at`, `resolved_at`, `muted_until` | | metadata hành động |

**Dedup:** `dedup_key = sha1(source_rule + domain + ref_doctype + ref_name + title_normalized)`. `emit_signal()` tìm signal `status in (Open, Acked)` cùng key → nếu có: tăng `occurrence_count`, update `last_seen`, nâng severity nếu cao hơn — **không tạo mới**. `Muted` + `muted_until` chưa hết hạn → nuốt luôn.

**Hooks:** `after_insert` → `frappe.publish_realtime("tc_signal_new", payload)` + nếu P1 → `frappe.enqueue(send_telegram)` (không bao giờ block transaction). Track changes ON.

**Indexes:** `dedup_key`, (`status`,`severity`), (`domain`,`status`), `creation`.

### 3.3 `TC Rule` — registry rule (bật/tắt/chỉnh ngưỡng runtime, không sửa code)

Fields: `rule_code` (Data, unique), `title`, `domain` (Link), `default_severity` (Select), `enabled` (Check), `schedule` (Select: `every_5min` / `every_15min` / `hourly` / `daily`), `params` (JSON — ngưỡng, %, giờ…), `method_path` (Data — dotted path tới hàm Python), `last_run`, `last_error` (readonly).

Dispatcher: 1 scheduler cron `* * * * *` đọc registry → chạy rule đến hạn, **mỗi rule trong try/except riêng** (một rule lỗi không giết cả batch), lỗi ghi `last_error` + Error Log.

### 3.4 `TC Obligation` — Sổ Nghĩa Vụ Định Kỳ (autoname `NVDK-.####`)

Fields: `loai` (Select: `Giay phep ATTP` / `Cong bo - TCCS` / `Audit - Chung nhan` / `Hop dong` / `Hieu chuan thiet bi` / `Dang kiem - Bao hiem xe` / `Kham suc khoe` / `Dao tao` / `Khac`), `ten` (Data, reqd), `doi_tuong_doctype` (Link DocType, optional), `doi_tuong` (Dynamic Link — Supplier/Employee/Asset/Customer…), `ngay_het_han` (Date, reqd), `lead_p3_ngay` (Int, default 60), `lead_p2_ngay` (Int, default 30), `chu_ky_gia_han_thang` (Int), `trang_thai` (Select: `Hieu luc` / `Dang gia han` / `Het han`), `ghi_chu` (Small Text), đính kèm file scan.

Rule `RULE-OBL-01` (daily 06:30): quét toàn sổ → còn ≤ `lead_p3` ngày → P3; ≤ `lead_p2` → P2; quá hạn → P1. Dedup theo obligation + mốc (mỗi mốc chỉ kêu 1 lần, escalate được).

### 3.5 `TC Settings` (Single) + child `TC POS Watch`

Settings: `telegram_bot_token` (Password), `telegram_chat_id` (Data), `gio_lam_viec_tu` / `gio_lam_viec_den` (Time), `digest_hour` (Int, default 7), `sla_duyet_gio` (Int, default 4), `sla_doctypes` (Small Text — danh sách DocType áp SLA, mỗi dòng một tên), `perm_whitelist_users` (Small Text — user được phép đụng permission), `kenh_mapping` (child table Customer Group → kênh `MT/NPP/DL/Khac` — nếu tái dùng được mapping của app `pkd` thì bỏ qua, ghi rõ trong blueprint).

Child `TC POS Watch`: `pos_profile` (Link POS Profile), `gio_mo_cham_nhat` (Time, vd 08:00), `hoat_dong_cn` (Check — có mở Chủ nhật không).

## 4. Bộ rule phase 1

**Batch A bật ngay khi ship. Batch B bật sau ≥1 tuần chạy êm** (kỷ luật chống nhiễu — không thương lượng). Mọi ngưỡng nằm trong `TC Rule.params`, giá trị dưới đây là default.

| Mã | Mảng | Batch | Sev | Lịch | Logic & ngưỡng default |
|---|---|---|---|---|---|
| RULE-POS-01 | Hệ thống | A | P1 | 5min, khung 07:30–09:30 | POS trong Watch list chưa có POS Opening Entry hôm nay sau `gio_mo_cham_nhat` |
| RULE-POS-02 | Hệ thống | A | P1 | daily 07:00 + hourly | POS Opening Entry ngày trước vẫn status Open (bài học Bạch Đằng) |
| RULE-INV-01 | Kho | A | P1 | 15min | Tồn âm bất kỳ item/kho nào (đây là lỗi data, xử ngay) |
| RULE-INV-02 | Kho | A | P2/P3 | daily | Batch thành phẩm còn tồn > 0, HSD ≤ 30 ngày → P2; ≤ 60 → P3. Gom 1 signal/batch |
| RULE-INV-03 | Kho | B | P2 | daily | Tồn NVL/bao bì dưới reorder level (Item Reorder) |
| RULE-AR-01 | Tài chính | A | P2 | hourly | Customer vượt credit limit |
| RULE-AR-02 | Tài chính | A | P2 | daily | Công nợ quá hạn > 10 ngày, gom 1 signal/khách, description ghi tổng + số ngày |
| RULE-FIN-01 | Tài chính | B | P2 | daily | AP đến hạn 7 ngày tới > tiền về dự kiến (Payment Entry trung bình 7 ngày qua) |
| RULE-SAL-01 | Bán hàng | B | P2 | 15min | SI submitted có item giá lệch > 15% so Price List đang áp |
| RULE-SAL-02 | Bán hàng | B | P3 | 11:00 & 16:00 | Doanh thu lũy kế đến giờ chạy < 60% trung bình cùng thứ 4 tuần gần nhất (loại `is_opening`, `is_return` tính âm) |
| RULE-PUR-01 | Mua hàng | B | P1/P3 | daily | PO quá ngày giao chưa nhận đủ: nếu tồn NVL đó dưới reorder → P1, còn ổn → P3 |
| RULE-FLOW-01 | Nhịp bộ phận | A | P2 | hourly trong giờ làm việc | Chứng từ thuộc `sla_doctypes` nằm draft (docstatus 0) quá `sla_duyet_gio` giờ — đã chốt: duyệt = submit, không dùng Workflow |
| RULE-FLOW-02 | Nhịp bộ phận | B | P3 | daily 07:00 | Draft qua đêm theo bộ phận (Stock Entry, Delivery Note, SI) — gom vào digest |
| RULE-SEC-01 | Hệ thống | A | P1 | **doc_events, không cron** | Thay đổi User / Has Role / Custom DocPerm / Role Permission bởi user ngoài `perm_whitelist_users` |
| RULE-SEC-02 | Hệ thống | B | P2 | 15min | Một user cancel/amend > 5 docs trong 30 phút (so nền 30 ngày của chính user đó) |
| RULE-OBL-01 | Pháp lý+ | A | P1/P2/P3 | daily 06:30 | Quét Sổ Nghĩa Vụ (mục 3.4) |
| RULE-SYS-01 | Hệ thống | B | P2 | 5min | RQ queue depth bất thường hoặc Error Log 15 phút qua > 5× baseline |
| RULE-SYS-02 | Hệ thống | A | P2 | daily 07:00 | Backup đêm qua fail hoặc không có file backup mới trong 26h |

## 5. Telegram & Digest

- **P1 → Telegram ngay**: format `🔴 P1 · <title>\n<domain> · <description>\n<link desk tới ref doc>`. Gửi qua `frappe.enqueue` với retry 3 lần backoff. **Đã chốt: Bot API trực tiếp** (token + chat_id trong TC Settings); vẫn viết dạng notifier adapter để sau muốn cắm thêm kênh AKASHIC thì không phải sửa lõi.
- **Digest 07:00 daily**: gom P2/P3 đang Open + signal mới 24h, nhóm theo mảng → 1 tin Telegram + endpoint cho SPA hiển thị. Không có gì thì gửi "✅ Không có tín hiệu mở" (để biết hệ còn sống).

## 6. SPA `/tc` — theo đúng `frappe-portal-spa`

Convention bắt buộc: www page + vanilla JS ES module code-split, hash router, **import map cache-bust cho mọi shared module** (luật vàng #1), `assetVersion`/`withV()` cho view động, **CSS prefix `tc-` toàn bộ** (không class trần `.card` `.btn` `.modal`…), `escapeHtml` mọi dữ liệu render, Chart.js lazy-load + destroy trước khi vẽ lại, context bridge `window.TC_CONTEXT = {user, roles, assetVersion, csrfToken}`.

**Phân quyền:** tạo Role `Tac Chien` (permissions add trong `install.py` — xem mục 8). www context check role, thiếu → 403; mọi whitelisted method có `_guard` role check ở dòng đầu. UI gate chỉ là tiện dụng, quyền thật ở server.

4 routes:

| Route | Nội dung |
|---|---|
| `#/` Tổng quan | Health strip 13 ô theo 3 cụm (màu ô = max severity signal Open của mảng: P1 đỏ / P2 vàng / sạch xanh, kèm số signal); 4 số nhịp ngày: doanh thu hôm nay theo kênh, tiền về vs KH thu, đơn mới (SO + POS), signal mở theo severity; sparkline doanh thu 14 ngày vs trung bình cùng thứ; feed 10 signal mới nhất |
| `#/domain/:name` | View generic: metric chính của mảng + list signal của mảng + link desk. Phase 1 làm sâu 3 mảng: **Tài chính** (aging table theo khách, tiền về theo ngày), **Kho** (danh sách cận date, tồn âm, dưới định mức), **Bán hàng** (doanh thu theo kênh/ngày, đơn bất thường) |
| `#/bophan` | Nhịp bộ phận: bảng [bộ phận · hoạt động hôm nay · điểm tắc · pill trạng thái], data từ `owner+creation+docstatus` trên DocType nguồn — **không** query `tabVersion`/`tabActivity Log` |
| `#/signals` | Feed đầy đủ + filter (severity/domain/status/user) + hành động Ack / Resolve / Mute-có-thời-hạn (1h/1ngày/1tuần), optimistic UI |

**Realtime:** subscribe `tc_signal_new` → prepend feed + update màu ô; fallback polling 60s. **TV mode:** `#/?tv=1` — ẩn nav, phóng font, tự refresh 60s (dùng cho màn hình treo/monitor phụ).

## 7. Backend API (`tacchien/api/*.py`, whitelisted, guard đầu mỗi method)

- `get_overview()` — **1 call trả đủ** cho `#/`: health per domain, 4 metrics, sparkline series, top signals. Cache server-side TTL 30s (`frappe.cache`) vì TV mode polling.
- `get_domain(domain)`, `get_bophan()`, `get_signals(**filters)` (pagination), `act_on_signal(name, action, muted_until=None)`.
- Số liệu doanh thu: loại `is_opening='Yes'`, return tính âm, kênh map qua Customer Group tree (tái dùng mapping `pkd` nếu import được, không thì đọc `kenh_mapping` trong Settings). `frappe.db.sql` có comment mục đích — theo house style.

## 8. Kỷ luật kỹ thuật (non-negotiable)

1. Backend = Python trong app. **KHÔNG** Server Script / Client Script rải rác.
2. Fieldname ASCII toàn bộ (label tiếng Việt thoải mái).
3. Fixtures **export bằng bench**, không viết tay; chạy validator 0 ERROR. Fixtures gồm: TC Domain (13), TC Rule (18), Role `Tac Chien`.
4. **Permissions add trong `install.py`** qua `frappe.permissions.add_permission()` — KHÔNG dựa `custom_docperm.json` (bài học iso22000_fsms). Nếu có patch: `patches.txt` phải có header `[pre_model_sync]`.
5. Mọi module có `__init__.py`. Verify trước ship: `py_compile` toàn bộ + `node --check` JS + validator.
6. `emit_signal()` là cửa duy nhất tạo signal. Notify không bao giờ chạy sync trong request/transaction.
7. Test tối thiểu (FrappeTestCase): dedup của `emit_signal` (3 case: tạo mới / tăng count / muted nuốt), RULE-OBL-01, RULE-AR-02, `act_on_signal` permission.
8. Deploy: `bench --site <dev> migrate` → `bench build --app tacchien` → `bench restart` → refresh (import map lo cache). Site dev trước, production sau khi anh duyệt.
9. Git: commit-per-feature (P0/P1/P2 trong message), push nhánh dev.

## 9. Thứ tự build đề xuất (mỗi bước 1 approval nhỏ)

1. Scaffold app + DocTypes + fixtures + Role + install.py → migrate sạch trên dev.
2. `emit_signal()` + dispatcher + 3 rule Batch A đầu (POS-01, POS-02, INV-01) + test dedup.
3. Telegram notifier + digest.
4. SPA shell + `#/` tổng quan + realtime.
5. `#/signals` + ack/resolve/mute.
6. Rules Batch A còn lại + `#/bophan` + 3 domain view sâu.
7. Verify-before-ship checklist + bàn giao hướng dẫn bật Batch B.

## 10. Ngoài phạm vi phase 1 (chống scope creep — từ chối nếu bị dụ)

Guardian AI integration (chỉ chừa `emit_signal`), baseline âm lịch & anomaly thống kê (phase 3), view sâu cho 10 mảng còn lại, rule cho FSMS/vanchuyen/display_point (chờ app live), mảng Nhân sự (chưa chốt nguồn chấm công), mobile app riêng, biểu đồ trang trí không phục vụ quyết định.

## 11. Definition of Done

- [ ] `bench install-app tacchien` sạch trên site dev, migrate không lỗi
- [ ] 13 TC Domain + 18 TC Rule seed đúng; Batch A enabled, Batch B disabled
- [ ] Tạo signal test bằng bench console → thấy realtime trên `/tc` không cần refresh
- [ ] Signal P1 test → Telegram nhận trong < 30 giây
- [ ] Digest 07:00 chạy (test bằng trigger tay)
- [ ] Ack/Resolve/Mute hoạt động, user thiếu role `Tac Chien` bị chặn cả UI lẫn API
- [ ] RULE-POS-02 bắt được case dựng sẵn: opening hôm qua còn Open
- [ ] Dedup: chạy rule 3 lần liên tiếp → vẫn 1 signal, `occurrence_count` = 3
- [ ] `py_compile` + `node --check` + validator fixtures: 0 ERROR
- [ ] Checklist `frappe-portal-spa` pass (import map, prefix `tc-`, escapeHtml, destroy chart)

## 12. Gate 0 — Claude Code phải hỏi & chốt các mục này TRƯỚC khi code

> **Đã chốt trước, không hỏi lại:** app `tacchien`, route `/tc` · P1 qua Telegram Bot API trực tiếp · duyệt chứng từ = draft → submit, không dùng Workflow.

1. Telegram bot token + chat_id (nhập vào TC Settings sau khi cài — không hardcode, không commit vào git).
2. Danh sách POS Profile + giờ mở chậm nhất từng điểm (seed TC POS Watch).
3. Danh sách DocType áp SLA draft (`sla_doctypes`).
4. User whitelist được phép thay đổi permission (`perm_whitelist_users`).
5. Site dev để build + tên nhánh git.
6. Mapping kênh: import được từ app `pkd` không, hay khai trong Settings?
