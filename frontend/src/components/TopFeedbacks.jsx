const EMOJI = { Positive: '😊', Negative: '😞', Neutral: '😐' };

export default function TopFeedbacks({ label, items, variant }) {
  if (!items || items.length === 0) {
    return (
      <div className={`card section-card`}>
        <div className="section-header">
          <div className={`section-dot ${variant}`}></div>
          <span className="section-title">Top Repeated {label} Feedbacks</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data available.</p>
      </div>
    );
  }

  return (
    <div className={`card section-card ${variant}`}>
      <div className="section-header">
        <div className={`section-dot ${variant}`}></div>
        <span className="section-title">
          {EMOJI[label]} Top Repeated {label} Feedbacks
        </span>
      </div>
      <div className="feedback-list">
        {items.map((item, i) => (
          <div className="feedback-item" key={i}>
            <span className="feedback-text">
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>#{i + 1}</span>
              {item.text}
            </span>
            <span className="feedback-count">×{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
