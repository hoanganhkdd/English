#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EN_webbuild.py — Sinh dữ liệu cho WEB APP học tiếng Anh (PWA)
=============================================================
Đọc các file EN_seed_*.txt (2000 từ: word|viet|root|topic|ex|ex_vi),
sinh IPA (CMU), gắn cấp độ theo nhóm file, và xuất:
    webapp/appdata.js   (window.APPDATA = {...})
    webapp/data.json    (bản JSON thuần để tham khảo)

Kèm theo: từ điển IPA offline (~CMU) để tính năng 🎬 Nhập video có thể
gắn phiên âm + âm bồi cho từ MỚI ngay trên trình duyệt, không cần mạng.

Chạy:  python EN_webbuild.py
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from EN_common import (  # noqa: E402
    PREFIXES, SUFFIXES, STOPWORDS, NOISE_WORDS, SCRIPT_DIR,
    to_ipa, _arpa_to_ipa, log,
)

WEBDIR = SCRIPT_DIR / "webapp"
WEBDIR.mkdir(exist_ok=True)

# ── Cấp độ theo nhóm file seed ────────────────────────────────────────────────
def level_for(idx):
    if idx <= 8:
        return "Cơ bản"
    if idx <= 16:
        return "Trung cấp"
    return "Nâng cao"


def read_seed_leveled():
    files = sorted(
        (f for f in SCRIPT_DIR.glob("EN_seed_*.txt") if f.name != "EN_seed_all.txt"),
        key=lambda f: int(re.search(r"(\d+)", f.stem).group(1)),
    )
    rows, seen = [], set()
    for f in files:
        idx = int(re.search(r"(\d+)", f.stem).group(1))
        lvl = level_for(idx)
        for ln in f.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if not ln or ln.startswith("#"):
                continue
            p = ln.split("|")
            if len(p) != 6:
                continue
            key = p[0].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "word": p[0].strip(), "viet": p[1].strip(), "root": p[2].strip(),
                "topic": p[3].strip(), "ex": p[4].strip(), "ex_vi": p[5].strip(),
                "level": lvl,
            })
    return rows


# ── Từ điển IPA offline từ CMU ────────────────────────────────────────────────
def build_ipa_dict(extra_words):
    """word(lower) -> ipa (không kèm dấu /). Dùng cho video + âm bồi offline."""
    import cmudict
    cmu = cmudict.dict()
    out = {}
    log("  ⏳ Sinh từ điển IPA offline từ CMU…")
    for w, prons in cmu.items():
        if not w.isalpha():
            continue
        if not (2 <= len(w) <= 16):
            continue
        try:
            ipa = _arpa_to_ipa(prons[0])
        except Exception:
            continue
        if ipa:
            out[w] = ipa
    # đảm bảo mọi từ trong bộ vocab đều có IPA
    for w in extra_words:
        lw = w.lower()
        if lw not in out:
            ip = to_ipa(w)
            if ip:
                out[lw] = ip.strip("/").strip()
    log(f"  ✔ Từ điển IPA: {len(out)} mục")
    return out


def main():
    log("=" * 62)
    log("  EN_webbuild — sinh dữ liệu cho web app học tiếng Anh")
    log("=" * 62)

    data = read_seed_leveled()
    log(f"  ✔ Đọc {len(data)} từ")
    if not data:
        log("  [X] Không có dữ liệu seed.")
        return 1

    log("  ⏳ Tra IPA cho bộ từ vựng…")
    vocab = []
    for i, d in enumerate(data, 1):
        ip = to_ipa(d["word"]) or ""
        vocab.append({
            "stt": i,
            "level": d["level"],
            "word": d["word"],
            "ipa": ip,
            "vi": d["viet"],
            "root": d["root"],
            "topic": d["topic"],
            "example": d["ex"],
            "exampleVi": d["ex_vi"],
            "dateAdded": "",
        })

    ipa_dict = build_ipa_dict([v["word"] for v in vocab])

    # gloss: từ (lower) -> {ipa, vi} cho các từ có nghĩa (bộ vocab) → video tra nhanh
    gloss = {}
    for v in vocab:
        lw = v["word"].lower()
        if lw not in gloss:
            gloss[lw] = {"i": v["ipa"].strip("/").strip(), "v": v["vi"]}

    # thống kê theo cấp độ & chủ đề
    by_level, by_topic = {}, {}
    for v in vocab:
        by_level[v["level"]] = by_level.get(v["level"], 0) + 1
        by_topic[v["topic"]] = by_topic.get(v["topic"], 0) + 1
    stats = [
        {"stt": i + 1, "source": t, "count": c,
         "note": "chủ đề"}
        for i, (t, c) in enumerate(sorted(by_topic.items(), key=lambda x: -x[1]))
    ]

    APP = {
        "meta": {
            "built": f"{datetime.now():%Y-%m-%d %H:%M}",
            "count": len(vocab),
            "levels": by_level,
        },
        "vocab": vocab,
        "ipaDict": ipa_dict,
        "gloss": gloss,
        "prefixes": PREFIXES,
        "suffixes": SUFFIXES,
        "stopwords": sorted(STOPWORDS | NOISE_WORDS),
        "stats": stats,
    }

    # data.json (tham khảo)
    (WEBDIR / "data.json").write_text(
        json.dumps(APP, ensure_ascii=False), encoding="utf-8")
    # appdata.js (nhúng vào app)
    (WEBDIR / "appdata.js").write_text(
        "window.APPDATA=" + json.dumps(APP, ensure_ascii=False) + ";",
        encoding="utf-8")

    sz = (WEBDIR / "appdata.js").stat().st_size / 1024 / 1024
    log(f"  ✔ Đã xuất webapp/appdata.js  ({sz:.1f} MB)")
    log(f"    • {len(vocab)} từ · {len(by_topic)} chủ đề · {len(ipa_dict)} IPA")
    log("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
