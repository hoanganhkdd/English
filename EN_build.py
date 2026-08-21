#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EN_build.py — Tạo file EN_Business_Vocab_2000.xlsx từ dữ liệu EN_seed_*.txt
===========================================================================
Chạy 1 lần để dựng file. Sau đó dùng:
  • Sheet "➕ THÊM TỪ MỚI"  ➜ gõ từ mới ➜ chạy EN_add.bat
  • Sheet "⚙️ NHẬP VIDEO"   ➜ dán link YouTube ➜ chạy EN_video.bat

python EN_build.py
"""

import sys
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, str(Path(__file__).resolve().parent))
from EN_common import (  # noqa: E402
    ADD_START_ROW, CELL_LINK, C_AUDIO, C_CHECK, C_DATE, C_DAY1, C_EX, C_EXVI,
    C_IPA, C_LEVEL, C_NOTE, C_ROOT, C_STT, C_TOPIC, C_TRY1, C_TRY2, C_VIET,
    C_WORD, C_YOUG, FIRST_DATA_ROW, HEADER_ROW, HISTORY_START_ROW, N_COLS,
    ROW_HEIGHT, SCRIPT_DIR, SHEET_ADD, SHEET_INPUT, SHEET_PASTE, SHEET_VOCAB,
    XLSX_FILE, audio_url, dict_url, log, to_ipa, youglish_url,
)

THIN = Side(style="thin", color="D0D0D0")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

HEADERS = [
    "STT", "CẤP ĐỘ", "🔤 ENGLISH", "🔊 IPA", "🇻🇳 TIẾNG VIỆT",
    "📝 VIẾT THỬ 1", "📝 VIẾT THỬ 2", "✅ ĐÁP ÁN", "🎵 AUDIO", "🌐 YOUGLISH",
    "DAY 1", "DAY 2", "DAY 3", "DAY 4", "DAY 5", "DAY 6", "DAY 7",
    "📅 NGÀY THÊM", "⚠️ GHI CHÚ", "🌱 GỐC TỪ & CỤM TỪ ĐI KÈM",
    "📂 CHỦ ĐỀ", "💡 CÂU VÍ DỤ (English)", "🇻🇳 NGHĨA CÂU VÍ DỤ",
]

WIDTHS = [6, 10, 26, 26, 30, 20, 20, 12, 9, 11,
          7, 7, 7, 7, 7, 7, 7, 14, 26, 52, 26, 46, 46]


# ────────────────────────────── Đọc dữ liệu gốc ───────────────────────────────
def read_seed():
    rows = []
    for f in sorted(SCRIPT_DIR.glob("EN_seed_*.txt")):
        if f.name == "EN_seed_all.txt":
            continue
        for ln in f.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if not ln or ln.startswith("#"):
                continue
            p = ln.split("|")
            if len(p) != 6:
                log(f"  [!] Bỏ dòng sai định dạng trong {f.name}: {ln[:50]}")
                continue
            rows.append({
                "word": p[0].strip(), "viet": p[1].strip(), "root": p[2].strip(),
                "topic": p[3].strip(), "ex": p[4].strip(), "ex_vi": p[5].strip(),
            })
    # bỏ trùng, giữ thứ tự
    seen, out = set(), []
    for r in rows:
        k = r["word"].lower()
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


# ────────────────────────────── Sheet từ vựng ─────────────────────────────────
def build_vocab(wb, data):
    ws = wb.create_sheet(SHEET_VOCAB)
    ws.sheet_properties.tabColor = "1565C0"

    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Hàng 1 — thống kê
    n = len(data) + 3
    stats = {
        6: f'=COUNTA(F{FIRST_DATA_ROW}:F{n + 2000})',
        7: f'=SUBTOTAL(103,G{FIRST_DATA_ROW}:G{n + 2000})',
        8: (f'=COUNTIF(H{FIRST_DATA_ROW}:H{n + 2000},"*Đúng*")&" đúng / "'
            f'&COUNTA(G{FIRST_DATA_ROW}:G{n + 2000})&" đã viết"'),
        21: f'=COUNTA(U{FIRST_DATA_ROW}:U{n + 2000})&" từ"',
    }
    for c in range(11, 18):
        L = get_column_letter(c)
        stats[c] = f'=COUNTA({L}{FIRST_DATA_ROW}:{L}{n + 2000})'
    for c, f in stats.items():
        cell = ws.cell(1, c, f)
        cell.font = Font(bold=True, size=9, color="1565C0")
        cell.alignment = Alignment(horizontal="center")
    ws.row_dimensions[1].height = 18

    # Hàng 2 — tiêu đề
    t = ws.cell(2, 1,
                f"🌍 TỪ VỰNG TIẾNG ANH XUẤT NHẬP KHẨU — {len(data)} TỪ | "
                f"Gốc từ · Chủ đề · Tự chấm | Cập nhật "
                f"{datetime.now():%Y-%m-%d}")
    t.font = Font(size=14, bold=True, color="FFFFFF")
    t.fill = PatternFill("solid", fgColor="0D47A1")
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=N_COLS)
    t.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 26

    # Hàng 3 — header
    for j, h in enumerate(HEADERS, 1):
        c = ws.cell(HEADER_ROW, j, h)
        c.font = Font(bold=True, size=10, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="37474F")
        c.alignment = Alignment(horizontal="center", vertical="center",
                                wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[HEADER_ROW].height = 34

    # Dữ liệu
    for i, d in enumerate(data):
        r = FIRST_DATA_ROW + i
        write_row(ws, r, i + 1, d)

    last = FIRST_DATA_ROW + len(data) - 1
    finish_sheet(ws, last)
    return ws, last


def write_row(ws, r, stt, d, level="TRADE", note=None, topic_link=None):
    ws.cell(r, C_STT, stt).alignment = Alignment(horizontal="center",
                                                 vertical="center")
    ws.cell(r, C_LEVEL, level).alignment = Alignment(horizontal="center",
                                                     vertical="center")

    w = ws.cell(r, C_WORD, d["word"])
    w.font = Font(size=14, bold=True, color="0D47A1")
    w.alignment = Alignment(horizontal="center", vertical="center",
                            wrap_text=True)

    ipa = ws.cell(r, C_IPA, d.get("ipa") or to_ipa(d["word"]))
    ipa.font = Font(size=11, italic=True, color="00695C")
    ipa.alignment = Alignment(horizontal="center", vertical="center",
                              wrap_text=True)

    v = ws.cell(r, C_VIET, d["viet"])
    v.font = Font(size=11)
    v.alignment = Alignment(horizontal="left", vertical="center",
                            wrap_text=True)

    for c in (C_TRY1, C_TRY2):
        cell = ws.cell(r, c, None)
        cell.fill = PatternFill("solid", fgColor="FFFDE7")
        cell.alignment = Alignment(horizontal="center", vertical="center")

    ws.cell(r, C_CHECK,
            f'=IF(TRIM($G{r})="","",IF(EXACT(LOWER(TRIM($G{r})),'
            f'LOWER(TRIM($C{r}))),"✅ Đúng","❌ Sai"))'
            ).alignment = Alignment(horizontal="center", vertical="center")

    a = ws.cell(r, C_AUDIO, "▶")
    a.hyperlink = audio_url(d["word"])
    a.font = Font(size=13, color="1565C0")
    a.alignment = Alignment(horizontal="center", vertical="center")

    y = ws.cell(r, C_YOUG, "🔍")
    y.hyperlink = youglish_url(d["word"])
    y.font = Font(size=13, color="1565C0")
    y.alignment = Alignment(horizontal="center", vertical="center")

    for c in range(C_DAY1, C_DAY1 + 7):
        cell = ws.cell(r, c, None)
        cell.fill = PatternFill("solid", fgColor="F1F8E9")
        cell.alignment = Alignment(horizontal="center", vertical="center")

    dt = ws.cell(r, C_DATE, d.get("date") or f"{datetime.now():%Y-%m-%d}")
    dt.font = Font(size=9, color="777777")
    dt.alignment = Alignment(horizontal="center", vertical="center")

    nt = ws.cell(r, C_NOTE, note or "")
    nt.font = Font(size=9, color="D84315")
    nt.alignment = Alignment(horizontal="left", vertical="center",
                             wrap_text=True)

    rt = ws.cell(r, C_ROOT, d["root"])
    rt.font = Font(size=9)
    rt.alignment = Alignment(horizontal="left", vertical="center",
                             wrap_text=True)

    tp = ws.cell(r, C_TOPIC, d["topic"])
    tp.alignment = Alignment(horizontal="left", vertical="center",
                             wrap_text=True)
    if topic_link:
        tp.hyperlink = topic_link
        tp.font = Font(size=9, bold=True, color="1565C0", underline="single")
    else:
        tp.font = Font(size=9, bold=True, color="4E342E")

    ex = ws.cell(r, C_EX, d.get("ex", ""))
    ex.font = Font(size=10, color="1B5E20")
    ex.alignment = Alignment(horizontal="left", vertical="center",
                             wrap_text=True)

    exv = ws.cell(r, C_EXVI, d.get("ex_vi", ""))
    exv.font = Font(size=10, italic=True, color="555555")
    exv.alignment = Alignment(horizontal="left", vertical="center",
                              wrap_text=True)

    for c in range(1, N_COLS + 1):
        ws.cell(r, c).border = BORDER
    ws.row_dimensions[r].height = ROW_HEIGHT

    if r % 2 == 0:
        for c in (C_WORD, C_IPA, C_VIET, C_ROOT, C_EX, C_EXVI):
            if ws.cell(r, c).fill.fgColor.rgb in (None, "00000000"):
                ws.cell(r, c).fill = PatternFill("solid", fgColor="FAFAFA")


def finish_sheet(ws, last):
    ws.freeze_panes = f"F{FIRST_DATA_ROW}"
    ws.auto_filter.ref = f"A{HEADER_ROW}:{get_column_letter(N_COLS)}{last}"
    ws.conditional_formatting.add(
        f"H{FIRST_DATA_ROW}:H{last}",
        CellIsRule(operator="containsText", formula=['"Đúng"'],
                   fill=PatternFill("solid", fgColor="C8E6C9")))
    ws.conditional_formatting.add(
        f"H{FIRST_DATA_ROW}:H{last}",
        CellIsRule(operator="containsText", formula=['"Sai"'],
                   fill=PatternFill("solid", fgColor="FFCDD2")))
    dv = DataValidation(type="list", formula1='"✔,△,✗"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"K{FIRST_DATA_ROW}:Q{last}")


# ────────────────────────────── Sheet nhập video ──────────────────────────────
def build_input(wb):
    ws = wb.create_sheet(SHEET_INPUT, 0)
    ws.sheet_properties.tabColor = "C62828"
    for col, w in (("A", 30), ("B", 62), ("C", 46), ("D", 14), ("E", 12)):
        ws.column_dimensions[col].width = w

    ws["A1"] = "🎬 NHẬP LINK VIDEO ➜ TỰ ĐỘNG THÊM TỪ MỚI"
    ws["A1"].font = Font(size=14, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor="B71C1C")
    ws.merge_cells("A1:C1")
    ws.row_dimensions[1].height = 26

    rows = [
        ("🔗 LINK VIDEO  ▸ dán vào đây", "",
         "Dán link YouTube rồi chạy EN_video.bat"),
        ("🔢 Số từ mới tối đa", 40, "Lấy N từ tần suất cao nhất (0 = lấy hết)"),
        ("✂️ Số ký tự tối thiểu", 4, "4 = bỏ từ quá ngắn (the, and, is…)"),
        ("🚫 Bỏ từ thông dụng", "Có", "Có / Không  (the, is, you, get…)"),
        ("🌐 Ngôn ngữ phụ đề", "auto", "auto  hoặc  en / en-US / en-GB"),
        ("📊 TRẠNG THÁI", "— chưa chạy —", "Script tự cập nhật sau mỗi lần chạy"),
        ("🎞️ Nguồn phụ đề", "auto", "auto / mota / dan"),
    ]
    for i, (lab, val, hint) in enumerate(rows, start=2):
        ws.cell(i, 1, lab).font = Font(bold=True, size=11)
        ws.cell(i, 1).fill = PatternFill("solid", fgColor="FFF3E0")
        ws.cell(i, 2, val)
        ws.cell(i, 3, hint).font = Font(size=9, italic=True, color="777777")
        ws.row_dimensions[i].height = 20
    ws[CELL_LINK].font = Font(size=12, bold=True, color="1565C0")
    ws[CELL_LINK].fill = PatternFill("solid", fgColor="FFFDE7")
    ws.row_dimensions[2].height = 28

    ws["A9"] = "📜 LỊCH SỬ VIDEO ĐÃ XỬ LÝ"
    ws["A9"].font = Font(bold=True, size=12, color="FFFFFF")
    ws["A9"].fill = PatternFill("solid", fgColor="1565C0")
    ws.merge_cells("A9:E9")
    for j, h in enumerate(["📅 NGÀY", "🎬 VIDEO", "🔗 LINK", "🆕 TỪ MỚI",
                           "🔁 ĐÃ CÓ"], 1):
        c = ws.cell(HISTORY_START_ROW - 1, j, h)
        c.font = Font(bold=True, size=10, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="546E7A")
        c.alignment = Alignment(horizontal="center")
    ws.freeze_panes = f"A{HISTORY_START_ROW}"
    return ws


# ────────────────────────────── Sheet dán phụ đề ──────────────────────────────
def build_paste(wb):
    ws = wb.create_sheet(SHEET_PASTE, 1)
    ws.sheet_properties.tabColor = "F9A825"
    ws.column_dimensions["A"].width = 80
    ws.column_dimensions["B"].width = 40
    ws["A1"] = "📋 DÁN TIẾNG ANH VÀO ĐÂY (dùng khi video không có phụ đề)"
    ws["A1"].font = Font(size=13, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor="EF6C00")
    ws.merge_cells("A1:B1")
    ws.row_dimensions[1].height = 24
    ws["A2"] = ("Mỗi dòng 1 câu. Chép từ mô tả video, bài báo, email khách hàng "
                "hay gõ lại chữ trên màn hình. Lẫn tiếng Việt cũng được — "
                "script tự lọc.")
    ws["A2"].font = Font(size=9, italic=True, color="777777")
    ws.merge_cells("A2:B2")
    ws["A3"] = "▼ Bắt đầu dán từ dòng 4 ▼"
    ws["A3"].font = Font(bold=True, size=10, color="EF6C00")
    ws.freeze_panes = "A4"
    return ws


# ────────────────────────────── Sheet thêm từ mới ─────────────────────────────
def build_add(wb):
    ws = wb.create_sheet(SHEET_ADD, 2)
    ws.sheet_properties.tabColor = "2E7D32"
    for col, w in (("A", 28), ("B", 34), ("C", 30), ("D", 52), ("E", 40)):
        ws.column_dimensions[col].width = w

    ws["A1"] = "➕ GÕ TỪ MỚI VÀO ĐÂY ➜ CHẠY EN_add.bat"
    ws["A1"].font = Font(size=14, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor="2E7D32")
    ws.merge_cells("A1:E1")
    ws.row_dimensions[1].height = 26

    ws["A2"] = ("Chỉ CỘT A là bắt buộc. Bỏ trống các cột khác thì script tự "
                "điền: IPA, nghĩa tiếng Việt, gốc từ, câu ví dụ. "
                "Từ đã có trong file sẽ tự động bị bỏ qua.")
    ws["A2"].font = Font(size=9, italic=True, color="777777")
    ws.merge_cells("A2:E2")
    ws.row_dimensions[2].height = 30
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="center")

    heads = ["🔤 TỪ / CỤM TỪ (bắt buộc)", "🇻🇳 NGHĨA (bỏ trống = tự dịch)",
             "📂 CHỦ ĐỀ (tuỳ chọn)", "💡 CÂU VÍ DỤ (tuỳ chọn)",
             "🌱 GỐC TỪ (tuỳ chọn)"]
    for j, h in enumerate(heads, 1):
        c = ws.cell(3, j, h)
        c.font = Font(bold=True, size=10, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="43A047")
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    ws.row_dimensions[3].height = 30

    for r in range(ADD_START_ROW, ADD_START_ROW + 40):
        for c in range(1, 6):
            ws.cell(r, c).border = BORDER
        ws.cell(r, 1).fill = PatternFill("solid", fgColor="F1F8E9")
    ws.freeze_panes = f"A{ADD_START_ROW}"
    return ws


# ────────────────────────────── Sheet hướng dẫn ───────────────────────────────
def build_guide(wb):
    ws = wb.create_sheet("📖 HƯỚNG DẪN")
    ws.sheet_properties.tabColor = "6A1B9A"
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 100

    ws["B1"] = "📖 HƯỚNG DẪN SỬ DỤNG"
    ws["B1"].font = Font(size=16, bold=True, color="FFFFFF")
    ws["B1"].fill = PatternFill("solid", fgColor="6A1B9A")
    ws.row_dimensions[1].height = 30

    guide = [
        ("h", "1. CÁCH HỌC HÀNG NGÀY"),
        ("t", "Mở sheet 📚 Từ Vựng ENG. Che cột C (ENGLISH) rồi nhìn cột E "
              "(tiếng Việt) và tự viết lại từ vào cột F hoặc G."),
        ("t", "Cột H tự chấm: ✅ Đúng / ❌ Sai. Không phân biệt hoa thường."),
        ("t", "Cột I ▶ = nghe phát âm. Cột J 🔍 = nghe người bản xứ nói từ đó "
              "trong video thật (Youglish)."),
        ("t", "Cột K→Q (DAY 1..DAY 7) = lịch ôn ngắt quãng. Học xong ngày nào "
              "thì đánh ✔ vào ngày đó. Lịch gợi ý: ngày 1, 2, 4, 7, 15, 30, 60."),
        ("", ""),
        ("h", "2. THÊM TỪ MỚI BẰNG TAY"),
        ("t", "Mở sheet ➕ THÊM TỪ MỚI ➜ gõ từ vào cột A (mỗi dòng 1 từ)."),
        ("t", "Lưu file ➜ đóng Excel ➜ double-click EN_add.bat."),
        ("t", "Script tự điền IPA, nghĩa tiếng Việt, gốc từ, audio, câu ví dụ "
              "và nối xuống cuối sheet từ vựng. Từ trùng sẽ bị bỏ qua."),
        ("", ""),
        ("h", "3. HỌC TỪ MỚI QUA VIDEO YOUTUBE"),
        ("t", "Xem 1 video tiếng Anh (podcast, tin tức, video về logistics…)."),
        ("t", "Mở sheet ⚙️ NHẬP VIDEO ➜ dán link vào ô B2."),
        ("t", "Chỉnh ô B3 (số từ mới tối đa) nếu muốn. Lưu ➜ đóng Excel ➜ "
              "double-click EN_video.bat."),
        ("t", "Script lấy phụ đề ➜ tách từ ➜ BỎ từ đã có ➜ chỉ thêm từ MỚI, "
              "kèm IPA, nghĩa, câu ví dụ lấy từ chính video đó."),
        ("t", "Cột 📂 CHỦ ĐỀ sẽ là tên video và bấm được để mở lại video."),
        ("t", "Nếu video không có phụ đề: dán lời thoại vào sheet 📋 DÁN PHỤ ĐỀ "
              "từ dòng 4, rồi chạy lại."),
        ("", ""),
        ("h", "4. LỆNH NÂNG CAO (mở Command Prompt tại thư mục này)"),
        ("t", "python EN_video.py \"https://youtu.be/XXXX\"     ➜ chạy thẳng 1 link"),
        ("t", "python EN_video.py --check \"link\"               ➜ chẩn đoán video"),
        ("t", "python EN_video.py --text file.txt --title \"Tên\" ➜ nạp từ file text"),
        ("t", "python EN_add.py                                 ➜ thêm từ từ sheet ➕"),
        ("t", "python EN_add.py word1 word2 word3               ➜ thêm nhanh vài từ"),
        ("", ""),
        ("h", "5. LỘ TRÌNH GỢI Ý CHO NGƯỜI LÀM XUẤT KHẨU"),
        ("t", "Tháng 1–2: chủ đề 📄 Chứng từ, 💰 Thanh toán, 📊 Incoterms "
              "(đây là phần bắt buộc phải thuộc lòng)."),
        ("t", "Tháng 3–4: 🚢 Vận tải & Logistics, 🛃 Hải quan & Thuế."),
        ("t", "Tháng 5–6: 🤝 Đàm phán, ✉️ Email thương mại, 💬 Cụm từ giao tiếp."),
        ("t", "Mỗi ngày: 10 từ mới + ôn 20 từ cũ + 1 video 10 phút = khoảng "
              "35 phút."),
        ("t", "Mỗi tuần: viết 1 email thật bằng tiếng Anh dùng ít nhất 10 từ "
              "vừa học."),
    ]
    r = 3
    for kind, text in guide:
        c = ws.cell(r, 2, text)
        if kind == "h":
            c.font = Font(size=12, bold=True, color="4A148C")
            c.fill = PatternFill("solid", fgColor="F3E5F5")
            ws.row_dimensions[r].height = 22
        else:
            c.font = Font(size=10)
            c.alignment = Alignment(wrap_text=True, vertical="top")
            ws.row_dimensions[r].height = 28
        r += 1
    ws.sheet_view.showGridLines = False
    return ws


# ────────────────────────────────── MAIN ──────────────────────────────────────
def main():
    log("=" * 62)
    log("  EN_build — dựng file từ vựng tiếng Anh xuất nhập khẩu")
    log("=" * 62)

    data = read_seed()
    log(f"  ✔ Đọc được {len(data)} từ từ các file EN_seed_*.txt")
    if not data:
        log("  [X] Không có dữ liệu. Cần các file EN_seed_1.txt … trong cùng thư mục.")
        return 1

    log("  ⏳ Đang tra IPA (CMU dictionary)…")
    miss = 0
    for d in data:
        d["ipa"] = to_ipa(d["word"])
        if not d["ipa"]:
            miss += 1
    log(f"  ✔ Xong IPA. Không tra được: {miss} từ")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    build_input(wb)
    build_paste(wb)
    build_add(wb)
    ws, last = build_vocab(wb, data)
    build_guide(wb)
    wb.active = wb.sheetnames.index(SHEET_VOCAB)

    wb.save(XLSX_FILE)
    log(f"  ✔ Đã lưu: {XLSX_FILE.name}")
    log(f"    • {len(data)} từ  ·  dòng dữ liệu cuối = {last}")
    log(f"    • Sheet: {', '.join(wb.sheetnames)}")
    log("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
