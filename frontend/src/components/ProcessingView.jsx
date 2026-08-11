import { Brain, CheckCircle2, Loader2 } from 'lucide-react';

const STAGES = [
  { label: 'Reading feedback file…', icon: '📄' },
  { label: 'Tokenizing feedback data…', icon: '🔤' },
  { label: 'Running RoBERTa inference…', icon: '🧠' },
  { label: 'Classifying sentiments…', icon: '📊' },
  { label: 'Building analytics summary…', icon: '✨' },
];

const ORBIT_EMOJI = ['😊', '😐', '😞'];

export default function ProcessingView({ progress = 40 }) {
  const stageIdx = Math.min(Math.floor((progress / 100) * STAGES.length), STAGES.length - 1);

  return (
    <div className="upload-section" style={{ maxWidth: 560 }}>
      <div className="card progress-overlay">
        <div className="orbit-visual">
          <div className="orbit-ring orbit-ring-1" />
          <div className="orbit-ring orbit-ring-2" />
          <div className="orbit-core">
            <Brain size={28} strokeWidth={2} />
          </div>
          {ORBIT_EMOJI.map((emoji, i) => (
            <div key={emoji} className={`orbit-satellite orbit-satellite-${i}`}>
              {emoji}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="progress-text">Analyzing feedbacks</span>
          <span className="progress-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>

        <div className="progress-bar-track" style={{ width: '100%' }}>
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-pct">{Math.round(progress)}%</span>

        <ul className="stage-list">
          {STAGES.map((stage, i) => {
            const status = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
            return (
              <li key={stage.label} className={`stage-item stage-${status}`}>
                <span className="stage-icon">
                  {status === 'done' && <CheckCircle2 size={16} />}
                  {status === 'active' && <Loader2 size={16} className="spin-icon" />}
                  {status === 'pending' && <span className="stage-emoji">{stage.icon}</span>}
                </span>
                <span>{stage.label}</span>
              </li>
            );
          })}
        </ul>

        <span className="progress-sub" style={{ opacity: 0.6 }}>
          This may take 30–120 seconds for large files
        </span>
      </div>
    </div>
  );
}
