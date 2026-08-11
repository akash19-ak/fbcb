# FeedbackSense 🧠

AI-powered sentiment analysis for feedback files, built with **FastAPI + HuggingFace RoBERTa + React**.

---

## 📁 Project Structure

```
fbcb/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point
│   │   ├── routes/
│   │   │   └── sentiment.py         # /api/analyze & /api/download-report
│   │   └── services/
│   │       ├── sentiment_service.py # RoBERTa inference (batch processing)
│   │       └── excel_service.py     # Excel reader + PDF generator
│   ├── generate_sample.py           # Sample Excel data generator
│   ├── requirements.txt
│   └── run.py
└── frontend/
    └── src/
        ├── App.jsx                  # Main app + state machine
        └── components/
            ├── UploadZone.jsx       # Drag & drop file input
            ├── ProcessingView.jsx   # Loading/progress screen
            ├── ResultsDashboard.jsx # Full results layout
            ├── SentimentDonut.jsx   # Pie chart
            ├── TopFeedbacks.jsx     # Top repeated feedbacks list
            └── SampleTable.jsx      # Row-level classified table
```

---

## 🚀 Quick Start

### 1. Backend Setup (Python 3.10+)

```bash
cd backend

# Create & activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start the API server
python run.py
```

The API will start at **http://localhost:8000**  
Swagger docs: **http://localhost:8000/docs**

> ⚠️ First run will download the RoBERTa model (~500 MB). Subsequent runs are fast.

---

### 2. Frontend Setup (Node.js 18+)

```bash
cd frontend
npm install
npm run dev
```

The UI will open at **http://localhost:5173**

---

### 3. Generate an Optional Sample Feedback File

```bash
cd backend
python generate_sample.py
# Creates: sample_feedback.xlsx with 100 rows
```

---

## 📊 Sample Input Format

Your feedback file must contain a text column with free-form comments, ideally named **`feedback`** (case-insensitive):

| feedback |
|----------|
| The exam portal worked flawlessly throughout the session. |
| Server was down during my entire exam. Very frustrating! |
| The experience was neither exceptional nor terrible. |
| ... |

---

## 🔧 Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `feedback_column` | `feedback` | Name of the column to analyze |
| `MAX_FILE_SIZE_MB` | 20 MB | Maximum file upload size |
| `MAX_ROWS` | 7000 | Maximum number of rows |
| `batch_size` | 64 | Inference batch size |

---

## ⚡ Performance Notes

- Batch size of 64 enables efficient GPU/CPU throughput
- 5000 rows ≈ 60–90 seconds on CPU, 10–20 seconds on GPU
- Model is lazy-loaded on first request and cached in memory

---

## 📦 Key Dependencies

**Backend:**
- `fastapi` + `uvicorn` — API framework
- `transformers` — HuggingFace model integration
- `torch` — Deep learning inference
- `pandas` + `openpyxl` — Excel processing
- `fpdf2` — PDF report generation

**Frontend:**
- `react` + `vite` — UI framework
- `recharts` — Charts
- `axios` — HTTP client
- `react-dropzone` — File drag & drop
- `lucide-react` — Icons

---

## 🤖 Model Details

**Model**: `cardiffnlp/twitter-roberta-base-sentiment-latest`  
**Labels**: Positive / Negative / Neutral  
**Source**: [HuggingFace Hub](https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest)
