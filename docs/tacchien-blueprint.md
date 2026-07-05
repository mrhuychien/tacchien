# Blueprint — App `tacchien` (Màn hình tác chiến RVHG)

> **Trạng thái:** ⏳ CHỜ DUYỆT (Gate 1). Chưa viết code app cho tới khi anh confirm.
> **Nguồn:** `tacchien-build-brief.md` + Gate 0 đã chốt (bên dưới).
> **Phương pháp:** nextcode-design → nextcode-build, kiểu NPP, spec-first, commit-per-feature.

---

## 0. Gate 0 — quyết định đã chốt

| # | Mục | Chốt |
|---|---|---|
| — | App / route / P1 / duyệt | `tacchien` · `/tc` · Telegram Bot API trực tiếp · draft→submit (không Workflow) |
| 6 | Mapping kênh | **Tái dùng từ `pkd`** — lazy-import + fallback (không hard-dep, không giết migrate nếu `pkd` chưa cài) |
| 3 | SLA doctypes | **Mở rộng**: Sales Invoice, Sales Order, Delivery Note, Stock Entry, Payment Entry, Purchase Order, Purchase Invoice, Material Request |
| 4 | `perm_whitelist_users` | **Chỉ `Administrator`** (default seed) |
| 1,2 | Telegram token / POS Watch / site | **Seed placeholder** — điền trong Desk sau `bench install`. Runbook dùng site `dev.rvhg` |

**Ràng buộc môi trường (quan trọng):** session này **không có Frappe bench**. Sản phẩm giao = **toàn bộ source + fixtures + runbook** commit vào repo `tacchien` nhánh `claude/skills-design-patterns-iwpioc`. Anh chạy `bench install-app/migrate/build` trên site dev và nghiệm thu theo DoD (brief Mục 11). Verify tại đây thay bằng `py_compile` + `node --check` + validator fixtures.

---

## 1. Business model (actors + use case)

**Câu hỏi duy nhất app trả lời:** *"ngay bây giờ có gì cần can thiệp không?"* — nhịp phút→hôm nay. KHÔNG phải BOD/KPI tháng.

| Actor | Role | Thấy gì |
|---|---|---|
| Trợ lý Giám đốc | `Tac Chien` | Toàn bộ SPA `/tc`, ack/resolve/mute |
| Giám đốc | `Tac Chien` | Như trên; thường xem TV mode `#/?tv=1` |
| Administrator | `System Manager` + `Tac Chien` | Cấu hình TC Settings, TC Rule, bật/tắt rule |
| (Guardian AI — phase sau) | — | Chỉ gọi `emit_signal()`; ngoài phase 1 |

**5 nguyên tắc bất biến (kim chỉ nam mọi quyết định implement):** 2-giây test · đo dòng chảy không đo gõ phím · exception-based với cá nhân (không leaderboard) · **chống alert fatigue = ưu tiên #1** (dedup bắt buộc, severity kỷ luật, P3 gom digest) · mọi so giờ theo `Asia/Ho_Chi_Minh`.

**Signal spine:** mọi producer (cron rules, doc_events, quét Sổ Nghĩa Vụ, Guardian sau này) → **bắt buộc** qua `emit_signal()` → `TC Signal` (dedup/ack/resolve) → consumers (SPA realtime+polling, Telegram P1, digest 07:00).

---

## 2. DocType blueprint

App tạo **6 DocType mới**, prefix `TC`, module **Tacchien**, label tiếng Việt, **fieldname ASCII 100%** (bài học shipping-gotchas: không dấu, không `custom_` vì đây là doctype riêng của app).

### 2.1 `TC Domain` — danh mục mảng hoạt động
`autoname: field:title` · seed 13 records (fixtures).

| Fieldname | Label | Type | Ghi chú |
|---|---|---|---|
| `title` | Tên mảng | Data | reqd, unique (naming) |
| `cluster` | Cụm | Select | `Dau vao & nha may` / `Dau ra & thi truong` / `Nen tang` |
| `sort_order` | Thứ tự | Int | |
| `is_active` | Đang dùng | Check | default 1 |

Seed (13): Mua hàng · NCC / Kho · tồn · HSD / Sản xuất / Chất lượng · FSMS / Tài sản · bảo trì / Bán hàng / Vận chuyển / Sau bán · khiếu nại / Trade · trưng bày / Tài chính · dòng tiền / Nhân sự / Pháp lý · tuân thủ / Hệ thống. Cluster & sort_order gán trong `06_fixtures`.

