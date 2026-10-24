/**
 * UploadPanel.jsx
 * Drag-and-drop + click-to-upload CSV panel with scan progress feedback.
 */
import { useState, useRef } from 'react'
import { UploadCloud, FileText, Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { uploadScan } from '../api.js'

export default function UploadPanel({ onScanComplete }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile]         = useState(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError]       = useState(null)
  const [success, setSuccess]   = useState(false)
  const inputRef = useRef()

  function handleFile(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are accepted.')
      return
    }
    setError(null)
    setSuccess(false)
    setFile(f)
  }

  function onInputChange(e) { handleFile(e.target.files[0]) }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  async function runScan() {
    if (!file) return
    setScanning(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await uploadScan(file)
      setSuccess(true)
      onScanComplete(result)
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        'An unexpected error occurred.'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <div>
          <div className="card-title">
            <UploadCloud size={18} color="var(--color-indigo-light)" />
            Upload & Scan
          </div>
          <div className="card-subtitle">Upload a CSV file to run the data-quality engine</div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`upload-zone${dragging ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={onInputChange}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'none' }}
        />
        <div className="upload-icon">
          <FileText size={26} />
        </div>
        {file ? (
          <>
            <div className="upload-title" style={{ color: 'var(--color-indigo-light)' }}>
              {file.name}
            </div>
            <div className="upload-sub">
              {(file.size / 1024).toFixed(1)} KB · Click or drop to replace
            </div>
          </>
        ) : (
          <>
            <div className="upload-title">Drop your CSV here</div>
            <div className="upload-sub">or click to browse · Max 50 MB · 500 000 rows</div>
          </>
        )}
      </div>

      {/* Progress */}
      {scanning && (
        <div className="progress-wrap" style={{ marginTop: 16 }}>
          <div className="progress-fill" />
        </div>
      )}

      {/* Error / Success banners */}
      {error && (
        <div className="alert-banner alert-error" style={{ marginTop: 16 }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && !error && (
        <div className="alert-banner alert-success" style={{ marginTop: 16 }}>
          <CheckCircle size={16} />
          Scan complete — results loaded below.
        </div>
      )}

      <div className="flex gap-2" style={{ marginTop: 16 }}>
        <button
          id="run-scan-btn"
          className="btn btn-primary"
          onClick={runScan}
          disabled={!file || scanning}
        >
          <Zap size={16} />
          {scanning ? 'Scanning…' : 'Run Scan'}
        </button>
        {file && (
          <button
            className="btn btn-ghost"
            onClick={() => { setFile(null); setError(null); setSuccess(false) }}
            disabled={scanning}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
