import { Upload, FileCheck2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

export default function UploadZone({ onFileSelect, file, onClear }) {
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) onFileSelect(accepted[0]);
    setDrag(false);
  }, [onFileSelect]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'text/tab-separated-values': ['.tsv'],
      'text/plain': ['.txt'],
    },
    multiple: false,
    onDragEnter: () => setDrag(true),
    onDragLeave: () => setDrag(false),
  });

  return (
    <div className="upload-section">
      <div {...getRootProps()} className={`upload-zone ${drag ? 'drag-over' : ''}`} id="upload-dropzone">
        <input {...getInputProps()} id="file-input" />
        <div className="upload-icon">
          <Upload size={28} />
        </div>
        <div className="upload-title">
          {file ? 'File Ready' : 'Drop your feedback file here'}
        </div>
        <div className="upload-sub">
          {file
            ? 'Click to replace the file'
            : 'Supports any survey / feedback format — column types detected automatically'}
        </div>
        <span className="upload-badge">
          .xlsx &nbsp;·&nbsp; .xls &nbsp;·&nbsp; .csv &nbsp;·&nbsp; .tsv &nbsp;·&nbsp; .txt &nbsp;·&nbsp; Max 20 MB
        </span>

        {file && (
          <div className="upload-filename">
            <FileCheck2 size={15} />
            {file.name} &nbsp;·&nbsp; {(file.size / 1024).toFixed(1)} KB
          </div>
        )}
      </div>

      <div className="upload-hints">
        <div className="upload-hint-chip">📊 Likert Scales</div>
        <div className="upload-hint-chip">⭐ Ratings</div>
        <div className="upload-hint-chip">🔘 Multiple Choice</div>
        <div className="upload-hint-chip">💬 Open Text</div>
      </div>

      {file && (
        <div className="upload-actions">
          <button className="btn btn-outline" onClick={onClear} id="clear-btn">
            <X size={15} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