### 2.2 `TC Signal` — tín hiệu
`autoname: SIG-.#####` · **track changes ON**.

| Fieldname | Label | Type | Ghi chú |
|---|---|---|---|
| `signal_type` | Loại | Select | `Nguong`/`Bat thuong`/`He thong`/`Su kien`/`Han dinh ky` |
| `severity` | Mức | Select | `P1`/`P2`/`P3` |
| `domain` | Mảng | Link `TC Domain` | reqd |
| `title` | Tiêu đề | Data | reqd |
| `description` | Chi tiết | Small Text | con số cụ thể |
| `source_rule` | Rule | Data | vd `RULE-POS-01` |
| `user` | User liên quan | Link `User` | optional (hành vi cá nhân) |
| `ref_doctype` | Ref DocType | Link `DocType` | optional |
| `ref_name` | Ref | Dynamic Link → `ref_doctype` | click ra document |
| `status` | Trạng thái | Select | `Open`/`Acked`/`Resolved`/`Muted`, default `Open` |
| `first_seen` | Lần đầu | Datetime | |
| `last_seen` | Gần nhất | Datetime | |
| `occurrence_count` | Số lần | Int | default 1 |
| `dedup_key` | Dedup key | Data | **index**, read_only |
| `acked_by` | Ack bởi | Link `User` | read_only |
| `acked_at` | Ack lúc | Datetime | read_only |
| `resolved_at` | Resolve lúc | Datetime | read_only |
| `muted_until` | Mute tới | Datetime | read_only |

**Index:** `dedup_key`; composite `(status, severity)`, `(domain, status)`; `creation` (mặc định có). Khai qua `add_index` trong `after_migrate`/install hoặc trường `search_index=1` trên `dedup_key`.

### 2.3 `TC Rule` — registry rule
`autoname: field:rule_code`.

| Fieldname | Label | Type | Ghi chú |
|---|---|---|---|
| `rule_code` | Mã | Data | reqd, unique |
| `title` | Tên | Data | reqd |
| `domain` | Mảng | Link `TC Domain` | reqd |
| `default_severity` | Mức mặc định | Select | `P1`/`P2`/`P3` |
| `enabled` | Bật | Check | Batch A =1, Batch B =0 |
| `schedule` | Lịch | Select | `every_5min`/`every_15min`/`hourly`/`daily`/`event` |
| `params` | Tham số | JSON/Code | ngưỡng, %, giờ… |
| `method_path` | Hàm | Data | dotted path Python |
| `last_run` | Chạy lúc | Datetime | read_only |
| `last_error` | Lỗi gần nhất | Small Text | read_only |

*(Thêm `schedule=event` cho RULE-SEC-01 chạy qua doc_events, không cron — dispatcher bỏ qua rule `event`.)*

### 2.4 `TC Obligation` — Sổ Nghĩa Vụ Định Kỳ
`autoname: NVDK-.####`.

| Fieldname | Label | Type | Ghi chú |
|---|---|---|---|
| `loai` | Loại | Select | `Giay phep ATTP`/`Cong bo - TCCS`/`Audit - Chung nhan`/`Hop dong`/`Hieu chuan thiet bi`/`Dang kiem - Bao hiem xe`/`Kham suc khoe`/`Dao tao`/`Khac` |
| `ten` | Tên | Data | reqd |
| `doi_tuong_doctype` | Đối tượng (DocType) | Link `DocType` | optional |
| `doi_tuong` | Đối tượng | Dynamic Link → `doi_tuong_doctype` | Supplier/Employee/Asset/Customer… |
| `ngay_het_han` | Ngày hết hạn | Date | reqd |
| `lead_p3_ngay` | Lead P3 (ngày) | Int | default 60 |
| `lead_p2_ngay` | Lead P2 (ngày) | Int | default 30 |
| `chu_ky_gia_han_thang` | Chu kỳ gia hạn (tháng) | Int | |
| `trang_thai` | Trạng thái | Select | `Hieu luc`/`Dang gia han`/`Het han` |
| `ghi_chu` | Ghi chú | Small Text | |
| `file_scan` | File scan | Attach | đính kèm |

### 2.5 `TC Settings` (Single) + child `TC POS Watch`

