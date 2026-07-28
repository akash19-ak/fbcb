"""
Excel processing utilities: read, validate, and produce summary report.
"""

import pandas as pd
import io
from collections import Counter
from fpdf import FPDF
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)


METADATA_KEYWORDS = {
    "id", "no", "num", "number", "code", "date", "time", "type", "category",
    "status", "user", "student", "email", "phone", "seq", "serial", "index"
}

FEEDBACK_KEYWORDS = [
    "feedback_text", "feedback text", "comments", "comment", "review",
    "reviews", "remarks", "remark", "feedback", "response", "responses",
    "text", "opinion", "message", "description", "details"
]


def _find_header_row(file_bytes: bytes, feedback_col: str, max_scan: int = 20) -> int:
    """
    Scan the first `max_scan` rows of the Excel file to find the row index
    that looks like the real column header row: it must contain a cell matching
    `feedback_col` (or a common feedback-column keyword), AND have more than one
    filled cell, so a single-cell report title/metadata line above the real
    header (e.g. "Report Name: Feedback Report") is never mistaken for it.
    Returns 0 (default) if not found.
    """
    target = feedback_col.lower().strip()
    search_terms = list(dict.fromkeys([target, *FEEDBACK_KEYWORDS]))
    try:
        raw = pd.read_excel(
            io.BytesIO(file_bytes), engine="openpyxl", header=None, nrows=max_scan
        )
        rows = [
            (row_idx, [str(v).lower().strip() for v in row if pd.notna(v)])
            for row_idx, row in raw.iterrows()
        ]
        # A real header row names multiple columns; a title/metadata line above
        # it typically occupies a single cell, so skip those.
        candidate_rows = [(idx, vals) for idx, vals in rows if len(vals) >= 2]

        # Pass 1: exact match
        for row_idx, row_vals in candidate_rows:
            if any(v in search_terms for v in row_vals):
                logger.info(f"Header row found (exact) at index {row_idx}")
                return int(row_idx)
        # Pass 2: contains match (e.g. 'feedback' inside 'Feedback Test')
        for row_idx, row_vals in candidate_rows:
            if any(term in v for v in row_vals for term in search_terms):
                logger.info(f"Header row found (contains) at index {row_idx}")
                return int(row_idx)
    except Exception:
        pass
    return 0


def _is_metadata_col(col_name: str) -> bool:
    col_str = str(col_name).lower().strip()
    words = set(col_str.replace("_", " ").replace("-", " ").replace("#", " ").split())
    return bool(words & METADATA_KEYWORDS)


def _avg_text_length(series: pd.Series) -> float:
    cleaned = series.dropna().astype(str).str.strip()
    cleaned = cleaned[cleaned != ""]
    if len(cleaned) == 0:
        return 0.0
    return float(cleaned.str.len().mean())


def read_excel_feedback(file_bytes: bytes, feedback_col: str = "feedback"):
    """
    Read an Excel file and return (df, matched_column_name, available_columns).
    Intelligently identifies the actual feedback text column, excluding ID/Date/Category columns,
    and falling back to the column with the highest average sentence text length.
    """
    header_row = _find_header_row(file_bytes, feedback_col)

    try:
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl", header=header_row)
    except Exception as e:
        raise ValueError(f"Failed to read Excel file: {e}")

    if df.empty or len(df.columns) == 0:
        raise ValueError("Excel file is empty or has no columns.")

    available_cols = [str(c).strip() for c in df.columns]
    target_user_input = feedback_col.lower().strip()

    # Step 1: Check if user specifically requested a non-default column name (and it exists)
    if target_user_input != "feedback":
        col_map = {str(c).lower().strip(): c for c in df.columns}
        if target_user_input in col_map:
            matched_col = col_map[target_user_input]
            df_ret = df.rename(columns={matched_col: "feedback"})
            df_ret["feedback"] = df_ret["feedback"].astype(str).str.strip()
            df_ret = df_ret[df_ret["feedback"].notna() & (df_ret["feedback"] != "") & (df_ret["feedback"] != "nan")].reset_index(drop=True)
            return df_ret, str(matched_col), available_cols

    # Step 2: Search for non-metadata candidate columns by feedback keywords
    non_meta_cols = [c for c in df.columns if not _is_metadata_col(str(c))]

    matched_col = None
    # 2a. Priority keyword search among non-metadata columns
    for kw in FEEDBACK_KEYWORDS:
        for c in non_meta_cols:
            col_lower = str(c).lower().strip()
            if kw == col_lower or kw in col_lower:
                matched_col = c
                break
        if matched_col is not None:
            break

    # 2b. Priority keyword search among all columns (if non-meta failed)
    if matched_col is None:
        for kw in FEEDBACK_KEYWORDS:
            for c in df.columns:
                col_lower = str(c).lower().strip()
                if kw in col_lower and not _is_metadata_col(col_lower):
                    matched_col = c
                    break
            if matched_col is not None:
                break

    # Step 3: Text length disambiguation
    col_lengths = {c: _avg_text_length(df[c]) for c in df.columns}

    # If matched_col is None OR if matched_col average text length is very low (< 5 chars, likely numbers/IDs),
    # pick the non-metadata column with the highest average text length
    if matched_col is None or col_lengths.get(matched_col, 0) < 5.0:
        valid_candidates = [c for c in df.columns if col_lengths.get(c, 0) > 0]
        if valid_candidates:
            sorted_cols = sorted(
                valid_candidates,
                key=lambda c: (not _is_metadata_col(str(c)), col_lengths[c]),
                reverse=True
            )
            matched_col = sorted_cols[0]

    if matched_col is None:
        raise ValueError(
            f"Could not find a valid feedback text column. Available columns: {available_cols}"
        )

    logger.info(f"Selected feedback column: '{matched_col}' (avg text len: {col_lengths.get(matched_col, 0):.1f})")

    df_ret = df.rename(columns={matched_col: "feedback"})
    df_ret["feedback"] = df_ret["feedback"].astype(str).str.strip()
    df_ret = df_ret[df_ret["feedback"].notna() & (df_ret["feedback"] != "") & (df_ret["feedback"] != "nan")].reset_index(drop=True)
    return df_ret, str(matched_col), available_cols


