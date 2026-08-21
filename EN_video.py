#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EN_video.py — YouTube ➜ Từ vựng tiếng Anh ➜ ghi thẳng vào EN_Business_Vocab_2000.xlsx
=====================================================================================
QUY TRÌNH
  1. Xem 1 video → dán link vào ô B2 sheet "⚙️ NHẬP VIDEO" trong file Excel
  2. Script lấy phụ đề tiếng Anh → tách từ → đếm tần suất
  3. Đối chiếu cột C (🔤 ENGLISH) → BỎ từ đã có, CHỈ giữ từ MỚI
  4. Tự điền IPA, nghĩa tiếng Việt, gốc từ, audio, câu ví dụ LẤY TỪ CHÍNH VIDEO
  5. Cột U (📂 CHỦ ĐỀ) = tên video + link bấm được
  → Từ mới nối xuống CUỐI file, dữ liệu cũ giữ nguyên 100%

4 TẦNG LẤY LỜI THOẠI (tự động thử lần lượt)
  1️⃣  Phụ đề CC tiếng Anh (thủ công)
  2️⃣  Phụ đề CC tự động (ASR) tiếng Anh
  3️⃣  Phần MÔ TẢ video
  4️⃣  Sheet "📋 DÁN PHỤ ĐỀ" trong Excel   ← bạn tự dán, luôn chạy được

CÁCH DÙNG
  double-click EN_video.bat
  python EN_video.py
  python EN_video.py "https://youtu.be/XXXX"
  python EN_video.py --check "https://youtu.be/XXXX"      ← chẩn đoán video
  python EN_video.py --text loithoai.txt --title "Tên video"

CÀI THƯ VIỆN
  pip install youtube-transcript-api openpyxl yt-dlp cmudict

