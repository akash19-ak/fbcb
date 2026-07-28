import { Download, RefreshCw } from 'lucide-react';
import SentimentDonut from './SentimentDonut';
import TopFeedbacks from './TopFeedbacks';
import SampleTable from './SampleTable';
import AnalyticsDashboard from './AnalyticsDashboard';

export default function ResultsDashboard({ data, onReset, onDownload, downloading }) {
  const { filename, summary, rows } = data;

  return (
    <div className="results">
      {/* ── Header ── */}
      <div className="results-header">
        <div>
          <div className="results-title">Analysis Results</div>
          <div className="results-meta">
            📄 {filename} &nbsp;·&nbsp; Column: <strong>"{data.matched_column || 'feedback'}"</strong> &nbsp;·&nbsp; {summary.total.toLocaleString()} feedbacks processed
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

      {/* ── Stats Tiles ── */}
      <div className="stats-grid">
        <StatCard variant="total"    label="Total Feedbacks"    value={summary.total}               icon="📊" />
        <StatCard variant="positive" label="Positive"           value={summary.positive.count}      pct={summary.positive.percentage} icon="😊" />
        <StatCard variant="negative" label="Negative"           value={summary.negative.count}      pct={summary.negative.percentage} icon="😞" />
        <StatCard variant="neutral"  label="Neutral"            value={summary.neutral.count}       pct={summary.neutral.percentage}  icon="😐" />
      </div>

      {/* ── Donut Chart ── */}
      <SentimentDonut summary={summary} />

      {/* ── Analytics Dashboard ── */}
      <AnalyticsDashboard summary={summary} />

      {/* ── Top Repeated Feedbacks (text list) ── */}
      <div className="content-grid">
        <TopFeedbacks label="Positive" variant="positive" items={summary.positive.top_repeated} />
        <TopFeedbacks label="Negative" variant="negative" items={summary.negative.top_repeated} />
      </div>

      {/* ── Sample Table ── */}
      <SampleTable rows={rows} />
    </div>
  );
}

function StatCard({ variant, label, value, pct, icon }) {
  return (
    <div className={`stat-card ${variant}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value?.toLocaleString()}</div>
      {pct !== undefined && <div className="stat-pct">{pct}% of total</div>}
    </div>
  );
}