`TC Settings`:
| Fieldname | Label | Type | Ghi chú |
|---|---|---|---|
| `telegram_bot_token` | Bot token | Password | **seed rỗng** |
| `telegram_chat_id` | Chat ID | Data | **seed rỗng** |
| `gio_lam_viec_tu` | Giờ làm từ | Time | default 07:30 |
| `gio_lam_viec_den` | Giờ làm đến | Time | default 17:30 |
| `digest_hour` | Giờ digest | Int | default 7 |
| `sla_duyet_gio` | SLA duyệt (giờ) | Int | default 4 |
| `sla_doctypes` | DocType áp SLA | Small Text | seed 8 dòng (Gate 0 "mở rộng") |
| `perm_whitelist_users` | User whitelist perm | Small Text | seed `Administrator` |
| `channel_source` | Nguồn mapping kênh | Select | `pkd`/`settings`, default **`pkd`** |
| `kenh_mapping` | Mapping kênh (fallback) | Table `TC Channel Map` | dùng khi `channel_source=settings` hoặc pkd không cài |

> Thêm doctype con thứ 7 nhỏ **`TC Channel Map`** (child): `customer_group` (Link Customer Group), `kenh` (Select `MT`/`NPP`/`DL`/`Khac`). Là fallback cho quyết định "reuse pkd" — xem §4 R1.

`TC POS Watch` (child của TC Settings):
| Fieldname | Label | Type |
|---|---|---|
| `pos_profile` | POS Profile | Link `POS Profile` |
| `gio_mo_cham_nhat` | Giờ mở chậm nhất | Time (vd 08:00) |
| `hoat_dong_cn` | Mở Chủ nhật | Check |

**Tổng: 7 DocType** (5 chính + 2 child: `TC POS Watch`, `TC Channel Map`).

---

## 3. Permission matrix

Role mới **`Tac Chien`**. Quyền **thêm trong `install.py`** qua `frappe.permissions.add_permission()` (KHÔNG `custom_docperm.json` — bài học iso22000_fsms). Role record ship qua fixtures; permission gán bằng code idempotent.

| DocType | `Tac Chien` | `System Manager` | Ghi chú |
|---|---|---|---|
| TC Signal | read, write (ack/resolve/mute qua API) | full | tạo chỉ qua `emit_signal` (ignore_permissions) |
| TC Domain | read | full | seed fixtures |
| TC Rule | read, write (bật/tắt/ngưỡng) | full | |
| TC Obligation | read, write, create, delete | full | nhập sổ nghĩa vụ |
| TC Settings | read, write | full | cấu hình |

- SPA www context check `Tac Chien` (hoặc `System Manager`) → thiếu = 403.
- Mọi whitelisted method có `_guard()` role-check **ở dòng đầu**. UI gate chỉ tiện dụng; quyền thật ở server.

---

## 4. Integration & hooks plan (`hooks.py`)

```python
app_name = "tacchien"; app_version = "0.1.0"

after_install = "tacchien.install.after_install"

scheduler_events = {
    "cron": {
        "* * * * *": ["tacchien.tc.dispatcher.tick"],   # dispatcher registry
    },
    # digest & backup-check giờ cố định gọi từ dispatcher theo params rule,
    # KHÔNG hardcode thêm cron ở đây (mọi lịch nằm trong TC Rule.params)
}

doc_events = {
    "User":            {"after_insert": "...sec.on_perm_change", "on_update": "...sec.on_perm_change", "on_trash": "...sec.on_perm_change"},
    "Has Role":        {"after_insert": "...sec.on_perm_change", "on_trash": "...sec.on_perm_change"},
    "Custom DocPerm":  {"after_insert": "...sec.on_perm_change", "on_update": "...sec.on_perm_change", "on_trash": "...sec.on_perm_change"},
    "Role Permission for Page and Report": {...},   # RULE-SEC-01
}

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Tac Chien"]]]},
    {"dt": "TC Domain"},
    {"dt": "TC Rule"},
]

website_route_rules = [{"from_route": "/tc/<path:app_path>", "to_route": "tc"}]
```

**Producers → emit_signal (§5):** dispatcher chạy cron rule; `doc_events` bắt RULE-SEC-01; `RULE-OBL-01` quét `TC Obligation`.

