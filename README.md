# tacchien — Màn hình tác chiến RVHG

Custom app Frappe/ERPNext **v16**. War room cho Trợ lý Giám đốc + Giám đốc RVHG,
trả lời một câu duy nhất: *"ngay bây giờ có gì cần can thiệp không?"* — nhịp phút→hôm nay.

- **Signal spine**: mọi producer (cron rules, doc_events, Sổ Nghĩa Vụ, Guardian sau này)
  đi qua `emit_signal()` → `TC Signal` (dedup / ack / resolve) → SPA `/tc` realtime,
  Telegram P1, digest 07:00.
- **Chống alert fatigue là ưu tiên #1**: dedup bắt buộc, severity kỷ luật, P3 gom digest.
- Thiết kế & quyết định: xem [`docs/tacchien-blueprint.md`](docs/tacchien-blueprint.md)
  và [`tacchien-build-brief.md`](tacchien-build-brief.md).

## Cài đặt (site dev)

```bash
bench get-app tacchien <git-url>
bench --site dev.rvhg install-app tacchien
bench --site dev.rvhg migrate
bench build --app tacchien
bench restart
```

Sau khi cài: mở **TC Settings** trong Desk → nhập Telegram token/chat_id, thêm POS Watch.
Chi tiết vận hành + bật Batch B: `docs/runbook.md` (Build 7).

## Verify không cần bench

```bash
python3 scripts/validate_shipped_docs.py     # 0 ERROR
python3 -m py_compile $(find tacchien -name '*.py')
```

## Trạng thái build

| Build | Nội dung | Trạng thái |
|---|---|---|
| 1 | Scaffold + 7 DocType + fixtures + install.py | ✅ |
| 2 | emit_signal + dispatcher + 3 rule Batch A + test | ⏳ |
| 3 | Telegram notifier + digest | ⏳ |
| 4 | SPA shell + `#/` tổng quan + realtime | ⏳ |
| 5 | `#/signals` + ack/resolve/mute | ⏳ |
| 6 | Rules Batch A còn lại + `#/bophan` + 3 domain view | ⏳ |
| 7 | Verify-before-ship + runbook Batch B | ⏳ |
