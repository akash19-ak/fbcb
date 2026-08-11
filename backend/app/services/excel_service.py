"""
Dynamic Feedback File Processing Service.

Detects every question type in the uploaded file:
  - likert   : Strongly Agree / Agree / Neutral… style columns
  - rating   : numeric 1-5, 1-10, percentage columns
  - choice   : multiple-choice / yes-no / categorical (low cardinality text)
  - text     : free-text / open-ended comments (run through RoBERTa)
  - meta     : participant metadata (email, date, ip…) — skipped

Each question gets its own analysis result returned to the frontend.
"""

import csv
import io
import re
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from fpdf import FPDF
import logging

logger = logging.getLogger(__name__)

# ─────────────────────────── constants ───────────────────────────────────────

METADATA_KEYWORDS = {
    "id", "no", "num", "number", "code", "date", "time", "type",
    "status", "user", "student", "email", "phone", "seq", "serial",
    "index", "participant", "respondent", "timestamp",
    "collected", "source", "meeting", "webinar",
    "submitted", "start", "end", "ip", "username", "uid", "row",
}

LIKERT_SCALE_VARIANTS = {
    frozenset({"strongly agree", "agree", "neutral", "disagree", "strongly disagree"}),
    frozenset({"strongly agree", "agree", "neither agree nor disagree", "disagree", "strongly disagree"}),
    frozenset({"strongly agree", "agree", "disagree", "strongly disagree"}),
    frozenset({"very satisfied", "satisfied", "neutral", "dissatisfied", "very dissatisfied"}),
    frozenset({"very satisfied", "satisfied", "dissatisfied", "very dissatisfied"}),
    frozenset({"always", "often", "sometimes", "rarely", "never"}),
    frozenset({"very important", "important", "neutral", "unimportant", "very unimportant"}),
    frozenset({"excellent", "good", "average", "poor", "very poor"}),
    frozenset({"excellent", "very good", "good", "fair", "poor"}),
    frozenset({"yes", "no"}),
    frozenset({"yes", "no", "maybe"}),
    frozenset({"true", "false"}),
}

LIKERT_KEYWORDS = {
    "agree", "disagree", "strongly", "neutral", "satisfied", "dissatisfied",
    "excellent", "poor", "good", "fair", "always", "never", "often",
    "rarely", "sometimes", "important", "unimportant", "frequently",
}

FREE_TEXT_KEYWORDS = [
    "feedback", "comment", "review", "remark", "response", "opinion",
    "suggestion", "description", "message", "details", "text", "answer",
    "other", "please specify", "additional", "notes",
]

NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")

# ──────────────────────────── column-type detection ──────────────────────────

def _normalize_col(name: str) -> str:
    return str(name).lower().replace("_", " ").replace("-", " ").strip()


def _is_metadata_col(col: str) -> bool:
    col_str = _normalize_col(str(col))
    words = set(re.split(r"[\s_\-#]+", col_str))
    return bool(words & METADATA_KEYWORDS)


def _col_values(df: pd.DataFrame, col: str) -> pd.Series:
    val = df[col]
    if isinstance(val, pd.DataFrame):
        val = val.iloc[:, 0]
    return val.dropna().astype(str).str.strip().replace("", pd.NA).dropna()


def _detect_likert(series: pd.Series) -> Optional[Dict]:
    try:
        vals = series.str.lower().str.strip()
        unique_vals = set(vals.unique())
        if len(unique_vals) == 0:
            return None

        # Exact or subset match against known scale variants
        for scale in LIKERT_SCALE_VARIANTS:
            if unique_vals == scale or unique_vals.issubset(scale):
                if len(vals) > 0:
                    return {"scale": sorted([str(s) for s in scale]), "unique": sorted([str(u) for u in unique_vals])}

        # Keyword heuristic
        if len(unique_vals) <= 12:
            kw_matches = sum(
                1 for v in unique_vals
                if any(kw in str(v).lower() for kw in LIKERT_KEYWORDS)
            )
            if kw_matches / max(len(unique_vals), 1) >= 0.35:
                avg_len = vals.str.len().mean()
                if avg_len < 50:
                    return {"scale": None, "unique": sorted([str(u) for u in unique_vals])}
    except Exception as e:
        logger.debug(f"Likert detection warning: {e}")
    return None