**Integration với core ERPNext (đọc, không sửa):** POS Opening Entry, POS Profile, Bin/Stock Ledger (tồn âm), Sales Invoice(+Item), Customer, Payment Entry, Purchase Order, Item Reorder, Error Log, Backup. SQL đọc-only, mỗi `frappe.db.sql` có comment mục đích (house style).

### R1 — Reuse mapping kênh từ `pkd` (an toàn migrate)
Gate 0 chọn "tái dùng pkd" nhưng `pkd` có thể **chưa cài** trên `dev.rvhg` → nếu `import pkd...` ở top-level sẽ `ModuleNotFoundError` giết cả app. Thiết kế:

```python
# tacchien/tc/channels.py
def resolve_channel_map():
    src = get_settings().channel_source          # 'pkd' | 'settings'
    if src == "pkd":
        try:
            from pkd.api.channels import channel_map_by_group   # lazy, guarded
            return channel_map_by_group()
        except Exception:
            frappe.log_error("pkd channel map unavailable, fallback to Settings", "tacchien")
    # fallback: build từ TC Channel Map + cây Customer Group (nested set lft/rgt), cache 10'
    return _build_from_settings()
```
→ "reuse pkd khi có, tự đứng khi không". Doanh thu theo kênh: lọc `is_opening!='Yes'`, return tính âm, aligned so kỳ (frappe-sales-analytics).

---

## 5. `emit_signal()` — cửa duy nhất tạo signal

```
emit_signal(signal_type, severity, domain, title, description="",
            source_rule=None, user=None, ref_doctype=None, ref_name=None):
  key = sha1(source_rule|domain|ref_doctype|ref_name|normalize(title))
  existing = TC Signal where dedup_key=key AND status in (Open, Acked)  [for update]
  muted    = TC Signal where dedup_key=key AND status=Muted AND muted_until > now
  if muted:  return            # nuốt luôn, không tạo
  if existing:
      occurrence_count += 1; last_seen = now
      if sev_rank(severity) > sev_rank(existing.severity): existing.severity = severity  # escalate
      save(ignore_permissions)               # KHÔNG realtime/notify lại
      return existing.name
  doc = insert TC Signal(... first_seen=last_seen=now, occurrence_count=1) ignore_permissions
  # after_insert hook trên TC Signal lo:
  #   frappe.publish_realtime("tc_signal_new", payload)
  #   if P1: frappe.enqueue(tacchien.tc.notify.telegram.send, ...)  # KHÔNG sync
  return doc.name
```
- Notify/realtime nằm ở `after_insert` của TC Signal, **không** trong request/transaction gọi rule. P1 luôn qua `enqueue`.
- `sev_rank`: P1>P2>P3.

---

## 6. Bộ rule phase 1 (18 rule, seed TC Rule)

**Batch A `enabled=1` khi ship; Batch B `enabled=0`** (bật sau ≥1 tuần chạy êm — kỷ luật, không thương lượng). Ngưỡng trong `params`.

| Mã | Mảng | Batch | Sev | schedule | method_path (tacchien.tc.rules.*) |
|---|---|---|---|---|---|
| RULE-POS-01 | Hệ thống | A | P1 | every_5min | `pos.opening_late` (khung 07:30–09:30) |
| RULE-POS-02 | Hệ thống | A | P1 | hourly+daily | `pos.opening_stuck_open` |
| RULE-INV-01 | Kho | A | P1 | every_15min | `inventory.negative_stock` |
| RULE-INV-02 | Kho | A | P2/P3 | daily | `inventory.expiry_soon` |
| RULE-AR-01 | Tài chính | A | P2 | hourly | `finance.credit_limit` |
| RULE-AR-02 | Tài chính | A | P2 | daily | `finance.overdue_ar` |
| RULE-FLOW-01 | Nhịp bộ phận | A | P2 | hourly (giờ làm) | `flow.draft_sla` (8 doctype §Gate0) |
| RULE-SEC-01 | Hệ thống | A | P1 | **event** | `security.perm_change` (doc_events) |
| RULE-OBL-01 | Pháp lý+ | A | P1/P2/P3 | daily 06:30 | `obligation.scan` |
| RULE-SYS-02 | Hệ thống | A | P2 | daily 07:00 | `system.backup_check` |
| RULE-INV-03 | Kho | B | P2 | daily | `inventory.below_reorder` |
| RULE-FIN-01 | Tài chính | B | P2 | daily | `finance.ap_vs_inflow` |
| RULE-SAL-01 | Bán hàng | B | P2 | every_15min | `sales.price_variance` |
| RULE-SAL-02 | Bán hàng | B | P3 | 11:00 & 16:00 | `sales.revenue_pace` |
| RULE-PUR-01 | Mua hàng | B | P1/P3 | daily | `purchase.po_overdue` |
| RULE-FLOW-02 | Nhịp bộ phận | B | P3 | daily 07:00 | `flow.overnight_draft` |
| RULE-SEC-02 | Hệ thống | B | P2 | every_15min | `security.cancel_amend_spike` |
| RULE-SYS-01 | Hệ thống | B | P2 | every_5min | `system.queue_error_anomaly` |