def build_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Build a full analytics summary dict from the analyzed DataFrame.
    DataFrame must contain columns: feedback, sentiment, confidence.
    """
    total = len(df)
    counts = df["sentiment"].value_counts().to_dict()

    positive_count = counts.get("Positive", 0)
    negative_count = counts.get("Negative", 0)
    neutral_count = counts.get("Neutral", 0)

    def pct(n):
        return round((n / total) * 100, 2) if total > 0 else 0.0

    # Top repeated feedbacks per category
    pos_df = df[df["sentiment"] == "Positive"]
    neg_df = df[df["sentiment"] == "Negative"]
    neu_df = df[df["sentiment"] == "Neutral"]

    def top_feedbacks(subset: pd.DataFrame, n: int = 10) -> List[Dict]:
        counter = Counter(subset["feedback"].str.lower().str.strip().tolist())
        top = counter.most_common(n)
        return [{"text": t, "count": c} for t, c in top]

    def samples(subset: pd.DataFrame, n: int = 5) -> List[Dict]:
        sampled = subset.head(n)[["feedback", "confidence"]].copy()
        return sampled.rename(columns={"confidence": "score"}).to_dict(orient="records")

    return {
        "total": total,
        "positive": {
            "count": positive_count,
            "percentage": pct(positive_count),
            "top_repeated": top_feedbacks(pos_df),
            "samples": samples(pos_df),
        },
        "negative": {
            "count": negative_count,
            "percentage": pct(negative_count),
            "top_repeated": top_feedbacks(neg_df),
            "samples": samples(neg_df),
        },
        "neutral": {
            "count": neutral_count,
            "percentage": pct(neutral_count),
            "top_repeated": top_feedbacks(neu_df),
            "samples": samples(neu_df),
        },
    }


def generate_pdf_report(summary: Dict[str, Any]) -> bytes:
    """Generate a downloadable PDF summary report."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Title
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(30, 30, 60)
    pdf.cell(0, 12, "FeedbackSense - Sentiment Analysis Report", ln=True, align="C")
    pdf.ln(4)

    # Overview
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(60, 60, 100)
    pdf.cell(0, 9, "Overview", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 7, f"Total Feedbacks Analyzed: {summary['total']}", ln=True)
    pdf.ln(3)

    color_map = {
        "positive": (34, 197, 94),
        "negative": (239, 68, 68),
        "neutral": (234, 179, 8),
    }

    for cat in ["positive", "negative", "neutral"]:
        data = summary[cat]
        r, g, b = color_map[cat]

        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(r, g, b)
        pdf.cell(0, 9, f"{cat.capitalize()} Feedbacks", ln=True)
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 7, f"  Count: {data['count']}  |  Percentage: {data['percentage']}%", ln=True)

        if data["top_repeated"]:
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 7, "  Top Repeated:", ln=True)
            pdf.set_font("Helvetica", "", 10)
            for item in data["top_repeated"][:5]:
                text = item["text"][:90] + "..." if len(item["text"]) > 90 else item["text"]
                pdf.cell(0, 6, f"    - {text} (x{item['count']})", ln=True)
        pdf.ln(3)

    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(130, 130, 130)
    pdf.cell(0, 8, "Generated by FeedbackSense powered by RoBERTa NLP", ln=True, align="C")

    return bytes(pdf.output())
