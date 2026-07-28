from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import sentiment
from app.services.sentiment_service import get_classifier

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Warming up sentiment analysis model...")
    try:
        get_classifier()
        logger.info("Model warmed up successfully.")
    except Exception as e:
        logger.warning(f"Model warmup warning: {e}")
    yield

app = FastAPI(
    title="FeedbackSense API",
    description="Sentiment analysis API for Excel feedback files",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sentiment.router, prefix="/api", tags=["Sentiment Analysis"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "FeedbackSense API"}

