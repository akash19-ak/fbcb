import { useState, useEffect } from 'react';
import axios from 'axios';
import './index.css';
import './App.css';

import UploadZone from './components/UploadZone';
import ProcessingView from './components/ProcessingView';
import ResultsDashboard from './components/ResultsDashboard';

// Served from /public — a missing file here 404s quietly instead of breaking the build.
const symbiosisBg = '/symbiosis-bg.png';

const PRIMARY_API = '/api';
const FALLBACK_API = 'http://127.0.0.1:8000/api';

export default function App() {
  const [file, setFile]             = useState(null);
  const [columnName, setColumnName] = useState('feedback');
  const [state, setState]           = useState('idle');   // idle | processing | done | error
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');
  const [downloading, setDownloading] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // checking | online | offline

  // Check backend server status on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        await axios.get('/health', { timeout: 3000 });
        setBackendStatus('online');
      } catch {
        try {
          await axios.get('http://127.0.0.1:8000/health', { timeout: 3000 });
          setBackendStatus('online');
        } catch {
          setBackendStatus('offline');
        }
      }
    };
    checkBackend();
  }, []);

  // Fake progress ticker while backend processes
  useEffect(() => {
    let timer;
    if (state === 'processing') {
      setProgress(5);
      timer = setInterval(() => {
        setProgress(p => {
          if (p >= 90) { clearInterval(timer); return 90; }
          return p + Math.random() * 4;
        });
      }, 800);
    }
    return () => clearInterval(timer);
  }, [state]);

  const postWithFallback = async (endpoint, data, config = {}) => {
    // Try primary proxy endpoint first, fallback to direct backend URL if network error occurs
    try {
      return await axios.post(`${PRIMARY_API}${endpoint}`, data, config);
    } catch (err) {
      if (err.message === 'Network Error' || !err.response) {
        console.warn(`Primary endpoint ${PRIMARY_API}${endpoint} failed with network error. Trying fallback endpoint ${FALLBACK_API}${endpoint}...`);
        return await axios.post(`${FALLBACK_API}${endpoint}`, data, config);
      }
      throw err;
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setState('processing');
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('feedback_column', columnName || 'feedback');

    try {
      const res = await postWithFallback('/analyze', formData, {
        timeout: 600_000, // 10 min timeout for large files
      });
      setProgress(100);
      setTimeout(() => {
        setResult(res.data);
        setState('done');
      }, 400);
    } catch (err) {
      setState('error');
      let msg = err.response?.data?.detail || err.message || 'Unknown error';
      if (err.message === 'Network Error' || !err.response) {
        msg = 'Network Error: Cannot connect to the FastAPI backend at http://127.0.0.1:8000. Please ensure the backend server is running ("python run.py" in backend directory).';
      }
      setError(msg);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setProgress(0);
    setState('idle');
  };

  const handleDownload = async () => {
    if (!result?.summary) return;
    setDownloading(true);
    try {
      const res = await postWithFallback(
        '/download-report',
        { summary: result.summary },
        { responseType: 'blob', timeout: 30_000 }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedbacksense_report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to generate report: ' + e.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app" style={{ '--home-bg-image': `url(${symbiosisBg})` }}>
      <header className="header" style={{ display: 'none' }}>
        <div className="header-logo">
          {/* <div className="header-logo-icon">🧠</div>
          <span className="header-logo-text">FeedbackSense</span> */}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* {backendStatus === 'online' && (
            <span style={{ fontSize: '0.8rem', color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(74, 222, 128, 0.3)' }}>
              ● Backend Connected
            </span>
          )}
          {backendStatus === 'offline' && (
            <span style={{ fontSize: '0.8rem', color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(248, 113, 113, 0.3)' }}>
              ● Backend Offline (Run python run.py)
            </span>
          )} */}
          {/* <span className="header-badge">RoBERTa NLP</span> */}
        </div>
      </header>

      <main className="main">
        {backendStatus === 'offline' && (
          <div className="error-card" style={{ marginBottom: 20, maxWidth: 640, margin: '0 auto 24px auto' }}>
            <span className="error-icon">🔌</span>
            <div>
              <strong>Backend Server Disconnected</strong>
              <div style={{ fontSize: '0.85rem', marginTop: 4, opacity: 0.9 }}>
                The FastAPI backend server is not running on <code>http://127.0.0.1:8000</code>.
                <br />
                To fix: open a terminal, go to <code>c:\fbcb\backend</code>, and run <code>python run.py</code>.
              </div>
            </div>
          </div>
        )}

        {state !== 'done' && (
          <section className="hero">
            
            <h1 className="hero-title">
              SSODL FeedTrack
            </h1>
            <p className="hero-sub">
              Upload your Excel feedback file and get deep sentiment analysis powered by
              RoBERTa — classifying every row as Positive, Negative, or Neutral in seconds.
            </p>
          </section>
        )}

        {state === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <UploadZone
              file={file}
              onFileSelect={setFile}
              onClear={() => setFile(null)}
              columnName={columnName}
              onColumnChange={setColumnName}
            />
            {error && (
              <div className="error-card">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}
            {file && (
              <button
                className="btn btn-primary"
                id="analyze-btn"
                onClick={handleAnalyze}
                style={{ minWidth: 200, justifyContent: 'center', animation: 'pulse-glow 2s infinite' }}
              >
                🚀 Analyze Sentiments
              </button>
            )}
          </div>
        )}

        {state === 'processing' && <ProcessingView progress={progress} />}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div className="error-card">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
            <button className="btn btn-outline" onClick={handleReset} id="retry-btn">
              ↩ Try Again
            </button>
          </div>
        )}

        {state === 'done' && result && (
          <ResultsDashboard
            data={result}
            onReset={handleReset}
            onDownload={handleDownload}
            downloading={downloading}
          />
        )}
      </main>

      <footer className="footer">
        FeedbackSense &nbsp;·&nbsp; Powered by RoBERTa &amp; HuggingFace Transformers &nbsp;·&nbsp; Built with FastAPI + React
      </footer>
    </div>
  );
}