def _detect_rating(series: pd.Series) -> Optional[Dict]:
    try:
        numeric = series[series.str.match(NUMERIC_RE)]
        if len(numeric) / max(len(series), 1) < 0.7:
            return None
        nums = pd.to_numeric(numeric, errors="coerce").dropna()
        if nums.empty:
            return None
        mn, mx = float(nums.min()), float(nums.max())
        if (mn >= 0 and mx <= 10 and mx - mn >= 1) or (mn >= 0 and mx <= 100 and mx - mn >= 5):
            return {"min": float(mn), "max": float(mx), "mean": round(float(nums.mean()), 2), "count": int(len(nums))}
    except Exception as e:
        logger.debug(f"Rating detection warning: {e}")
    return None


def _detect_choice(series: pd.Series) -> Optional[Dict]:
    try:
        unique_vals = series.unique()
        n_unique = len(unique_vals)
        n_total = len(series)
        if n_total == 0:
            return None
        avg_len = series.str.len().mean()
        if 2 <= n_unique <= 20 and (n_unique / n_total) < 0.5 and avg_len < 80:
            return {"unique": sorted([str(v) for v in unique_vals.tolist()]), "cardinality": n_unique}
    except Exception as e:
        logger.debug(f"Choice detection warning: {e}")
    return None


def _is_free_text(series: pd.Series) -> bool:
    try:
        cleaned = series.dropna().astype(str).str.strip()
        cleaned = cleaned[cleaned != ""]
        if len(cleaned) == 0:
            return False
        words = cleaned.str.split().str.len()
        avg_words = words.mean()
        numeric_ratio = cleaned.str.match(NUMERIC_RE).mean()
        if numeric_ratio > 0.4:
            return False
        if avg_words >= 2.2:
            return True
        if (words >= 3).mean() >= 0.12:
            return True
        if cleaned.str.len().mean() >= 18 and (words >= 2).mean() >= 0.2:
            return True
    except Exception as e:
        logger.debug(f"Text detection warning: {e}")
    return False


def classify_column(df: pd.DataFrame, col: str) -> Dict[str, Any]:
    col_norm = _normalize_col(str(col))
    series = _col_values(df, col)

    if series.empty:
        return {"type": "empty"}

    # Check Likert first so metadata-like column names containing questions aren't skipped
    likert = _detect_likert(series)
    if likert:
        return {"type": "likert", **likert}

    # Metadata check
    if _is_metadata_col(col):
        return {"type": "meta"}

    # Numeric rating scale
    rating = _detect_rating(series)
    if rating:
        return {"type": "rating", **rating}

    # Free-text
    is_text_name = any(kw in col_norm for kw in FREE_TEXT_KEYWORDS)
    if is_text_name and _is_free_text(series):
        return {"type": "text"}
    if _is_free_text(series):
        return {"type": "text"}

    # Multiple choice
    choice = _detect_choice(series)
    if choice:
        return {"type": "choice", **choice}

    return {"type": "unknown"}


# ──────────────────────────── file reading helpers ───────────────────────────

CSV_DELIMITERS = [",", "\t", ";", "|"]


def _guess_csv_delimiter(raw_text: str) -> str:
    sample = raw_text[:8192]
    counts = {d: sample.count(d) for d in CSV_DELIMITERS}
    if counts["\t"] > 0:
        return "\t"
    return max(counts, key=counts.get)


