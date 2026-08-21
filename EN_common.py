#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EN_common.py — Thư viện dùng chung cho EN_build.py và EN_video.py
==================================================================
Chứa: chuyển ARPAbet -> IPA, tra IPA, dịch Google, link audio/Youglish,
phân tích gốc từ (prefix / root / suffix) và cấu hình cột Excel.

Version 1.0 · 2026-08-03
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
XLSX_FILE = SCRIPT_DIR / "EN_Business_Vocab_2000.xlsx"
ROOT_CACHE = SCRIPT_DIR / "EN_root_cache.json"

SHEET_VOCAB = "📚 Từ Vựng ENG"
SHEET_INPUT = "⚙️ NHẬP VIDEO"
SHEET_PASTE = "📋 DÁN PHỤ ĐỀ"
SHEET_ADD = "➕ THÊM TỪ MỚI"

HEADER_ROW = 3
FIRST_DATA_ROW = 4
N_COLS = 23  # A..W

C_STT, C_LEVEL, C_WORD, C_IPA, C_VIET = 1, 2, 3, 4, 5
C_TRY1, C_TRY2, C_CHECK, C_AUDIO, C_YOUG = 6, 7, 8, 9, 10
C_DAY1 = 11                      # K..Q = DAY 1..DAY 7
C_DATE, C_NOTE, C_ROOT = 18, 19, 20
C_TOPIC, C_EX, C_EXVI = 21, 22, 23

ROW_HEIGHT = 69.75

CELL_LINK = "B2"
CELL_TOPN = "B3"
CELL_MINLEN = "B4"
CELL_STOPWORDS = "B5"
CELL_LANG = "B6"
CELL_STATUS = "B7"
CELL_SOURCE = "B8"
HISTORY_START_ROW = 11
PASTE_START_ROW = 4
ADD_START_ROW = 4

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

# ─────────────────────────── ARPAbet ➜ IPA ────────────────────────────────────
ARPA_IPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "EH": "ɛ", "ER": "ɜr",
    "EY": "eɪ", "F": "f", "G": "ɡ", "HH": "h", "IH": "ɪ", "IY": "i",
    "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ",
    "OW": "oʊ", "OY": "ɔɪ", "P": "p", "R": "r", "S": "s", "SH": "ʃ",
    "T": "t", "TH": "θ", "UH": "ʊ", "UW": "u", "V": "v", "W": "w",
    "Y": "j", "Z": "z", "ZH": "ʒ",
}
VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY",
          "IH", "IY", "OW", "OY", "UH", "UW"}

# Chính tả Anh-Anh ➜ Anh-Mỹ (CMU chỉ có dạng Anh-Mỹ)
BRITISH_TO_US = [
    ("isation", "ization"), ("isations", "izations"),
    ("ise", "ize"), ("ised", "ized"), ("ising", "izing"), ("iser", "izer"),
    ("yse", "yze"), ("ysed", "yzed"),
    ("our", "or"), ("ours", "ors"),
    ("lment", "llment"), ("lled", "led"), ("lling", "ling"),
    ("ogue", "og"), ("aemia", "emia"), ("oeuvre", "euver"),
]

