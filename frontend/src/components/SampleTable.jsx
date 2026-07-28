const EMOJI  = { Positive: '✅', Negative: '❌', Neutral: '⚪' };
const SCORES = { Positive: 'var(--positive)', Negative: 'var(--negative)', Neutral: 'var(--neutral)' };

export default function SampleTable({ rows }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="card section-card sample-table-wrap">
      <div className="section-header">
        <div className="section-dot positive"></div>
        <span className="section-title">Sample Classified Feedbacks (first 500 rows)</span>
      </div>
      <table className="sample-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Feedback</th>
            <th>Sentiment</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
              <td style={{ maxWidth: 480 }}>{row.feedback}</td>
              <td>
                <span className={`sentiment-badge ${row.sentiment?.toLowerCase()}`}>
                  {EMOJI[row.sentiment]} {row.sentiment}
                </span>
              </td>
              <td>
                <span style={{ color: SCORES[row.sentiment], fontWeight: 600 }}>
                  {(row.confidence * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
