"""
Sentiment Analysis API Routes
"""

import io
import json
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse, JSONResponse

from app.services.excel_service import read_excel_feedback, build_summary, generate_pdf_report
from app.services.sentiment_service import analyze_batch

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE_MB = 20
MAX_ROWS = 7000


@router.post("/analyze")
def analyze_feedback(
    file: UploadFile = File(...),
    feedback_column: str = Form(default="feedback"),
):
    """
    Upload an Excel file and receive full sentiment analysis results.
    """
    # Validate file type
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported.")

    # Read file bytes synchronously
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.",
        )

    try:
        df, matched_col, available_cols = read_excel_feedback(content, feedback_col=feedback_column)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if len(df) > MAX_ROWS:
        raise HTTPException(
            status_code=422,
            detail=f"File contains {len(df)} rows. Maximum allowed is {MAX_ROWS}.",
        )

    if len(df) == 0:
        raise HTTPException(status_code=422, detail="No valid feedback rows found in the file.")

    logger.info(f"Processing {len(df)} feedback rows from '{file.filename}' (Column: '{matched_col}')")

    # Run sentiment analysis in batches
    texts = df["feedback"].tolist()
    predictions = analyze_batch(texts, batch_size=128)

    df["sentiment"] = [p[0] for p in predictions]
    df["confidence"] = [p[1] for p in predictions]

    # Build summary
    summary = build_summary(df)

    # Build per-row export data (capped at 500 for response size)
    rows_data = (
        df[["feedback", "sentiment", "confidence"]]
        .head(500)
        .to_dict(orient="records")
    )

    return JSONResponse(
        content={
            "filename": file.filename,
            "matched_column": matched_col,
            "available_columns": available_cols,
            "summary": summary,
            "rows": rows_data,
        }
    )


@router.post("/download-report")
def download_report(payload: dict):
    """
    Accept a summary dict and return a downloadable PDF report.
    """
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
