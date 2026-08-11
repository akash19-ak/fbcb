"""
Sentiment Analysis API Routes — Dynamic multi-column version.
"""

import io
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from app.services.excel_service import (
    read_and_classify_file,
    collect_text_columns,
    build_text_sentiment_summary,
    build_dynamic_summary,
    generate_pdf_report,
)
from app.services.sentiment_service import analyze_batch

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE_MB = 20
MAX_ROWS = 7000


@router.post("/analyze")
def analyze_feedback(file: UploadFile = File(...)):
    """
    Upload any feedback / survey file and receive a per-question dynamic analysis.
    Supports .xlsx, .xls, .csv, .tsv, .txt
    """
    if not file.filename.lower().endswith((".xlsx", ".xls", ".csv", ".tsv", ".txt")):
        raise HTTPException(
            status_code=400,
            detail="Only Excel, CSV, TSV, and TXT files are supported.",
        )

    content = file.file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.",
        )

    try:
        df, column_specs = read_and_classify_file(content, filename=file.filename)

        if len(df) == 0:
            raise HTTPException(status_code=422, detail="No data rows found in the file.")

        if len(df) > MAX_ROWS:
            raise HTTPException(
                status_code=422,
                detail=f"File has {len(df)} rows; maximum is {MAX_ROWS}.",
            )

        logger.info(
            f"Processing '{file.filename}': {len(df)} rows, "
            f"{len(column_specs)} question columns detected: "
            f"{[s['name'] for s in column_specs]}"
        )

        # Run RoBERTa on all free-text columns
        text_columns = collect_text_columns(df, column_specs)
        sentiment_results = {}

        for col_name, texts in text_columns.items():
            if not texts:
                continue
            predictions = analyze_batch(texts, batch_size=128)
            sentiment_results[col_name] = build_text_sentiment_summary(texts, predictions)

        # Build the per-question summary
        summary = build_dynamic_summary(df, column_specs, sentiment_results)

        # Available columns (all, for UI info)
        available_columns = [
            str(c).strip()
            for c in df.columns
            if str(c).strip() and not str(c).startswith("Unnamed")
        ]

        return JSONResponse(
            content={
                "filename": file.filename,
                "total_rows": len(df),
                "available_columns": available_columns,
                "summary": summary,
                "rows": _build_sample_rows(df, column_specs),
            }
        )
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation error processing file '{file.filename}': {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error processing file '{file.filename}': {e}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


def _build_sample_rows(df, column_specs, n=200):
    """Build a flat list of sample rows for the UI table (text columns only)."""
    text_cols = [s["name"] for s in column_specs if s["type"] == "text"]
    if not text_cols:
        return []
    col = text_cols[0]
    sample = df[[col]].head(n).copy()
    sample.columns = ["feedback"]
    sample["feedback"] = sample["feedback"].astype(str).str.strip()
    sample = sample[sample["feedback"].notna() & (sample["feedback"] != "") & (sample["feedback"] != "nan")]
    return sample.to_dict(orient="records")


@router.post("/download-report")
def download_report(payload: dict):
    """Accept a summary dict and return a downloadable PDF report."""
    summary = payload.get("summary")
    if not summary:
        raise HTTPException(status_code=400, detail="Summary data is required.")

    try:
        pdf_bytes = generate_pdf_report(summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {e}")

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=feedbacksense_report.pdf"},
    )