Version 1.0 · 2026-08-03
"""

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

MISSING = []
try:
    import openpyxl
except ImportError:
    MISSING.append("openpyxl")
if MISSING:
    print("[X] Thiếu thư viện: " + ", ".join(MISSING))
    print("    Chạy:  pip install -U " + " ".join(MISSING))
    sys.exit(1)

from EN_common import (  # noqa: E402
    ADD_START_ROW, CELL_LANG, CELL_LINK, CELL_MINLEN, CELL_SOURCE,
    CELL_STATUS, CELL_STOPWORDS, CELL_TOPN, NOISE_WORDS, PASTE_START_ROW,
    SHEET_INPUT, SHEET_PASTE, STOPWORDS, UA, XLSX_FILE, build_root_note,
    gtranslate, load_root_cache, log, save_root_cache, to_ipa,
)
from EN_writer import (  # noqa: E402
    append_history, bump_ranges, existing_words, get_vocab_sheet,
    last_data_row, safe_save, write_words,
)


# ─────────────────────────── Tiện ích chuỗi ───────────────────────────────────
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")

# Rút gọn thường gặp trong phụ đề nói → bỏ
CONTRACTIONS = {"'s", "'re", "'ve", "'ll", "'d", "'m", "'t", "n't"}


def clean_lines(raw_lines):
    """Bỏ dòng rác, gộp dòng ngắn, giữ câu có ý nghĩa."""
    out = []
    for ln in raw_lines:
        ln = html.unescape(ln or "").strip()
        ln = re.sub(r"\[[^\]]{0,40}\]", " ", ln)      # [Music], [Applause]
        ln = re.sub(r"\([^)]{0,40}\)", " ", ln)
        ln = re.sub(r"<[^>]+>", " ", ln)
        ln = re.sub(r"https?://\S+", " ", ln)
        ln = re.sub(r"\s+", " ", ln).strip()
        if len(ln) < 3:
            continue
        if not WORD_RE.search(ln):
            continue
        out.append(ln)
    return out


def to_sentences(lines):
    """Ghép phụ đề rời thành câu để lấy câu ví dụ."""
    blob = " ".join(lines)
    blob = re.sub(r"\s+", " ", blob)
    parts = re.split(r"(?<=[.!?])\s+", blob)
    out = []
    for p in parts:
        p = p.strip()
        if 25 <= len(p) <= 190:
            out.append(p[0].upper() + p[1:])
    return out


def normalise(w):
    w = w.lower().strip("-'")
    for c in CONTRACTIONS:
        if w.endswith(c):
            w = w[: -len(c)]
    return w


def base_form(w):
    """Chuẩn hoá thô về dạng gốc để loại trùng số nhiều / chia thì."""
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    for suf in ("sses", "shes", "ches", "xes"):
        if len(w) > len(suf) + 2 and w.endswith(suf):
            return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


# ─────────────────────────── Lấy dữ liệu YouTube ──────────────────────────────
def extract_video_id(url):
    if not url:
        return ""
    url = url.strip()
    if re.fullmatch(r"[\w-]{11}", url):
        return url
    m = re.search(r"(?:v=|/shorts/|youtu\.be/|/embed/|/live/)([\w-]{11})", url)
    return m.group(1) if m else ""


def _http_get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def get_video_title(vid):
    try:
        raw = _http_get("https://www.youtube.com/oembed?url="
                        f"https://www.youtube.com/watch?v={vid}&format=json")
        return json.loads(raw).get("title", "") or f"Video {vid}"
    except Exception:
        return f"Video {vid}"


def _vtt_to_lines(raw):
    out = []
    for ln in raw.splitlines():
        ln = ln.strip()
        if not ln or ln.isdigit() or "-->" in ln:
            continue
        if ln.upper().startswith(("WEBVTT", "KIND:", "LANGUAGE:", "NOTE")):
            continue
        out.append(ln)
    return out


def parse_sub_payload(raw, ext=""):
    raw = raw.strip()
    if not raw:
        return []
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            lines = []
            for ev in data.get("events", []):
                seg = ev.get("segs") or []
                txt = "".join(s.get("utf8", "") for s in seg)
                if txt.strip():
                    lines.append(txt)
            return lines
        except Exception:
            return []
    if raw.startswith("<"):
        return re.findall(r"<text[^>]*>(.*?)</text>", raw, re.S)
    return _vtt_to_lines(raw)


def src_transcript_api(vid, langs):
    """Tầng 1+2 — youtube-transcript-api."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return [], ""
    want = [l for l in (langs or "").split(",") if l] or \
           ["en", "en-US", "en-GB", "en-CA", "en-AU"]
    try:
        api = YouTubeTranscriptApi()
        listing = api.list(vid)
    except Exception:
        try:
            listing = YouTubeTranscriptApi.list_transcripts(vid)
        except Exception:
            return [], ""
    # ưu tiên phụ đề thủ công
    for auto in (False, True):
        for tr in listing:
            if bool(getattr(tr, "is_generated", False)) != auto:
                continue
            code = getattr(tr, "language_code", "")
            if not any(code.lower().startswith(w.lower().split("-")[0])
                       for w in want):
                continue
            try:
                data = tr.fetch()
                lines = [getattr(s, "text", None) or s.get("text", "")
                         for s in data]
                if lines:
                    kind = "CC tự động" if auto else "CC thủ công"
                    return lines, f"{kind} ({code})"
            except Exception:
                continue
    return [], ""


class _QuietLogger:
    def debug(self, m): pass
    def info(self, m): pass
    def warning(self, m): pass
    def error(self, m): pass


def ytdlp_info(vid):
    try:
        import yt_dlp
    except ImportError:
        return None
    opts = {"quiet": True, "no_warnings": True, "skip_download": True,
            "logger": _QuietLogger(), "extract_flat": False}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(
                f"https://www.youtube.com/watch?v={vid}", download=False)
    except Exception:
        return None


def list_tracks(info):
    tracks = []
    if not info:
        return tracks
    for key, auto in (("subtitles", False), ("automatic_captions", True)):
        for code, items in (info.get(key) or {}).items():
            for it in items:
                tracks.append({"code": code, "auto": auto,
                               "ext": it.get("ext", ""), "url": it.get("url")})
    return tracks


