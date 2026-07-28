import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const COLORS = {
  Positive: '#22c55e',
  Negative: '#ef4444',
  Neutral:  '#eab308',
};

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 700 }}>
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

export default function SentimentDonut({ summary }) {
  const data = [
    { name: 'Positive', value: summary.positive.count },
    { name: 'Negative', value: summary.negative.count },
    { name: 'Neutral',  value: summary.neutral.count },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{
        background: 'rgba(15,15,35,0.95)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, padding: '8px 14px', fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, color: COLORS[d.name] }}>{d.name}</div>
        <div style={{ color: '#9898c0' }}>{d.value.toLocaleString()} feedbacks</div>
      </div>
    );
  };

  return (
    <div className="card chart-section">
      <div className="section-header">
        <div className="section-dot positive"></div>
        <span className="section-title">Sentiment Distribution</span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width={240} height={240}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={3}
              dataKey="value"
              labelLine={false}
              label={renderLabel}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]}
                  stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="chart-legend">
          {data.map(d => (
            <div className="legend-item" key={d.name}>
              <div className="legend-dot" style={{ background: COLORS[d.name] }} />
              <span className="legend-label">{d.name}</span>
              <span className="legend-val">
                {d.value.toLocaleString()} &nbsp;·&nbsp; {((d.value / summary.total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
