/**
 * ScanHistory.jsx
 * Vertical list of past scans with score indicator, filename, and metadata.
 * Clicking a row loads that scan's full detail via the API.
 */
import { Clock, FileSpreadsheet } from 'lucide-react'
import { getScan } from '../api.js'
import { useState } from 'react'

function scoreColor(score) {
  if (score >= 90) return 'var(--color-low)'
  if (score >= 75) return 'var(--color-cyan)'
  if (score >= 55) return 'var(--color-medium)'
  if (score >= 30) return 'var(--color-high)'
  return 'var(--color-critical)'
}

function formatDate(dt) {
  if (!dt) return ''
  try {
    return new Date(dt + (dt.includes('T') ? '' : 'Z')).toLocaleString()
  } catch { return dt }
}

export default function ScanHistory({ scans, activeScanId, onSelect }) {
  const [loading, setLoading] = useState(null)

  async function handleClick(scan) {
    if (scan.id === activeScanId) return
    setLoading(scan.id)
    try {
      const detail = await getScan(scan.id)
      onSelect(detail)
    } finally {
      setLoading(null)
    }
  }

  if (!scans || scans.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><Clock size={36} /></div>
        <div className="empty-state-title">No scans yet</div>
        <div className="empty-state-sub">Upload a CSV to start monitoring.</div>
      </div>
    )
  }

  return (
    <div>
      {scans.map((scan) => (
        <div
          key={scan.id}
          className={`history-item${scan.id === activeScanId ? ' selected' : ''}`}
          onClick={() => handleClick(scan)}
          id={`scan-history-${scan.id}`}
        >
          <FileSpreadsheet size={18} color="var(--color-indigo-light)" style={{ flexShrink: 0 }} />
          <div className="history-file">
            <div className="history-filename">{scan.filename}</div>
            <div className="history-meta">
              {scan.row_count.toLocaleString()} rows · {scan.col_count} cols ·{' '}
              {scan.total_issues} issue{scan.total_issues !== 1 ? 's' : ''} ·{' '}
              {formatDate(scan.created_at)}
            </div>
          </div>
          {loading === scan.id ? (
            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          ) : (
            <div className="history-score" style={{ color: scoreColor(scan.quality_score) }}>
              {scan.quality_score.toFixed(0)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
