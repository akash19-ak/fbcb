"""
Sentiment Analysis Service using HuggingFace cardiffnlp/twitter-roberta-base-sentiment-latest
Supports batch processing for efficient handling of 5000-6000 rows.
"""

from transformers import pipeline, AutoModelForSequenceClassification, AutoTokenizer
import torch
import os
from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)

# Use all available CPU cores for intra-op parallelism (torch otherwise
# defaults to roughly half the logical core count).
torch.set_num_threads(os.cpu_count() or 4)

# Model choice: cardiffnlp/twitter-roberta-base-sentiment-latest
# Labels: negative, neutral, positive
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"

_classifier = None


def get_classifier():
    """Lazy-load the model/tokenizer once and cache it.

    Tries the local HuggingFace cache first (instant, no network). If the
    model isn't cached yet, falls back to a normal (network) load. Without
    this, `pipeline(...)` always does a hub round-trip to check for updates
    first, and when the network/DNS is unavailable that check retries with
    backoff for a very long time before giving up and using the cache —
    making every model load (and any /analyze request behind it) hang.
    """
    global _classifier
    if _classifier is None:
        device = 0 if torch.cuda.is_available() else -1
        try:
            logger.info(f"Loading model from local cache: {MODEL_NAME}")
            model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, local_files_only=True)
            tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=True)
        except OSError:
            logger.info(f"Model not found in local cache, downloading: {MODEL_NAME}")
            model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
            tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _classifier = pipeline(
            "sentiment-analysis",
            model=model,
            tokenizer=tokenizer,
            device=device,
            truncation=True,
            max_length=512,
        )
        logger.info("Model loaded successfully.")
    return _classifier


def normalize_label(label: str) -> str:
    """Normalize model output labels to Positive/Negative/Neutral."""
    label_lower = label.lower()
    if "pos" in label_lower:
        return "Positive"
    elif "neg" in label_lower:
        return "Negative"
    else:
        return "Neutral"


def analyze_batch(texts: List[str], batch_size: int = 128) -> List[Tuple[str, float]]:
    """
    Analyze sentiment for a list of texts in batches using torch.no_grad for maximum speed.
    Returns a list of (label, score) tuples, in the same order as `texts`.

    Two speedups, both accuracy-neutral (same deterministic model, same result per text):

    1. Dedupe: feedback spreadsheets are often highly repetitive (survey forms collect
       many identical short answers like "Good" or "N/A"). Each distinct text is run
       through the model exactly once, and the result is broadcast to every row that
       shares it, instead of re-running identical inference N times.
    2. Length-bucketing: feedback text length varies a lot (one-word comments next to
       paragraphs). Batching in input order forces every short text to pad up to the
       longest text in its batch, which dominates runtime on CPU. Sorting the unique
       texts by length before batching keeps each batch similar-length, cutting wasted
       padding compute.
    """
    classifier = get_classifier()

    cleaned = [t if isinstance(t, str) and t.strip() else "no feedback" for t in texts]

    occurrences: dict = {}
    for i, t in enumerate(cleaned):
        occurrences.setdefault(t, []).append(i)

    unique_texts = list(occurrences.keys())
    order = sorted(range(len(unique_texts)), key=lambda i: len(unique_texts[i]))
    results: List[Tuple[str, float]] = [None] * len(cleaned)

    with torch.no_grad():
        for i in range(0, len(order), batch_size):
            idx_batch = order[i: i + batch_size]
            text_batch = [unique_texts[j] for j in idx_batch]
            preds = classifier(text_batch, batch_size=len(text_batch), truncation=True, max_length=256)
            for j, pred in zip(idx_batch, preds):
                label = normalize_label(pred["label"])
                score = round(pred["score"], 4)
                for orig_idx in occurrences[unique_texts[j]]:
                    results[orig_idx] = (label, score)

    return results