# IPA thủ công cho từ chuyên ngành & viết tắt không có trong CMU dictionary
MANUAL_IPA = {
    # thuật ngữ thương mại / logistics / tài chính
    "apostille": "ˌæpəˈstil", "arbitral": "ˈɑrbɪtrəl", "autocorrect": "ˌɔtoʊkəˈrɛkt",
    "backhaul": "ˈbækˌhɔl", "bullwhip": "ˈbʊlˌwɪp", "carnet": "kɑrˈneɪ",
    "centric": "ˈsɛntrɪk", "countersign": "ˈkaʊntɜrˌsaɪn",
    "courteously": "ˈkɜrtiəsli", "deconsolidation": "ˌdikənˌsɑlɪˈdeɪʃən",
    "desiccant": "ˈdɛsɪkənt", "despatch": "dɪˈspætʃ", "discrepant": "dɪˈskrɛpənt",
    "dropshipping": "ˈdrɑpˌʃɪpɪŋ", "dunnage": "ˈdʌnɪdʒ", "dutiable": "ˈdutiəbəl",
    "fishbone": "ˈfɪʃˌboʊn", "forfaiting": "ˈfɔrfeɪtɪŋ", "insurable": "ɪnˈʃʊrəbəl",
    "introducer": "ˌɪntrəˈdusɜr", "iterate": "ˈɪtəˌreɪt", "laytime": "ˈleɪˌtaɪm",
    "liaise": "liˈeɪz", "lookbook": "ˈlʊkˌbʊk", "lowball": "ˈloʊˌbɔl",
    "metadata": "ˈmɛtəˌdeɪtə", "monochronic": "ˌmɑnoʊˈkrɑnɪk",
    "multimodal": "ˌmʌltiˈmoʊdəl", "nostro": "ˈnɑstroʊ", "novation": "noʊˈveɪʃən",
    "overtrading": "ˌoʊvɜrˈtreɪdɪŋ", "polychronic": "ˌpɑliˈkrɑnɪk",
    "positional": "pəˈzɪʃənəl", "ransomware": "ˈrænsəmˌwɛr",
    "reframe": "riˈfreɪm", "remitter": "rɪˈmɪtɜr", "salutation": "ˌsæljʊˈteɪʃən",
    "severability": "ˌsɛvərəˈbɪlɪti", "shortlist": "ˈʃɔrtˌlɪst",
    "stockout": "ˈstɑkˌaʊt", "stowage": "ˈstoʊɪdʒ",
    "subrogation": "ˌsʌbrəˈɡeɪʃən", "takt": "tɑkt", "tare": "tɛr",
    "timesheet": "ˈtaɪmˌʃit", "touchpoint": "ˈtʌtʃˌpɔɪnt", "upskill": "ˈʌpˌskɪl",
    "usance": "ˈjuzəns", "valorem": "vəˈlɔrəm", "verbose": "vɜrˈboʊs",
    "webhook": "ˈwɛbˌhʊk", "poka": "ˈpoʊkə", "yoke": "joʊk",
    # từ mượn tiếng Nhật / Trung
    "kaizen": "ˈkaɪzɛn", "kanban": "ˈkɑnbɑn", "gemba": "ˈɡɛmbə",
    "guanxi": "ˌɡwɑnˈʃi",
    # viết tắt
    "bcc": "ˌbi si ˈsi", "cisg": "ˌsi aɪ ɛs ˈdʒi", "ebitda": "ɪˈbɪtdɑ",
    "eori": "ˌi oʊ ɑr ˈaɪ", "iban": "ˈaɪbæn", "iot": "ˌaɪ oʊ ˈti",
    "nvocc": "ˌɛn vi oʊ si ˈsi", "qr": "ˌkju ˈɑr", "rfid": "ˌɑr ɛf aɪ ˈdi",
    "swot": "swɑt", "ucp": "ˌju si ˈpi",
    "organisational": "ˌɔrɡənɪˈzeɪʃənəl", "prioritisation": "praɪˌɔrɪtaɪˈzeɪʃən",
    "notarise": "ˈnoʊtəˌraɪz",
    "backorder": "ˈbækˌɔrdɜr", "barcode": "ˈbɑrˌkoʊd", "consignee": "ˌkɑnsaɪˈni",
    "consignor": "kənˈsaɪnɜr", "demurrage": "dɪˈmɜrɪdʒ", "groupage": "ˈɡrupɪdʒ",
    "incoterms": "ˈɪnkoʊˌtɜrmz", "phytosanitary": "ˌfaɪtoʊˈsænɪtɛri",
    "proforma": "proʊˈfɔrmə", "telegraphic": "ˌtɛlɪˈɡræfɪk",
    "transhipment": "trænˈʃɪpmənt", "upsell": "ˈʌpˌsɛl",
    "utilisation": "ˌjutɪlaɪˈzeɪʃən", "volumetric": "ˌvɑljʊˈmɛtrɪk",
    "finalise": "ˈfaɪnəˌlaɪz", "prioritise": "praɪˈɔrɪˌtaɪz",
    # viết tắt — đọc từng chữ cái
    "cbm": "ˌsi bi ˈɛm", "cfr": "ˌsi ɛf ˈɑr", "cif": "ˌsi aɪ ˈɛf",
    "dap": "ˌdi eɪ ˈpi", "ddp": "ˌdi di ˈpi", "eta": "ˌi ti ˈeɪ",
    "etd": "ˌi ti ˈdi", "exw": "ˌi ɛks ˈdʌbəlju", "fca": "ˌɛf si ˈeɪ",
    "fcl": "ˌɛf si ˈɛl", "fifo": "ˈfaɪfoʊ", "kpi": "ˌkeɪ pi ˈaɪ",
    "lcl": "ˌɛl si ˈɛl", "moq": "ˌɛm oʊ ˈkju", "msds": "ˌɛm ɛs di ˈɛs",
    "nda": "ˌɛn di ˈeɪ", "oem": "ˌoʊ i ˈɛm", "thc": "ˌti eɪtʃ ˈsi",
    "hs": "ˌeɪtʃ ˈɛs", "vat": "ˌvi eɪ ˈti", "sop": "ˌɛs oʊ ˈpi",
    "fob": "ˌɛf oʊ ˈbi", "po": "ˌpi ˈoʊ", "qc": "ˌkju ˈsi",
}