def src_ytdlp_tracks(info):
    """Tầng 2b — tải track phụ đề bất kỳ có tiếng Anh."""
    for auto in (False, True):
        for t in list_tracks(info):
            if t["auto"] != auto or not t["url"]:
                continue
            if not t["code"].lower().startswith("en"):
                continue
            try:
                lines = parse_sub_payload(_http_get(t["url"]), t["ext"])
                if lines:
                    kind = "yt-dlp tự động" if auto else "yt-dlp thủ công"
                    return lines, f"{kind} ({t['code']})"
            except Exception:
                continue
    return [], ""


def src_description(info):
    """Tầng 3 — phần mô tả video."""
    if not info:
        return [], ""
    desc = info.get("description") or ""
    lines = [l for l in desc.splitlines() if len(l.strip()) > 15]
    return (lines, "mô tả video") if lines else ([], "")


def src_paste_sheet(wb):
    """Tầng 4 — sheet 📋 DÁN PHỤ ĐỀ."""
    if SHEET_PASTE not in wb.sheetnames:
        return [], ""
    ws = wb[SHEET_PASTE]
    lines = []
    for r in range(PASTE_START_ROW, ws.max_row + 1):
        v = ws.cell(r, 1).value
        if v and str(v).strip():
            lines.append(str(v))
    return (lines, "sheet DÁN PHỤ ĐỀ") if lines else ([], "")


def gather_english(vid, wb, lang_pref="", mode="auto"):
    """Thử lần lượt các nguồn cho tới khi có lời thoại."""
    info = None

    def need_info():
        nonlocal info
        if info is None:
            log("  · Đang lấy thông tin video (yt-dlp)…")
            info = ytdlp_info(vid) or {}
        return info

    if mode == "dan":
        return src_paste_sheet(wb)
    if mode == "mota":
        return src_description(need_info())

    if vid:
        log("  1️⃣  Thử phụ đề tiếng Anh (youtube-transcript-api)…")
        lines, src = src_transcript_api(vid, lang_pref)
        if lines:
            return clean_lines(lines), src

        log("  2️⃣  Thử tải track phụ đề qua yt-dlp…")
        lines, src = src_ytdlp_tracks(need_info())
        if lines:
            return clean_lines(lines), src

        log("  3️⃣  Thử phần mô tả video…")
        lines, src = src_description(need_info())
        if lines:
            return clean_lines(lines), src

    log("  4️⃣  Thử sheet 📋 DÁN PHỤ ĐỀ…")
    lines, src = src_paste_sheet(wb)
    return clean_lines(lines), src


def diagnose(vid, wb):
    log("=" * 62)
    log(f"  CHẨN ĐOÁN VIDEO: {vid}")
    log("=" * 62)
    log(f"  Tiêu đề: {get_video_title(vid)}")
    info = ytdlp_info(vid)
    if not info:
        log("  [!] yt-dlp không lấy được thông tin (video riêng tư / chặn?).")
    else:
        tracks = list_tracks(info)
        man = sorted({t["code"] for t in tracks if not t["auto"]})
        auto = sorted({t["code"] for t in tracks if t["auto"]})
        log(f"  Phụ đề thủ công : {', '.join(man) or '(không có)'}")
        log(f"  Phụ đề tự động  : {', '.join(auto[:12]) or '(không có)'}"
            + (" …" if len(auto) > 12 else ""))
        d = (info.get("description") or "").strip()
        log(f"  Mô tả video     : {len(d)} ký tự")
    lines, src = src_paste_sheet(wb)
    log(f"  Sheet DÁN PHỤ ĐỀ: {len(lines)} dòng")
    log("=" * 62)


