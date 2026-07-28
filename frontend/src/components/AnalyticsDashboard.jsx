import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

const COLORS = {
  Positive: '#22c55e',
  Negative: '#ef4444',
  Neutral: '#eab308',
};

/* ── Small helpers ─────────────────────────────────────────────── */
function SectionHeader({ dot, title }) {
  return (
    <div className="section-header">
      <div className={`section-dot ${dot}`} />
      <span className="section-title">{title}</span>
    </div>
  );
}

/* ── Sentiment Overview Bar ────────────────────────────────────── */
function SentimentBar({ summary }) {
  const total = summary.total;
  const segments = [
    { key: 'positive', label: 'Positive', color: '#22c55e', count: summary.positive.count, pct: summary.positive.percentage },
    { key: 'neutral',  label: 'Neutral',  color: '#eab308', count: summary.neutral.count,  pct: summary.neutral.percentage  },
    { key: 'negative', label: 'Negative', color: '#ef4444', count: summary.negative.count, pct: summary.negative.percentage },
  ];

  return (
    <div className="card analytics-card">
      <SectionHeader dot="positive" title="Sentiment Breakdown" />
      {/* Stacked bar */}
      <div className="stacked-bar-wrap">
        <div className="stacked-bar">
          {segments.map(s => (
            <div
              key={s.key}
              className="stacked-bar-seg"
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.label}: ${s.count} (${s.pct}%)`}
            />
          ))}
        </div>
      </div>
      {/* Legend pills */}
      <div className="breakdown-pills">
        {segments.map(s => (
          <div key={s.key} className="breakdown-pill" style={{ borderColor: s.color + '44', background: s.color + '14' }}>
            <span className="breakdown-dot" style={{ background: s.color }} />
            <div>
              <div className="breakdown-label" style={{ color: s.color }}>{s.label}</div>
              <div className="breakdown-count">{s.count.toLocaleString()}</div>
              <div className="breakdown-pct">{s.pct}% of total</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top Feedbacks Bar Chart ───────────────────────────────────── */
function TopFeedbacksChart({ label, items, color, variant }) {
  if (!items || items.length === 0) return null;

  const data = items.slice(0, 8).map((item, i) => ({
    name: item.text.length > 28 ? item.text.slice(0, 28) + '…' : item.text,
    fullText: item.text,
    count: item.count,
    rank: i + 1,
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{
        background: 'rgba(10,10,30,0.97)',
        border: `1px solid ${color}44`,
        borderRadius: 10,
        padding: '10px 14px',
        maxWidth: 280,
        fontSize: 12,
      }}>
        <div style={{ color, fontWeight: 700, marginBottom: 4 }}>#{d.rank} Most Repeated</div>
        <div style={{ color: '#ccc', lineHeight: 1.5, marginBottom: 6 }}>{d.fullText}</div>
        <div style={{ color, fontWeight: 700, fontSize: 14 }}>{d.count}× occurrences</div>
      </div>
    );
  };

  return (
    <div className={`card analytics-card section-card ${variant}`}>
      <SectionHeader dot={variant} title={`Top Repeated ${label} Feedbacks`} />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={color}
                fillOpacity={1 - i * 0.07}
              />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fill: color, fontSize: 11, fontWeight: 700 }}
              formatter={v => `×${v}`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Confidence Distribution ───────────────────────────────────── */
function ConfidenceCard({ summary }) {
  const categories = [
    { key: 'positive', label: 'Positive', color: '#22c55e', samples: summary.positive.samples },
    { key: 'negative', label: 'Negative', color: '#ef4444', samples: summary.negative.samples },
    { key: 'neutral',  label: 'Neutral',  color: '#eab308', samples: summary.neutral.samples  },
  ];

  const avgConf = (samples) => {
    if (!samples?.length) return 0;
    return (samples.reduce((acc, s) => acc + (s.score || 0), 0) / samples.length * 100).toFixed(1);
  };

  const data = categories
    .filter(c => c.samples?.length > 0)
    .map(c => ({ name: c.label, avgConf: parseFloat(avgConf(c.samples)), color: c.color }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{
        background: 'rgba(10,10,30,0.97)',
        border: `1px solid ${d.color}44`,
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 12,
      }}>
        <div style={{ color: d.color, fontWeight: 700 }}>{d.name}</div>
        <div style={{ color: '#ccc' }}>Avg Confidence: {d.avgConf}%</div>
      </div>
    );
  };

  return (
    <div className="card analytics-card">
      <SectionHeader dot="positive" title="Avg. Confidence by Sentiment" />
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 10, right: 24, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="avgConf" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
            <LabelList
              dataKey="avgConf"
              position="top"
              style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
              formatter={v => `${v}%`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Quick Stats Row ───────────────────────────────────────────── */
function QuickStats({ summary }) {
  const posRatio = summary.positive.percentage;
  const negRatio = summary.negative.percentage;
  const sentiment =
    posRatio > 60 ? { label: 'Mostly Positive 🌟', color: '#22c55e' }
    : negRatio > 60 ? { label: 'Mostly Negative ⚠️', color: '#ef4444' }
    : posRatio > negRatio ? { label: 'Slightly Positive 🙂', color: '#86efac' }
    : negRatio > posRatio ? { label: 'Slightly Negative 😕', color: '#fca5a5' }
    : { label: 'Mixed / Neutral 😐', color: '#eab308' };

  return (
    <div className="card analytics-card quick-stats-card">
      <SectionHeader dot="positive" title="Quick Insights" />
      <div className="quick-stats-grid">
        <QuickStat label="Overall Sentiment" value={sentiment.label} valueColor={sentiment.color} />
        <QuickStat label="Positive Rate" value={`${summary.positive.percentage}%`} valueColor="#22c55e" />
        <QuickStat label="Negative Rate" value={`${summary.negative.percentage}%`} valueColor="#ef4444" />
        <QuickStat label="Neutral Rate"  value={`${summary.neutral.percentage}%`}  valueColor="#eab308" />
        <QuickStat label="Pos / Neg Ratio" value={
          summary.negative.count > 0
            ? `${(summary.positive.count / summary.negative.count).toFixed(2)}x`
            : '∞'
        } valueColor="#a855f7" />
        <QuickStat label="Total Processed" value={summary.total.toLocaleString()} valueColor="#c084fc" />
      </div>
    </div>
  );
}

function QuickStat({ label, value, valueColor }) {
  return (
    <div className="quick-stat">
      <div className="quick-stat-label">{label}</div>
      <div className="quick-stat-value" style={{ color: valueColor }}>{value}</div>
    </div>
  );
}

/* ── Main Export ───────────────────────────────────────────────── */
export default function AnalyticsDashboard({ summary }) {
  return (
    <div className="analytics-section">
      <div className="analytics-header">
        <div className="analytics-title">📊 Analytics Dashboard</div>
        <div className="analytics-sub">Deep insights from your feedback data</div>
      </div>

      {/* Row 1: Sentiment bar + Quick insights */}
      <div className="analytics-row-2">
        <SentimentBar summary={summary} />
        <QuickStats summary={summary} />
      </div>

      {/* Row 2: Confidence chart */}
      <ConfidenceCard summary={summary} />

      {/* Row 3: Top feedbacks bar charts */}
      <div className="analytics-row-2">
        <TopFeedbacksChart
          label="Positive"
          items={summary.positive.top_repeated}
          color="#22c55e"
          variant="positive"
        />
        <TopFeedbacksChart
          label="Negative"
          items={summary.negative.top_repeated}
          color="#ef4444"
          variant="negative"
        />
      </div>
    </div>
  );
}
