/**
 * DynamicDashboard.jsx
 * Renders per-question analytics cards for any feedback format.
 * Supports: likert | rating | choice | text
 */
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, PieChart, Pie,
} from 'recharts';

// ─── colour palette ───────────────────────────────────────────────────────────
const TYPE_META = {
  likert:  { label: 'Likert Scale',      icon: '📋', accent: '#818cf8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.25)' },
  rating:  { label: 'Rating / Score',    icon: '⭐', accent: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)'  },
  choice:  { label: 'Multiple Choice',   icon: '🔘', accent: '#22d3ee', bg: 'rgba(34,211,238,0.10)',  border: 'rgba(34,211,238,0.25)'  },
  text:    { label: 'Open-ended Text',   icon: '💬', accent: '#4ade80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.25)'  },
};

const SENTIMENT_COLORS = { positive: '#22c55e', negative: '#ef4444', neutral: '#eab308' };

// ─── tiny shared helpers ──────────────────────────────────────────────────────
function SentimentBar({ posP, negP, neuP, total }) {
  const segments = [
    { key: 'pos', color: '#22c55e', pct: posP, label: 'Positive' },
    { key: 'neu', color: '#eab308', pct: neuP, label: 'Neutral'  },
    { key: 'neg', color: '#ef4444', pct: negP, label: 'Negative' },
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
        {segments.map(s => s.pct > 0 && (
          <div key={s.key} style={{ width: `${s.pct}%`, background: s.color, borderRadius: 999 }}
               title={`${s.label}: ${s.pct}%`} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {segments.map(s => (
          <span key={s.key} style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>
            {s.label}: {s.pct}%
          </span>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>n = {total}</span>
      </div>
    </div>
  );
}

function MiniDonut({ posP, negP, neuP }) {
  const data = [
    { name: 'Positive', value: posP, color: '#22c55e' },
    { name: 'Neutral',  value: neuP, color: '#eab308' },
    { name: 'Negative', value: negP, color: '#ef4444' },
  ].filter(d => d.value > 0);
  return (
    <PieChart width={90} height={90}>
      <Pie data={data} cx={42} cy={42} innerRadius={28} outerRadius={42}
           dataKey="value" strokeWidth={0} paddingAngle={2}>
        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
      </Pie>
    </PieChart>
  );
}

// ─── Likert Card ──────────────────────────────────────────────────────────────
function LikertCard({ q, accent }) {
  const dist = q.distribution || {};
  // Define a sensible sort order for common scales
  const ORDER = [
    'strongly agree', 'agree', 'neutral', 'neither agree nor disagree',
    'disagree', 'strongly disagree',
    'very satisfied', 'satisfied', 'dissatisfied', 'very dissatisfied',
    'always', 'often', 'sometimes', 'rarely', 'never',
    'excellent', 'very good', 'good', 'average', 'fair', 'poor', 'very poor',
    'yes', 'no', 'maybe', 'true', 'false',
  ];
  const entries = Object.entries(dist).sort(([a], [b]) => {
    const ia = ORDER.indexOf(a.toLowerCase());
    const ib = ORDER.indexOf(b.toLowerCase());
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([val, info]) => {
        const frac = info.count / maxCount;
        const pct = info.pct;
        return (
          <div key={val}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{val}</span>
              <span style={{ color: accent, fontWeight: 700 }}>{info.count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 99, background: accent, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        );
      })}
      <SentimentBar posP={q.positive_pct} negP={q.negative_pct} neuP={q.neutral_pct} total={q.total} />
    </div>
  );
}

// ─── Rating Card ─────────────────────────────────────────────────────────────
function RatingCard({ q, accent }) {
  const dist = q.distribution || {};
  const data = Object.entries(dist)
    .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
    .map(([val, info]) => ({ name: val, count: info.count, pct: info.pct }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: 'rgba(20,20,40,0.95)', border: `1px solid ${accent}44`, borderRadius: 8,
                    padding: '8px 12px', fontSize: 12, color: '#fff' }}>
        <div style={{ color: accent, fontWeight: 700 }}>Rating: {d.name}</div>
        <div>{d.count} responses ({d.pct}%)</div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Mean Score', val: q.mean },
          { label: 'Min', val: q.min },
          { label: 'Max', val: q.max },
          { label: 'Responses', val: q.total },
        ].map(({ label, val }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: accent }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={40}>
            {data.map((_, i) => <Cell key={i} fill={accent} fillOpacity={0.7 + i * 0.03} />)}
            <LabelList dataKey="count" position="top" style={{ fill: accent, fontSize: 10, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SentimentBar posP={q.positive_pct} negP={q.negative_pct} neuP={q.neutral_pct} total={q.total} />
    </div>
  );
}

// ─── Choice Card ─────────────────────────────────────────────────────────────
const CHOICE_COLORS = [
  '#818cf8', '#22d3ee', '#4ade80', '#f59e0b', '#f87171',
  '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9',
];

function ChoiceCard({ q }) {
  const dist = q.distribution || {};
  const entries = Object.entries(dist).sort(([, a], [, b]) => b.count - a.count);
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([val, info], i) => {
        const color = CHOICE_COLORS[i % CHOICE_COLORS.length];
        const frac = info.count / maxCount;
        return (
          <div key={val}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
              <span style={{ color, fontWeight: 700 }}>{info.count}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({info.pct}%)</span>
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 99, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Text Card ───────────────────────────────────────────────────────────────
function TextCard({ q, accent }) {
  const [tab, setTab] = useState('top');

  const tabs = [
    { id: 'top', label: '🔝 Top Positive' },
    { id: 'neg', label: '⚠️ Top Negative' },
    { id: 'samples', label: '📄 Samples' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
        <MiniDonut posP={q.positive_pct} negP={q.negative_pct} neuP={q.neutral_pct} />
        <SentimentBar posP={q.positive_pct} negP={q.negative_pct} neuP={q.neutral_pct} total={q.total} />
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
              background: tab === t.id ? accent : '#f1f5f9',
              color: tab === t.id ? '#ffffff' : '#475569',
              fontWeight: tab === t.id ? 700 : 500,
              boxShadow: tab === t.id ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'top' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(q.top_positive || []).slice(0, 6).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, minWidth: 22 }}>#{i + 1}</span>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #16a34a', border: '1px solid #dcfce7', borderLeftWidth: 3 }}>
                <div style={{ fontSize: 13, color: '#15803d', lineHeight: 1.4, fontWeight: 500 }}>{item.text}</div>
              </div>
              <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, background: '#dcfce7', padding: '2px 8px', borderRadius: 12 }}>×{item.count}</span>
            </div>
          ))}
          {(!q.top_positive || q.top_positive.length === 0) && (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>No repeated positive responses</div>
          )}
        </div>
      )}

      {tab === 'neg' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(q.top_negative || []).slice(0, 6).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, minWidth: 22 }}>#{i + 1}</span>
              <div style={{ flex: 1, background: '#fef2f2', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #dc2626', border: '1px solid #fee2e2', borderLeftWidth: 3 }}>
                <div style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.4, fontWeight: 500 }}>{item.text}</div>
              </div>
              <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, background: '#fee2e2', padding: '2px 8px', borderRadius: 12 }}>×{item.count}</span>
            </div>
          ))}
          {(!q.top_negative || q.top_negative.length === 0) && (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>No repeated negative responses</div>
          )}
        </div>
      )}

      {tab === 'samples' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {(q.samples || []).map((s, i) => {
            const color = s.label === 'Positive' ? '#16a34a' : s.label === 'Negative' ? '#dc2626' : '#ca8a04';
            const bg = s.label === 'Positive' ? '#f0fdf4' : s.label === 'Negative' ? '#fef2f2' : '#fefce8';
            return (
              <div key={i} style={{ background: bg, borderRadius: 8, padding: '8px 12px',
                                    borderLeft: `3px solid ${color}`, border: '1px solid rgba(0,0,0,0.05)', borderLeftWidth: 3 }}>
                <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5 }}>{s.text}</div>
                <div style={{ fontSize: 11, color, marginTop: 4, fontWeight: 700 }}>
                  {s.label} &nbsp;·&nbsp; {(s.score * 100).toFixed(0)}% confidence
                </div>
              </div>
            );
          })}
          {(!q.samples || q.samples.length === 0) && (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>No samples</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Overview Bar ────────────────────────────────────────────────────
function OverviewStrip({ questions }) {
  const byType = questions.reduce((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1;
    return acc;
  }, {});

  const totalRespondents = Math.max(...questions.map(q => q.total || 0), 0);

  const typeOrder = ['likert', 'rating', 'choice', 'text'];
  return (
    <div className="card analytics-card" style={{ marginBottom: 24, background: '#ffffff', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
            📊 {questions.length} Questions Detected
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            ~{totalRespondents.toLocaleString()} respondents · auto-classified by type
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {typeOrder.filter(t => byType[t]).map(t => {
            const m = TYPE_META[t];
            return (
              <div key={t} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20,
                background: m.bg, border: `1px solid ${m.border}`,
                fontSize: 13, fontWeight: 700, color: m.accent,
              }}>
                {m.icon} {byType[t]} {m.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Individual Question Card ─────────────────────────────────────────────────
function QuestionCard({ q, index }) {
  const meta = TYPE_META[q.type] || { label: q.type, icon: '❓', accent: '#999', bg: 'rgba(150,150,150,0.1)', border: 'rgba(150,150,150,0.2)' };

  return (
    <div className="card analytics-card" style={{
      border: `1px solid ${meta.border}`,
      background: '#ffffff',
      boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
      marginBottom: 16,
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: meta.bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 18, flexShrink: 0, border: `1px solid ${meta.border}`,
        }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 99, background: meta.bg,
              color: meta.accent, border: `1px solid ${meta.border}`,
            }}>
              {meta.label}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Q{index + 1}</span>
          </div>
          <div style={{
            fontSize: 15, fontWeight: 800, color: '#0f172a',
            marginTop: 6, lineHeight: 1.35,
          }}>
            {q.name}
          </div>
        </div>
      </div>

      {/* Card body by type */}
      {q.type === 'likert' && <LikertCard q={q} accent={meta.accent} />}
      {q.type === 'rating' && <RatingCard q={q} accent={meta.accent} />}
      {q.type === 'choice' && <ChoiceCard q={q} />}
      {q.type === 'text'   && <TextCard q={q} accent={meta.accent} />}
    </div>
  );
}

// ─── Filter / Sort bar ────────────────────────────────────────────────────────
const TYPE_FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'likert', label: '📋 Likert' },
  { id: 'rating', label: '⭐ Rating' },
  { id: 'choice', label: '🔘 Choice' },
  { id: 'text',   label: '💬 Text' },
];

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function DynamicDashboard({ summary }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const questions = summary?.questions || [];
  const filtered = questions.filter(q => {
    if (filter !== 'all' && q.type !== filter) return false;
    if (search && !q.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="analytics-section">
      <div className="analytics-header">
        <div className="analytics-title" style={{ color: '#0f172a', fontSize: 22, fontWeight: 800 }}>🔍 Dynamic Feedback Analysis</div>
        <div className="analytics-sub" style={{ color: '#475569', fontSize: 13 }}>Every question analysed by its type — automatically</div>
      </div>

      <OverviewStrip questions={questions} />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {TYPE_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: '7px 18px', borderRadius: 20, border: '1px solid',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: filter === f.id ? 'var(--accent)' : '#ffffff',
              color: filter === f.id ? '#ffffff' : '#475569',
              borderColor: filter === f.id ? 'var(--accent)' : '#cbd5e1',
              boxShadow: filter === f.id ? '0 4px 12px var(--accent-glow)' : '0 2px 6px rgba(0,0,0,0.04)',
              transition: 'all 0.2s',
            }}>
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔎 Search questions…"
          style={{
            marginLeft: 'auto', padding: '7px 16px', borderRadius: 20,
            border: '1px solid #cbd5e1', background: '#ffffff',
            color: '#0f172a', fontSize: 13, outline: 'none', minWidth: 220,
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          }}
        />
      </div>

      {/* Question cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 48, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
          No questions match your filter.
        </div>
      ) : (
        filtered.map((q, i) => (
          <QuestionCard key={q.name + i} q={q} index={questions.indexOf(q)} />
        ))
      )}
    </div>
  );
}