# ─────────────────────────── Tách & lọc từ ────────────────────────────────────
def segment(lines, min_len, skip_stop, topn):
    """Đếm tần suất, lọc tên riêng, trả list [(từ hiển thị, số lần)]."""
    counter = Counter()
    display = {}
    caps = Counter()       # số lần viết hoa GIỮA câu ➜ nghi là tên riêng
    for ln in lines:
        toks = WORD_RE.findall(ln)
        for idx, raw in enumerate(toks):
            w = normalise(raw)
            if len(w) < min_len:
                continue
            if not w.replace("-", "").isalpha():
                continue
            if skip_stop and w in STOPWORDS:
                continue
            if w in NOISE_WORDS:
                continue
            b = base_form(w)
            counter[b] += 1
            if idx > 0 and raw[0].isupper():
                caps[b] += 1
            if b not in display or len(display[b]) > len(w):
                display[b] = w

    # bỏ tên riêng: viết hoa giữa câu ở >= 60% số lần xuất hiện
    for b, n in list(counter.items()):
        if caps[b] and caps[b] / n >= 0.6:
            del counter[b]

    items = counter.most_common()
    if topn > 0:
        items = items[:topn * 4]        # lấy dư, sẽ lọc trùng sau
    return [(display[b], n) for b, n in items]


def pick_example(word, sentences):
    """Chọn câu trong video có chứa từ đó, ngắn gọn nhất."""
    pat = re.compile(r"\b" + re.escape(word[:max(4, len(word) - 2)]),
                     re.IGNORECASE)
    best = ""
    for s in sentences:
        if pat.search(s):
            if not best or len(s) < len(best):
                best = s
    return best


# ────────────────────────────────── MAIN ──────────────────────────────────────
def read_config(ws):
    def g(cell, default):
        v = ws[cell].value
        return default if v in (None, "") else v
    link = str(g(CELL_LINK, "")).strip()
    try:
        topn = int(float(g(CELL_TOPN, 40)))
    except Exception:
        topn = 40
    try:
        minlen = max(2, int(float(g(CELL_MINLEN, 4))))
    except Exception:
        minlen = 4
    stop = str(g(CELL_STOPWORDS, "Có")).strip().lower() not in (
        "không", "khong", "no", "0", "false", "n")
    lang = str(g(CELL_LANG, "auto")).strip()
    lang = "" if lang.lower() in ("auto", "") else lang
    mode = str(g(CELL_SOURCE, "auto")).strip().lower()
    if mode not in ("auto", "mota", "dan"):
        mode = "auto"
    return link, topn, minlen, stop, lang, mode