_CMU = None


def _load_cmu():
    """Nạp từ điển phát âm CMU (nếu đã cài)."""
    global _CMU
    if _CMU is not None:
        return _CMU
    try:
        import cmudict
        _CMU = cmudict.dict()
    except Exception:
        try:
            import nltk
            from nltk.corpus import cmudict as nc
            _CMU = nc.dict()
        except Exception:
            _CMU = {}
    return _CMU


# Cụm phụ âm hợp lệ ở ĐẦU âm tiết tiếng Anh (dùng cho maximal onset principle)
LEGAL_ONSETS = {
    ("P", "R"), ("P", "L"), ("B", "R"), ("B", "L"), ("T", "R"), ("D", "R"),
    ("K", "R"), ("K", "L"), ("K", "W"), ("G", "R"), ("G", "L"), ("F", "R"),
    ("F", "L"), ("TH", "R"), ("SH", "R"), ("S", "P"), ("S", "T"), ("S", "K"),
    ("S", "M"), ("S", "N"), ("S", "L"), ("S", "W"), ("T", "W"), ("D", "W"),
    ("HH", "Y"), ("P", "Y"), ("B", "Y"), ("K", "Y"), ("F", "Y"), ("M", "Y"),
    ("V", "Y"), ("S", "P", "R"), ("S", "T", "R"), ("S", "K", "R"),
    ("S", "P", "L"), ("S", "K", "W"), ("S", "K", "L"),
}


def _syllabify(bases):
    """Trả về danh sách chỉ số bắt đầu của từng âm tiết (maximal onset)."""
    vpos = [i for i, b in enumerate(bases) if b in VOWELS]
    if not vpos:
        return [0]
    starts = [0]
    for k in range(1, len(vpos)):
        prev_v, cur_v = vpos[k - 1], vpos[k]
        cluster = bases[prev_v + 1: cur_v]          # phụ âm giữa 2 nguyên âm
        n = len(cluster)
        if n == 0:
            onset = 0
        elif n == 1:
            onset = 0 if cluster[0] == "NG" else 1
        else:
            onset = 0
            for size in (3, 2, 1):
                if size <= n and tuple(cluster[-size:]) in LEGAL_ONSETS:
                    onset = size
                    break
            if onset == 0 and cluster[-1] != "NG":
                onset = 1
        starts.append(cur_v - onset)
    return starts


def _arpa_to_ipa(phones):
    """['EH1','K','S'] ➜ 'ˈɛks'  (ˈ = trọng âm chính, ˌ = trọng âm phụ)."""
    bases, stress = [], []
    for p in phones:
        if p and p[-1].isdigit():
            b, d = p[:-1], p[-1]
            bases.append(b)
            stress.append("ˈ" if d == "1" else ("ˌ" if d == "2" else ""))
        else:
            bases.append(p)
            stress.append("")

    starts = _syllabify(bases)
    # trọng âm của âm tiết = trọng âm của nguyên âm nằm trong âm tiết đó
    mark = {}
    bounds = starts + [len(bases)]
    for si in range(len(starts)):
        for i in range(bounds[si], bounds[si + 1]):
            if stress[i]:
                mark[starts[si]] = stress[si] if False else stress[i]
                break

    out = []
    for i, b in enumerate(bases):
        if i in mark:
            out.append(mark[i])
        out.append(ARPA_IPA.get(b, b.lower()))
    return "".join(out)