**Dispatcher `tick()`** (cron mỗi phút): đọc TC Rule `enabled=1 AND schedule!=event`, lọc rule "đến hạn" (so `last_run` với schedule + params khung giờ), chạy **mỗi rule trong try/except riêng**, cập nhật `last_run`/`last_error` + Error Log khi lỗi. Một rule chết không giết batch.

---

## 7. Backend API (`tacchien/api/*.py`, whitelisted, `_guard` dòng đầu)

| Method | Trả |
|---|---|
| `overview.get_overview()` | 1 call cho `#/`: health 13 mảng, 4 metric nhịp, sparkline 14 ngày, top 10 signal. **Cache server TTL 30s** (`frappe.cache`) vì TV polling |
| `domain.get_domain(domain)` | metric mảng + list signal + link desk (sâu: Tài chính/Kho/Bán hàng) |
| `bophan.get_bophan()` | bảng [bộ phận · hoạt động hôm nay · điểm tắc · pill]; data từ `owner+creation+docstatus` — **KHÔNG** query `tabVersion`/`tabActivity Log` |
| `signals.get_signals(**filters)` | feed + filter (severity/domain/status/user), pagination |
| `signals.act_on_signal(name, action, muted_until=None)` | ack/resolve/mute |
| `digest.get_digest()` | digest hôm nay cho SPA |

Số liệu doanh thu: `is_opening!='Yes'`, return âm, kênh qua §4 R1, period-aligned.

---

## 8. SPA `/tc` (theo `frappe-portal-spa` + design-system `tc-`)