def _normalize_line_endings(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _find_header_row(file_bytes: bytes, file_type: str = "excel", max_scan: int = 80) -> int:
    """Scan first max_scan rows to find the header row."""

    def header_score(row: List[Any]) -> int:
        normalized = [
            str(c).lower().strip()
            for c in row
            if pd.notna(c) and str(c).strip() not in ("", "nan", "none")
        ]
        if len(normalized) < 2:
            return -1
        # Real question headers have many non-empty columns (5+)
        score = len(normalized) * 10
        # Header names contain question/column descriptive words (NOT response values like "agree")
        header_kws = ["name", "email", "date", "time", "id", "session", "topic", "feedback", "comment", "rating", "score", "question", "expect", "program", "coordination", "organized", "how", "what", "overall", "rate"]
        kw_count = sum(1 for cell in normalized if any(kw in cell for kw in header_kws))
        score += kw_count * 20
        return score

    try:
        if file_type == "csv":
            raw_text = file_bytes.decode("utf-8", errors="replace")
            raw_text = _normalize_line_endings(raw_text)
            delimiter = _guess_csv_delimiter(raw_text)
            reader = csv.reader(io.StringIO(raw_text), delimiter=delimiter, quotechar='"', skipinitialspace=True)
            best_idx, best_score = 0, -1
            for i, row in enumerate(reader):
                if i >= max_scan:
                    break
                score = header_score(row)
                if score > best_score:
                    best_score, best_idx = score, i
            return best_idx if best_score >= 0 else 0
        else:
            raw = pd.read_excel(
                io.BytesIO(file_bytes), engine="openpyxl",
                header=None, nrows=max_scan, dtype=str
            )
            best_idx, best_score = 0, -1
            for row_idx, row in raw.iterrows():
                score = header_score(row.tolist())
                if score > best_score:
                    best_score, best_idx = score, int(row_idx)
            return best_idx
    except Exception as e:
        logger.debug(f"Header discovery failed: {e}")
    return 0


def _make_columns_unique(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure all DataFrame column names are unique strings."""
    cols = []
    counts = {}
    for c in df.columns:
        c_str = str(c).strip() if pd.notna(c) else "Column"
        if not c_str or c_str.lower().startswith("unnamed"):
            c_str = "Question"
        if c_str in counts:
            counts[c_str] += 1
            cols.append(f"{c_str} ({counts[c_str]})")
        else:
            counts[c_str] = 1
            cols.append(c_str)
    df.columns = cols
    return df


def _read_raw_dataframe(file_bytes: bytes, header_row: int, file_type: str = "excel") -> pd.DataFrame:
    if file_type == "csv":
        raw_text = file_bytes.decode("utf-8", errors="replace")
        raw_text = _normalize_line_endings(raw_text)
        delimiter = _guess_csv_delimiter(raw_text)
        df = pd.read_csv(
            io.StringIO(raw_text),
            engine="python",
            sep=delimiter,
            header=header_row,
            dtype=str,
            quotechar='"',
            skipinitialspace=True,
            keep_default_na=False,
        )
    else:
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl", header=header_row, dtype=str)
    return _make_columns_unique(df)


# ──────────────────────────── Likert scoring helpers ─────────────────────────

LIKERT_SCORE_MAP = {
    "strongly agree": 5, "agree": 4, "neutral": 3, "neither agree nor disagree": 3,
    "disagree": 2, "strongly disagree": 1,
    "very satisfied": 5, "satisfied": 4, "dissatisfied": 2, "very dissatisfied": 1,
    "always": 5, "often": 4, "sometimes": 3, "rarely": 2, "never": 1,
    "excellent": 5, "very good": 4, "good": 4, "average": 3, "fair": 3,
    "poor": 2, "very poor": 1,
    "very important": 5, "important": 4, "unimportant": 2, "very unimportant": 1,
    "yes": 1, "no": 0, "true": 1, "false": 0,
}

POSITIVE_LIKERT_VALS = {"strongly agree", "agree", "very satisfied", "satisfied",
                        "always", "often", "excellent", "very good", "good",
                        "very important", "important", "yes", "true"}
NEGATIVE_LIKERT_VALS = {"strongly disagree", "disagree", "very dissatisfied", "dissatisfied",
                        "never", "rarely", "very poor", "poor", "very unimportant",
                        "unimportant", "no", "false"}


def _analyze_likert_column(series: pd.Series) -> Dict[str, Any]:
    vals = series.str.lower().str.strip()
    counts = vals.value_counts().to_dict()
    total = len(vals)

    if total == 0:
        return {
            "distribution": {}, "total": 0, "avg_score": None,
            "positive_count": 0, "negative_count": 0, "neutral_count": 0,
            "positive_pct": 0.0, "negative_pct": 0.0, "neutral_pct": 0.0,
        }

    distribution = {str(k): {"count": int(v), "pct": round(float(v) / total * 100, 1)} for k, v in counts.items()}

    scores = vals.map(lambda v: LIKERT_SCORE_MAP.get(str(v).lower().strip(), None)).dropna()
    avg_score = round(float(scores.mean()), 2) if len(scores) > 0 else None

    positive_count = int(sum(v for k, v in counts.items() if str(k).lower().strip() in POSITIVE_LIKERT_VALS))
    negative_count = int(sum(v for k, v in counts.items() if str(k).lower().strip() in NEGATIVE_LIKERT_VALS))
    neutral_count = int(total - positive_count - negative_count)

    return {
        "distribution": distribution,
        "total": int(total),
        "avg_score": avg_score,
        "positive_count": positive_count,
        "negative_count": negative_count,
        "neutral_count": neutral_count,
        "positive_pct": round(float(positive_count) / total * 100, 1) if total else 0.0,
        "negative_pct": round(float(negative_count) / total * 100, 1) if total else 0.0,
        "neutral_pct": round(float(neutral_count) / total * 100, 1) if total else 0.0,
    }


def _analyze_rating_column(series: pd.Series) -> Dict[str, Any]:
    numeric = pd.to_numeric(series[series.str.match(NUMERIC_RE)], errors="coerce").dropna()
    total = len(series)
    if numeric.empty or total == 0:
        return {
            "distribution": {}, "total": int(total), "min": 0.0, "max": 0.0, "mean": 0.0,
            "positive_count": 0, "negative_count": 0, "neutral_count": 0,
            "positive_pct": 0.0, "negative_pct": 0.0, "neutral_pct": 0.0,
        }

    distribution = {}
    for v in sorted(numeric.unique()):
        count = int((numeric == v).sum())
        distribution[str(int(v) if v == int(v) else v)] = {
            "count": count,
            "pct": round(float(count) / total * 100, 1),
        }
    mn, mx = float(numeric.min()), float(numeric.max())
    rng = mx - mn if mx != mn else 1.0
    positive_count = int((numeric >= mn + rng * 0.67).sum())
    negative_count = int((numeric <= mn + rng * 0.33).sum())
    neutral_count = int(total - positive_count - negative_count)

    return {
        "distribution": distribution,
        "total": int(total),
        "min": mn, "max": mx,
        "mean": round(float(numeric.mean()), 2),
        "positive_count": positive_count,
        "negative_count": negative_count,
        "neutral_count": neutral_count,
        "positive_pct": round(float(positive_count) / total * 100, 1) if total else 0.0,
        "negative_pct": round(float(negative_count) / total * 100, 1) if total else 0.0,
        "neutral_pct": round(float(neutral_count) / total * 100, 1) if total else 0.0,
    }


def _analyze_choice_column(series: pd.Series) -> Dict[str, Any]:
    counts = series.str.strip().value_counts().to_dict()
    total = len(series)
    if total == 0:
        return {"distribution": {}, "total": 0}
    distribution = {str(k): {"count": int(v), "pct": round(float(v) / total * 100, 1)} for k, v in counts.items()}
    return {"distribution": distribution, "total": int(total)}


# ──────────────────────────── public API ─────────────────────────────────────

def read_and_classify_file(
    file_bytes: bytes,
    filename: str = "",
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    ext = Path(filename or "").suffix.lower()
    file_type = "csv" if ext in {".csv", ".tsv", ".txt"} else "excel"
    header_row = _find_header_row(file_bytes, file_type=file_type)

    try:
        df = _read_raw_dataframe(file_bytes, header_row, file_type=file_type)
    except Exception as e:
        raise ValueError(f"Failed to read file: {e}")

    if df.empty or len(df.columns) == 0:
        raise ValueError("File is empty or has no columns.")

    column_specs = []
    for col in df.columns:
        col_str = str(col).strip()
        if not col_str or col_str.lower().startswith("unnamed"):
            continue
        info = classify_column(df, col)
        info["name"] = col_str
        column_specs.append(info)

    useful_specs = [s for s in column_specs if s["type"] not in ("empty", "meta", "unknown")]

    if not useful_specs:
        for s in column_specs:
            if s["type"] in ("meta", "unknown"):
                series = _col_values(df, s["name"])
                if not series.empty:
                    s["type"] = "choice"
                    useful_specs.append(s)

    if not useful_specs:
        raise ValueError(
            "No analysable question columns were detected. "
            "Please ensure your uploaded Excel or CSV file contains survey responses."
        )

    return df, useful_specs


def build_dynamic_summary(
    df: pd.DataFrame,
    column_specs: List[Dict[str, Any]],
    sentiment_results: Dict[str, Any],
) -> Dict[str, Any]:
    questions = []
    for spec in column_specs:
        col = spec["name"]
        col_type = spec["type"]
        series = _col_values(df, col)

        q: Dict[str, Any] = {"name": str(col), "type": str(col_type)}

        if col_type == "likert":
            q.update(_analyze_likert_column(series))
        elif col_type == "rating":
            q.update(_analyze_rating_column(series))
        elif col_type == "choice":
            q.update(_analyze_choice_column(series))
        elif col_type == "text":
            sent = sentiment_results.get(col, {})
            q["total"] = int(series.count())
            q["positive_count"] = int(sent.get("positive_count", 0))
            q["negative_count"] = int(sent.get("negative_count", 0))
            q["neutral_count"] = int(sent.get("neutral_count", 0))
            q["positive_pct"] = float(sent.get("positive_pct", 0.0))
            q["negative_pct"] = float(sent.get("negative_pct", 0.0))
            q["neutral_pct"] = float(sent.get("neutral_pct", 0.0))
            q["top_positive"] = sent.get("top_positive", [])
            q["top_negative"] = sent.get("top_negative", [])
            q["samples"] = sent.get("samples", [])

        questions.append(q)

    return {"questions": questions, "total_questions": len(questions)}


def collect_text_columns(
    df: pd.DataFrame, column_specs: List[Dict[str, Any]]
) -> Dict[str, List[str]]:
    result = {}
    for spec in column_specs:
        if spec["type"] == "text":
            col = spec["name"]
            series = _col_values(df, col)
            result[col] = series.tolist()
    return result


def build_text_sentiment_summary(
    col_texts: List[str],
    sentiments: List[Tuple[str, float]],
) -> Dict[str, Any]:
    pos, neg, neu = [], [], []
    for text, (label, score) in zip(col_texts, sentiments):
        if label == "Positive":
            pos.append(text)
        elif label == "Negative":
            neg.append(text)
        else:
            neu.append(text)

    total = len(col_texts)

    def top_repeated(lst, n=10):
        counter = Counter(str(t).strip().lower() for t in lst)
        return [{"text": str(t), "count": int(c)} for t, c in counter.most_common(n)]

    return {
        "positive_count": len(pos),
        "negative_count": len(neg),
        "neutral_count": len(neu),
        "positive_pct": round(float(len(pos)) / total * 100, 1) if total else 0.0,
        "negative_pct": round(float(len(neg)) / total * 100, 1) if total else 0.0,
        "neutral_pct": round(float(len(neu)) / total * 100, 1) if total else 0.0,
        "top_positive": top_repeated(pos),
        "top_negative": top_repeated(neg),
        "samples": [{"text": str(t), "label": str(l), "score": float(s)} for t, (l, s) in zip(col_texts[:20], sentiments[:20])],
    }


# ──────────────────────────── PDF report ─────────────────────────────────────

def generate_pdf_report(summary: Dict[str, Any]) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(30, 30, 60)
    pdf.cell(0, 12, "FeedbackSense - Dynamic Analysis Report", ln=True, align="C")
    pdf.ln(4)

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 7, f"Total Questions Analysed: {summary.get('total_questions', 0)}", ln=True)
    pdf.ln(4)

    color_map = {
        "likert": (99, 102, 241),
        "rating": (234, 179, 8),
        "choice": (14, 165, 233),
        "text": (34, 197, 94),
    }

    for q in summary.get("questions", []):
        col_type = q.get("type", "unknown")
        r, g, b = color_map.get(col_type, (100, 100, 100))

        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(r, g, b)
        label = f"[{col_type.upper()}] {q['name']}"
        pdf.multi_cell(0, 8, label)

        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(30, 30, 30)

        if col_type in ("likert", "rating", "text"):
            total = q.get("total", 0)
            pos_pct = q.get("positive_pct", 0)
            neg_pct = q.get("negative_pct", 0)
            neu_pct = q.get("neutral_pct", 0)
            pdf.cell(0, 7, f"  Total: {total}  |  Positive: {pos_pct}%  |  Negative: {neg_pct}%  |  Neutral: {neu_pct}%", ln=True)
            if col_type == "rating":
                pdf.cell(0, 7, f"  Mean Score: {q.get('mean', 'N/A')}  |  Range: {q.get('min')} – {q.get('max')}", ln=True)
            dist = q.get("distribution", {})
            if dist:
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(80, 80, 80)
                for val, info in list(dist.items())[:8]:
                    pdf.cell(0, 6, f"    {val}: {info['count']} ({info['pct']}%)", ln=True)
        elif col_type == "choice":
            dist = q.get("distribution", {})
            for val, info in list(dist.items())[:10]:
                pdf.cell(0, 6, f"    {val}: {info['count']} ({info['pct']}%)", ln=True)

        pdf.ln(3)

    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(130, 130, 130)
    pdf.cell(0, 8, "Generated by FeedbackSense powered by RoBERTa NLP", ln=True, align="C")

    return bytes(pdf.output())


# ──────────────────── backwards-compat shims ─────────────────────────────────

def read_feedback_file(file_bytes: bytes, filename: str = "", feedback_col: str = "feedback"):
    df, col_specs = read_and_classify_file(file_bytes, filename=filename)
    available_cols = [str(c) for c in df.columns]
    text_cols = [s["name"] for s in col_specs if s["type"] == "text"]
    if not text_cols:
        text_cols = [s["name"] for s in col_specs]
    if not text_cols:
        raise ValueError("No analysable columns found.")
    col = text_cols[0]
    df_ret = df[[col]].rename(columns={col: "feedback"})
    df_ret["feedback"] = df_ret["feedback"].astype(str).str.strip()
    df_ret = df_ret[df_ret["feedback"].notna() & (df_ret["feedback"] != "") & (df_ret["feedback"] != "nan")].reset_index(drop=True)
    return df_ret, text_cols, available_cols


read_excel_feedback = read_feedback_file


def build_summary(df: pd.DataFrame) -> Dict[str, Any]:
    total = len(df)
    counts = df["sentiment"].value_counts().to_dict() if "sentiment" in df.columns else {}

    def pct(n):
        return round(float(n) / total * 100, 2) if total else 0.0

    pos = df[df["sentiment"] == "Positive"] if "sentiment" in df.columns else df.iloc[0:0]
    neg = df[df["sentiment"] == "Negative"] if "sentiment" in df.columns else df.iloc[0:0]

    def top_fb(subset, n=10):
        counter = Counter(subset["feedback"].str.lower().str.strip().tolist())
        return [{"text": str(t), "count": int(c)} for t, c in counter.most_common(n)]

    pos_c = int(counts.get("Positive", 0))
    neg_c = int(counts.get("Negative", 0))
    neu_c = int(counts.get("Neutral", 0))

    return {
        "total": int(total),
        "positive": {"count": pos_c, "percentage": pct(pos_c), "top_repeated": top_fb(pos), "samples": []},
        "negative": {"count": neg_c, "percentage": pct(neg_c), "top_repeated": top_fb(neg), "samples": []},
        "neutral":  {"count": neu_c, "percentage": pct(neu_c), "top_repeated": top_fb(pos), "samples": []},
    }