def to_ipa(word):
    """Trả IPA cho 1 từ hoặc 1 cụm từ. Không tra được ➜ chuỗi rỗng."""
    cmu = _load_cmu()
    parts = re.findall(r"[A-Za-z']+", word.lower())
    if not parts:
        return ""
    out, unknown = [], 0
    for p in parts:
        if p in MANUAL_IPA:
            out.append(MANUAL_IPA[p])
            continue
        ph = cmu.get(p) if cmu else None
        if not ph and cmu:
            # thử chuyển chính tả Anh-Anh sang Anh-Mỹ
            for br, us in BRITISH_TO_US:
                if p.endswith(br):
                    cand = p[: -len(br)] + us
                    if cmu.get(cand):
                        ph = cmu[cand]
                        break
                if "our" in p:
                    cand = p.replace("our", "or")
                    if cmu.get(cand):
                        ph = cmu[cand]
                        break
        if not ph and cmu:
            # thử bỏ đuôi thường gặp
            for suf in ("s", "es", "ed", "ing", "'s"):
                if p.endswith(suf) and cmu.get(p[: -len(suf)]):
                    ph = cmu[p[: -len(suf)]]
                    break
        if ph:
            out.append(_arpa_to_ipa(ph[0]))
        else:
            out.append(p)          # không tra được ➜ để nguyên chữ viết
            unknown += 1
    if unknown == len(parts):
        return ""
    return "/" + " ".join(out) + "/"


# ─────────────────────────── Link audio & Youglish ────────────────────────────
def audio_url(word):
    q = urllib.parse.quote(word)
    return (f"https://translate.google.com/translate_tts?ie=UTF-8&tl=en"
            f"&client=tw-ob&q={q}")


def youglish_url(word):
    return f"https://youglish.com/pronounce/{urllib.parse.quote(word)}/english"


def dict_url(word):
    return f"https://dictionary.cambridge.org/dictionary/english/{urllib.parse.quote(word)}"


# ─────────────────────────── Dịch qua Google ──────────────────────────────────
def gtranslate(texts, sl="en", tl="vi", pause=0.35):
    """Dịch danh sách câu. Lỗi mạng ➜ trả chuỗi rỗng, không làm chết script."""
    out = []
    fails = 0
    for t in texts:
        if not t:
            out.append("")
            continue
        try:
            url = ("https://translate.googleapis.com/translate_a/single"
                   f"?client=gtx&sl={sl}&tl={tl}&dt=t&q="
                   + urllib.parse.quote(t))
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.loads(r.read().decode("utf-8", "replace"))
            out.append("".join(seg[0] for seg in data[0] if seg and seg[0]))
        except Exception:
            out.append("")
            fails += 1
            if fails == 3:
                print("  [!] Không kết nối được Google Translate — cột nghĩa "
                      "sẽ để trống, bạn tự điền sau.", flush=True)
                # Mạng hỏng thật thì dừng thử, khỏi chờ lâu
                out.extend("" for _ in range(len(texts) - len(out)))
                return out
        time.sleep(pause)
    return out


# ─────────────────────────── Gốc từ & tiền/hậu tố ─────────────────────────────
PREFIXES = {
    "ex": "ex- · ra ngoài, khỏi", "im": "im- · vào trong / không",
    "in": "in- · vào trong / không", "re": "re- · lại, trở lại",
    "de": "de- · xuống, khỏi", "dis": "dis- · tách ra, phủ định",
    "con": "con- · cùng nhau", "com": "com- · cùng nhau",
    "pre": "pre- · trước", "pro": "pro- · tiến về phía trước",
    "sub": "sub- · dưới", "super": "super- · trên, vượt",
    "trans": "trans- · qua, xuyên", "inter": "inter- · giữa",
    "over": "over- · quá, trên", "under": "under- · dưới, thiếu",
    "un": "un- · không, phủ định", "non": "non- · không",
    "mis": "mis- · sai, hỏng", "out": "out- · ra ngoài, hơn",
    "co": "co- · cùng", "fore": "fore- · trước",
    "counter": "counter- · đối lại", "multi": "multi- · nhiều",
    "semi": "semi- · nửa", "auto": "auto- · tự động",
}
SUFFIXES = {
    "tion": "-tion · danh từ (hành động/kết quả)",
    "sion": "-sion · danh từ (hành động/kết quả)",
    "ment": "-ment · danh từ (kết quả hành động)",
    "ance": "-ance · danh từ (trạng thái)",
    "ence": "-ence · danh từ (trạng thái)",
    "ity": "-ity · danh từ (tính chất)",
    "ness": "-ness · danh từ (tính chất)",
    "ship": "-ship · danh từ (trạng thái/quan hệ)",
    "age": "-age · danh từ (phí, hành động)",
    "er": "-er · người/vật THỰC HIỆN",
    "or": "-or · người/vật THỰC HIỆN",
    "ee": "-ee · người NHẬN hành động",
    "ist": "-ist · người làm nghề",
    "able": "-able · có thể ... được",
    "ible": "-ible · có thể ... được",
    "ive": "-ive · tính từ (có tính chất)",
    "ous": "-ous · tính từ (đầy, nhiều)",
    "al": "-al · tính từ (thuộc về)",
    "ful": "-ful · đầy, nhiều",
    "less": "-less · không có",
    "ise": "-ise · động từ (làm cho)",
    "ize": "-ize · động từ (làm cho)",
    "ify": "-ify · động từ (làm cho)",
    "ate": "-ate · động từ (làm)",
    "ing": "-ing · danh động từ / tính từ",
    "ly": "-ly · trạng từ",
}


