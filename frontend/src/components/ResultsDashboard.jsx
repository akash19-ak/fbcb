import { Download, RefreshCw } from 'lucide-react';
import DynamicDashboard from './DynamicDashboard';
import SampleTable from './SampleTable';

export default function ResultsDashboard({ data, onReset, onDownload, downloading }) {
  const { filename, summary, rows, total_rows, available_columns } = data;
  const questions = summary?.questions || [];

  // Aggregate stats across all questions
  const textQ     = questions.filter(q => q.type === 'text');
  const likertQ   = questions.filter(q => q.type === 'likert');
  const ratingQ   = questions.filter(q => q.type === 'rating');
  const choiceQ   = questions.filter(q => q.type === 'choice');

  // Overall sentiment from text questions (weighted avg)
  let totalPos = 0, totalNeg = 0, totalNeu = 0, totalText = 0;
  textQ.forEach(q => {
    totalPos += q.positive_count || 0;
    totalNeg += q.negative_count || 0;
    totalNeu += q.neutral_count || 0;
    totalText += q.total || 0;
  });

  // Overall satisfaction from likert questions (avg positive_pct)
  const avgLikertPos = likertQ.length > 0
    ? Math.round(likertQ.reduce((a, q) => a + (q.positive_pct || 0), 0) / likertQ.length)
    : null;

  // Average rating
  const avgRating = ratingQ.length > 0
    ? (ratingQ.reduce((a, q) => a + (q.mean || 0), 0) / ratingQ.length).toFixed(1)
    : null;

  return (
    <div className="results">
      {/* ── Header ── */}
      <div className="results-header">
        <div>
          <div className="results-title">Analysis Results</div>
          <div className="results-meta">
            📄 {filename} &nbsp;·&nbsp; {(total_rows || 0).toLocaleString()} rows &nbsp;·&nbsp;
            {questions.length} questions detected
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={onReset} id="reset-btn">
            <RefreshCw size={15} /> New File
          </button>
          <button className="btn btn-primary" onClick={onDownload} disabled={downloading} id="download-btn">
            {downloading ? <div className="spinner" /> : <Download size={15} />}
            {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* ── Dynamic Stats Tiles ── */}
      <div className="stats-grid">
        <StatCard variant="total"    label="Total Rows"         value={(total_rows || 0).toLocaleString()} icon="📊" />
        <StatCard variant="total"    label="Questions Detected" value={questions.length} icon="🔍" />
        {avgLikertPos !== null && (
          <StatCard variant="positive" label="Avg Satisfaction"  value={`${avgLikertPos}%`} icon="📋" note="Likert positive" />
        )}
        {avgRating !== null && (
          <StatCard variant="neutral"  label="Avg Rating Score"  value={avgRating} icon="⭐" />
        )}
        {totalText > 0 && (
          <StatCard variant="positive" label="Positive Sentiment" value={`${Math.round(totalPos / totalText * 100)}%`} icon="😊" note="open-text" />
        )}
        {totalText > 0 && (
          <StatCard variant="negative" label="Negative Sentiment" value={`${Math.round(totalNeg / totalText * 100)}%`} icon="😞" note="open-text" />
        )}
        <StatCard variant="total"    label="Likert Questions"   value={likertQ.length} icon="📋" />
        <StatCard variant="total"    label="Rating Questions"   value={ratingQ.length} icon="⭐" />
        <StatCard variant="total"    label="Choice Questions"   value={choiceQ.length} icon="🔘" />
        <StatCard variant="total"    label="Open Text Qs"       value={textQ.length}   icon="💬" />
      </div>

      {/* ── Dynamic Per-Question Dashboard ── */}
      <DynamicDashboard summary={summary} />

      {/* ── Sample Table (text columns only) ── */}
      {rows && rows.length > 0 && <SampleTable rows={rows} />}
    </div>
  );
}

function StatCard({ variant, label, value, icon, note }) {
  return (
    <div className={`stat-card ${variant}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-pct" style={{ opacity: 0.7 }}>{note}</div>}
    </div>
  );
}