- www page `tc.html` + `tc.py` (context check role → 403). `window.TC_CONTEXT = {user, roles, assetVersion, csrfToken}`.
- Vanilla ES module **code-split**, hash router, **import-map cache-bust mọi shared module** (luật vàng #1), `withV()` cho view động. **CSS prefix `tc-` toàn bộ** (không class trần). `escapeHtml` mọi render. Chart.js lazy + destroy trước vẽ lại.
- Style: kế thừa `design-system.md` — token `:root`, glass header 56px + bottom-nav, card bo tròn, semantic color cho severity (P1=danger, P2=warning, sạch=success). **Đây là app nội bộ/monitor** nên có thể rút còn 1 theme (bỏ season-picker) — health strip cần màu ngữ nghĩa ổn định, không đổi theo mùa.

**Realtime** subscribe `tc_signal_new` → prepend + update; fallback polling 60s. **TV mode** `#/?tv=1` ẩn nav, phóng font, refresh 60s.

> **⟳ IA sửa đổi (redesign 3 trụ — thay thế "4 routes" cũ):** SPA tổ chức quanh **3 trụ**
> làm điều hướng cấp cao (bottom-nav), phân loại bằng field **`pillar`** (`giam_sat`/`bao_cao`)
> trên TC Rule + TC Domain, gán vào TC Signal lúc `emit_signal`.
>
> | Trụ | Route | Nội dung |
> |---|---|---|
> | **Báo cáo hoạt động** (mặc định) | `#/` | KPI nghiệp vụ + sparkline + thẻ mảng `bao_cao` (drill-down) + tóm tắt nhịp bộ phận + feed. API `baocao.get_baocao` |
> | **Giám sát an toàn** | `#/giamsat` | Bảng chỉ số an toàn: mỗi mảng `giam_sat` → rule làm indicator (enabled/last_run/last_error + signal mở → dot xanh/vàng/đỏ/xanh dương/tắt), read-only. API `giamsat.get_giamsat` |
> | **Hành động** | `#/hanhdong` (alias `#/signals`) | Hàng đợi **mọi** signal mở + filter (trụ/severity/mảng/trạng thái) + ack/resolve/mute optimistic. API `signals.get_signals`+`act_on_signal` |
> | Drill-down | `#/domain/:name`, `#/bophan` | giữ nguyên |
>
> "2 lăng kính, cùng dữ liệu": signal `giam_sat` mở tô đỏ ô Giám sát **và** nằm trong hàng đợi
> Hành động. Bảng phân loại pillar là fixture-data, sửa fixture + `migrate` là đổi (patch
> `backfill_signal_pillar` cập nhật signal cũ).

---

## 9. Fixtures plan

| Fixture | Cách ship |
|---|---|
| Role `Tac Chien` | fixtures JSON (record Role rỗng, permission gán ở install.py) |
| TC Domain (13) | fixtures JSON — cluster/sort_order/is_active |
| TC Rule (18) | fixtures JSON — code/domain/sev/enabled(A=1,B=0)/schedule/params/method_path |
| Permissions | **install.py** `add_permission` (không fixture) |
| TC Settings defaults | install.py set field (sla_doctypes 8 dòng, perm_whitelist=Administrator, channel_source=pkd) |

> Không bench để `export-fixtures` → tôi **author JSON đúng format bench export** rồi chạy `scripts/validate_shipped_docs.py` (0 ERROR). Sau khi anh `bench install`, khuyến nghị `bench export-fixtures` 1 lần để canonicalize.

---

## 10. Kỷ luật kỹ thuật (non-negotiable — brief §8)

Python-in-app (không Server/Client Script) · fieldname ASCII · fixtures validator 0 ERROR · permissions trong install.py · mọi module có `__init__.py` · verify `py_compile`+`node --check`+validator · `emit_signal` là cửa duy nhất · notify không sync · test tối thiểu (dedup 3 case, OBL-01, AR-02, act_on_signal permission) · deploy migrate→build→restart→refresh · commit-per-feature push nhánh dev.

---

## 11. Thứ tự build (mỗi bước 1 commit; approval nhỏ nếu anh muốn)

1. **Scaffold** app + 7 DocType + fixtures (13 domain, 18 rule, Role) + install.py → verify.
2. **emit_signal** + dispatcher + RULE-POS-01/POS-02/INV-01 + test dedup.
3. **Telegram** notifier adapter + digest 07:00.
4. **SPA shell** + `#/` tổng quan + realtime + TV mode.
5. **#/signals** + ack/resolve/mute.
6. Rules Batch A còn lại (AR-01/02, FLOW-01, SEC-01 event, OBL-01, SYS-02) + `#/bophan` + 3 domain view sâu.
7. **Verify-before-ship** checklist + deploy runbook + hướng dẫn bật Batch B.

---

## 12. Định nghĩa Done (brief §11) — cách verify tại đây

Vì không có bench, tôi verify được: `py_compile` toàn bộ Python · `node --check` mọi JS · validator fixtures 0 ERROR · rà `__init__.py` mọi module · JSON DocType hợp lệ. **Các mục cần bench (install sạch, realtime, Telegram <30s, digest, dedup runtime, RULE-POS-02 case)** → anh chạy theo runbook, tôi cung cấp lệnh + kịch bản test bench console.

---

## 13. Rủi ro & giả định cần anh xác nhận

| # | Vấn đề | Giả định của tôi | Cần anh |
|---|---|---|---|
| R1 | `pkd` chưa cài trên dev | lazy-import + fallback TC Channel Map | OK không? nếu pkd chắc chắn có, tôi bỏ fallback UI |
| R2 | Tên hàm mapping trong `pkd` | đoán `pkd.api.channels.channel_map_by_group` | anh cho path thật, hoặc để tôi dùng fallback + để anh sửa 1 dòng |
| R3 | Fixtures author tay (không bench) | đúng format export, validator pass | chấp nhận re-export sau install |
| R4 | `TC Channel Map` = doctype thứ 7 | thêm để có fallback | nếu không muốn, tôi ép channel_source=pkd cứng |
| R5 | Digest/SYS-02/OBL-01 giờ cố định | lịch nằm trong rule.params, dispatcher so giờ | OK dùng dispatcher, không thêm cron riêng |
| R6 | Backup-check nguồn | đọc `Backup`/thư mục backup site | xác nhận cơ chế backup dev |
```