def main():
    ap = argparse.ArgumentParser(description="YouTube ➜ từ vựng tiếng Anh ➜ Excel")
    ap.add_argument("link", nargs="?", help="Link YouTube (bỏ trống = đọc ô B2)")
    ap.add_argument("--check", metavar="URL", help="Chẩn đoán video")
    ap.add_argument("--text", metavar="FILE", help="Nạp lời thoại từ file .txt")
    ap.add_argument("--title", default="", help="Tên nguồn khi dùng --text")
    ap.add_argument("--no-translate", action="store_true",
                    help="Bỏ qua bước dịch (chạy nhanh, cột nghĩa để trống)")
    args = ap.parse_args()

    log("=" * 62)
    log("  EN_video — YouTube ➜ từ vựng tiếng Anh ➜ Excel")
    log("=" * 62)

    if not XLSX_FILE.exists():
        log(f"  [X] Không tìm thấy {XLSX_FILE.name}. Chạy EN_build.py trước.")
        return 1

    wb = openpyxl.load_workbook(XLSX_FILE)
    if SHEET_INPUT not in wb.sheetnames:
        log(f"  [X] File thiếu sheet '{SHEET_INPUT}'.")
        return 1
    wsi = wb[SHEET_INPUT]
    cfg_link, topn, minlen, skip_stop, lang, mode = read_config(wsi)

    if args.check:
        diagnose(extract_video_id(args.check), wb)
        return 0

    # ── Lấy lời thoại ──
    if args.text:
        p = Path(args.text)
        if not p.exists():
            log(f"  [X] Không thấy file {p}")
            return 1
        lines = clean_lines(p.read_text(encoding="utf-8",
                                        errors="replace").splitlines())
        source = f"file {p.name}"
        title = args.title or p.stem
        url = ""
        vid = ""
    else:
        url = (args.link or cfg_link).strip()
        vid = extract_video_id(url)
        if not vid and mode == "auto" and not url:
            log("  [!] Ô B2 chưa có link. Sẽ thử sheet 📋 DÁN PHỤ ĐỀ.")
        title = get_video_title(vid) if vid else "Nguồn tự dán"
        log(f"  🎬 {title}")
        lines, source = gather_english(vid, wb, lang, mode)

    if not lines:
        log("")
        log("  [X] Không lấy được lời thoại từ nguồn nào.")
        log("      ➜ Cách chắc chắn nhất: mở sheet 📋 DÁN PHỤ ĐỀ, dán lời")
        log("        thoại (hoặc bất kỳ bài viết tiếng Anh nào) từ dòng 4,")
        log("        lưu file rồi chạy lại.")
        wsi[CELL_STATUS] = "❌ Không lấy được lời thoại"
        safe_save(wb, XLSX_FILE, quiet=True)
        return 1

    log(f"  ✔ Nguồn: {source}  ·  {len(lines)} dòng")
    sentences = to_sentences(lines)

    # ── Tách từ & loại trùng ──
    ws = get_vocab_sheet(wb)
    old_last = last_data_row(ws)
    have = existing_words(ws, old_last)
    have_base = {base_form(w) for w in have}

    cands = segment(lines, minlen, skip_stop, topn)
    new, dup = [], 0
    for w, freq in cands:
        if w in have or base_form(w) in have_base:
            dup += 1
            continue
        new.append((w, freq))
        if topn > 0 and len(new) >= topn:
            break

    log(f"  ✔ Tìm thấy {len(cands)} từ ứng viên  ·  "
        f"{dup} từ đã có  ·  {len(new)} từ MỚI")
    if not new:
        log("  ✅ Không có từ mới — bạn đã thuộc hết từ trong video này!")
        wsi[CELL_STATUS] = f"✅ 0 từ mới (đã có {dup}) · {source}"
        safe_save(wb, XLSX_FILE)
        return 0

    # ── Dựng dữ liệu cho từng từ ──
    log("  ⏳ Đang tra IPA + chọn câu ví dụ…")
    cache = load_root_cache()
    words = []
    for w, freq in new:
        ex = pick_example(w, sentences)
        words.append({
            "word": w, "ipa": to_ipa(w), "viet": "", "freq": freq,
            "root": build_root_note(w, cache=cache), "ex": ex, "ex_vi": "",
        })
    save_root_cache(cache)

    if not args.no_translate:
        log(f"  ⏳ Đang dịch {len(words)} từ + câu ví dụ (Google)…")
        metas = gtranslate([w["word"] for w in words])
        exs = gtranslate([w["ex"] for w in words])
        for i, w in enumerate(words):
            w["viet"] = metas[i] if i < len(metas) else ""
            w["ex_vi"] = exs[i] if i < len(exs) else ""
        ok = sum(1 for w in words if w["viet"])
        log(f"  ✔ Dịch xong {ok}/{len(words)} từ")

    # ── Ghi xuống Excel ──
    start, end = write_words(ws, words, old_last, level="VIDEO",
                             topic_title=title, topic_url=url, source=source)
    bump_ranges(ws, old_last, end)
    append_history(wsi, title, url, len(words), dup)
    wsi[CELL_STATUS] = f"✅ +{len(words)} từ mới (bỏ {dup} trùng) · {source}"

    if not safe_save(wb, XLSX_FILE):
        return 1

    log("")
    log(f"  ✅ ĐÃ THÊM {len(words)} TỪ MỚI  →  dòng {start}–{end}")
    log(f"     File: {XLSX_FILE.name}")
    log("")
    log("  10 từ đầu tiên:")
    for w in words[:10]:
        log(f"    · {w['word']:<18} {w['ipa']:<22} {w['viet']}")
    log("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
