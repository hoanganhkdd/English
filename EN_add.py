#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EN_add.py — Thêm từ mới bằng tay vào EN_Business_Vocab_2000.xlsx
================================================================
CÁCH 1 (khuyên dùng)
  Mở sheet "➕ THÊM TỪ MỚI" ➜ gõ từ vào cột A (mỗi dòng 1 từ)
  ➜ lưu ➜ đóng Excel ➜ double-click EN_add.bat

CÁCH 2 (nhanh, gõ thẳng)
  python EN_add.py invoice demurrage "bill of lading"

Script tự điền: IPA · nghĩa tiếng Việt · gốc từ/tiền hậu tố · audio ·
Youglish · câu ví dụ (dịch tự động). Từ đã có sẽ tự động bị bỏ qua.

Version 1.0 · 2026-08-03
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import openpyxl
except ImportError:
    print("[X] Thiếu openpyxl.  Chạy:  pip install -U openpyxl")
    sys.exit(1)

from EN_common import (  # noqa: E402
    ADD_START_ROW, SHEET_ADD, XLSX_FILE, build_root_note, gtranslate,
    load_root_cache, log, save_root_cache, to_ipa,
)
from EN_writer import (  # noqa: E402
    bump_ranges, existing_words, get_vocab_sheet, last_data_row, safe_save,
    write_words,
)


def read_add_sheet(wb):
    """Đọc các dòng người dùng gõ trong sheet ➕ THÊM TỪ MỚI."""
    if SHEET_ADD not in wb.sheetnames:
        return [], None
    ws = wb[SHEET_ADD]
    rows = []
    for r in range(ADD_START_ROW, ws.max_row + 1):
        w = ws.cell(r, 1).value
        if not w or not str(w).strip():
            continue
        rows.append({
            "row": r,
            "word": str(w).strip(),
            "viet": str(ws.cell(r, 2).value or "").strip(),
            "topic": str(ws.cell(r, 3).value or "").strip(),
            "ex": str(ws.cell(r, 4).value or "").strip(),
            "root": str(ws.cell(r, 5).value or "").strip(),
        })
    return rows, ws


def clear_add_sheet(ws, rows):
    for d in rows:
        for c in range(1, 6):
            ws.cell(d["row"], c).value = None


def main():
    ap = argparse.ArgumentParser(description="Thêm từ tiếng Anh mới vào Excel")
    ap.add_argument("words", nargs="*", help="Từ cần thêm (bỏ trống = đọc sheet)")
    ap.add_argument("--topic", default="✍️ Tự thêm", help="Chủ đề mặc định")
    ap.add_argument("--no-translate", action="store_true",
                    help="Không dịch tự động")
    ap.add_argument("--keep", action="store_true",
                    help="Không xoá nội dung sheet ➕ sau khi thêm")
    args = ap.parse_args()

    log("=" * 62)
    log("  EN_add — thêm từ tiếng Anh mới vào file từ vựng")
    log("=" * 62)

    if not XLSX_FILE.exists():
        log(f"  [X] Không tìm thấy {XLSX_FILE.name}. Chạy EN_build.py trước.")
        return 1

    wb = openpyxl.load_workbook(XLSX_FILE)
    ws = get_vocab_sheet(wb)
    old_last = last_data_row(ws)
    have = existing_words(ws, old_last)

    if args.words:
        raw = [{"row": None, "word": w.strip(), "viet": "", "topic": "",
                "ex": "", "root": ""} for w in args.words if w.strip()]
        ws_add = None
    else:
        raw, ws_add = read_add_sheet(wb)
        if not raw:
            log(f"  [!] Sheet '{SHEET_ADD}' đang trống.")
            log(f"      ➜ Mở file, gõ từ vào cột A từ dòng {ADD_START_ROW},")
            log("        lưu, đóng Excel rồi chạy lại.")
            return 0

    # loại trùng trong chính danh sách nhập + trùng với file
    seen, items, dup = set(), [], 0
    for d in raw:
        k = d["word"].lower()
        if k in have or k in seen:
            dup += 1
            log(f"  ⏭  Bỏ qua (đã có): {d['word']}")
            continue
        seen.add(k)
        items.append(d)

    if not items:
        log(f"  ✅ Không có từ mới nào ({dup} từ đã tồn tại).")
        if ws_add and not args.keep:
            clear_add_sheet(ws_add, raw)
            safe_save(wb, XLSX_FILE)
        return 0

    log(f"  ✔ {len(items)} từ mới  ·  {dup} từ bỏ qua vì trùng")
    log("  ⏳ Đang tra IPA + phân tích gốc từ…")

    cache = load_root_cache()
    for d in items:
        d["ipa"] = to_ipa(d["word"])
        if not d["root"]:
            d["root"] = build_root_note(d["word"], cache=cache)
        if not d["topic"]:
            d["topic"] = args.topic
        d["note"] = "✍️ Tự thêm bằng tay"
        d["level"] = "MY WORD"
    save_root_cache(cache)

    if not args.no_translate:
        need_vi = [d for d in items if not d["viet"]]
        if need_vi:
            log(f"  ⏳ Đang dịch nghĩa {len(need_vi)} từ…")
            res = gtranslate([d["word"] for d in need_vi])
            for i, d in enumerate(need_vi):
                d["viet"] = res[i] if i < len(res) else ""

        need_ex = [d for d in items if d["ex"]]
        if need_ex:
            log(f"  ⏳ Đang dịch {len(need_ex)} câu ví dụ…")
            res = gtranslate([d["ex"] for d in need_ex])
            for i, d in enumerate(need_ex):
                d["ex_vi"] = res[i] if i < len(res) else ""

    start, end = write_words(ws, items, old_last, level="MY WORD")
    bump_ranges(ws, old_last, end)

    if ws_add and not args.keep:
        clear_add_sheet(ws_add, raw)

    if not safe_save(wb, XLSX_FILE):
        return 1

    log("")
    log(f"  ✅ ĐÃ THÊM {len(items)} TỪ  →  dòng {start}–{end}")
    for d in items[:15]:
        log(f"    · {d['word']:<20} {d['ipa']:<24} {d['viet']}")
    log("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