def load_root_cache():
    if ROOT_CACHE.exists():
        try:
            return json.loads(ROOT_CACHE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_root_cache(cache):
    try:
        ROOT_CACHE.write_text(
            json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception:
        pass


def build_root_note(word, definition_en="", cache=None):
    """Tự sinh cột 'GỐC TỪ & CỤM TỪ' cho từ mới lấy từ video."""
    cache = cache if cache is not None else {}
    key = word.lower()
    if key in cache:
        return cache[key]

    lines = []
    w = key
    found_pre = None
    for p in sorted(PREFIXES, key=len, reverse=True):
        if w.startswith(p) and len(w) > len(p) + 2:
            found_pre = PREFIXES[p]
            break
    found_suf = None
    for s in sorted(SUFFIXES, key=len, reverse=True):
        if w.endswith(s) and len(w) > len(s) + 2:
            found_suf = SUFFIXES[s]
            break
    if found_pre:
        lines.append(f"◆ Tiền tố: {found_pre}")
    if found_suf:
        lines.append(f"◆ Hậu tố: {found_suf}")
    if definition_en:
        lines.append(f"◆ Nghĩa (EN): {definition_en}")
    if not lines:
        lines.append("◆ (từ gốc — không tách được tiền/hậu tố)")
    note = "\n".join(lines)
    cache[key] = note
    return note


# ─────────────────────────── Stopwords tiếng Anh ──────────────────────────────
STOPWORDS = set("""
a an the and or but if then than that this these those there here
i you he she it we they me him her us them my your his its our their
mine yours hers ours theirs myself yourself himself herself itself
ourselves yourselves themselves
is am are was were be been being do does did done doing have has had having
will would can could shall should may might must ought
of in on at to for with by from into onto about as up down out over under
above below across through during before after between among against within
without along around behind beyond near off per via toward towards upon
not no nor yes so very just too also only even still yet again more most
much many less least such same own another both either neither
what when where which who whom whose why how whether while because since
although though unless until once ever never always often sometimes usually
one two three four five six seven eight nine ten eleven twelve twenty thirty
hundred thousand million billion first second third next last final
get got getting go goes going gone went come came coming make made making
take took taken taking give gave given put set let keep kept
see saw seen look looking looked watch watched find found know knew known
think thought say said tell told talk talking talked speak spoke ask asked
want wanted need needed like liked use used using try tried trying
work working worked start started begin began end ended stop stopped
call called turn turned move moved leave left bring brought hold held
run running ran feel felt seem seemed become became happen happened
mean meant show showed shown play played help helped live lived believe
really thing things way ways lot lots okay well good great better best
bad worse worst big small large little long short high low new old young
right left true false sure certain able ready easy hard difficult simple
different similar important main major minor real actual usual normal
time times day days week weeks month months year years today tomorrow
yesterday now then soon later early late morning evening night hour minute
people person man woman men women guy guys kid kids friend family
place places part parts side end back front top bottom middle
number numbers point points fact case reason kind sort type
something anything nothing everything someone anyone everyone nobody
somewhere anywhere everywhere here there
im ive id ill dont doesnt didnt isnt arent wasnt werent cant cannot wont
wouldnt couldnt shouldnt hasnt havent hadnt lets thats whats theres youre
theyre weve youve theyve heres hes shes gonna wanna gotta kinda sorta
yeah yep nope hey oh ah um uh hmm huh wow okay ok alright guys folks
video channel today welcome subscribe comment thanks thank please
""".split())

NOISE_WORDS = {"subscribe", "channel", "video", "like", "comment", "share",
               "playlist", "click", "link", "bell", "notification", "sponsor",
               "watch", "youtube", "captions", "subtitles", "music", "applause"}


def log(msg=""):
    print(msg, flush=True)
