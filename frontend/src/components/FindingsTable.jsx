/**
 * FindingsTable.jsx
 * Table of all data-quality findings from a scan, with severity badges,
 * issue type chips, affected column labels, and sample evidence.
 */
import { AlertTriangle, Copy, Repeat2, TrendingUp, XCircle } from 'lucide-react'

const ISSUE_ICONS = {
  missing_values: <XCircle size={13} />,
  duplicates:     <Repeat2 size={13} />,
  invalid_values: <AlertTriangle size={13} />,
  outliers:       <TrendingUp size={13} />,
}

const ISSUE_LABELS = {
  missing_values: 'Missing Values',
  duplicates:     'Duplicates',
  invalid_values: 'Invalid Values',
  outliers:       'Outliers',
}

function EvidenceChips({ evidence }) {
  if (!evidence || evidence.length === 0) return <span className="text-muted text-xs">—</span>

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {evidence.slice(0, 4).map((item, i) => {
        let label = ''
        if (item === null || item === undefined) {
          label = 'null'
        } else if (typeof item === 'object') {
          label = item.row_index !== undefined
            ? `row ${item.row_index}`
            : JSON.stringify(item).slice(0, 40)
        } else {
          label = String(item).slice(0, 40)
        }
        return (
          <span key={i} className="evidence-chip">
            {label}
          </span>
        )
      })}
    </div>
  )
}

export default function FindingsTable({ findings }) {
  if (!findings || findings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><AlertTriangle size={40} /></div>
        <div className="empty-state-title">No findings</div>
        <div className="empty-state-sub">Upload a CSV and run a scan to see results.</div>
      </div>
    )
  }

  // Sort: critical first
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...findings].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
  )

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Type</th>
            <th>Column</th>
            <th style={{ textAlign: 'right' }}>Affected</th>
            <th>Description</th>
            <th>Sample Evidence</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr key={f.id}>
              <td>
                <span className={`badge badge-${f.severity}`}>
                  {f.severity}
                </span>
              </td>
              <td>
                <span className="issue-type-badge">
                  {ISSUE_ICONS[f.issue_type]}
                  {ISSUE_LABELS[f.issue_type] ?? f.issue_type}
                </span>
              </td>
              <td>
                {f.affected_column
                  ? <span className="col-name">{f.affected_column}</span>
                  : <span className="text-muted text-xs">—</span>}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
                {f.affected_count.toLocaleString()}
              </td>
              <td style={{ maxWidth: 320, fontSize: 12, color: 'var(--text-secondary)' }}>
                {f.description}
              </td>
              <td>
                <EvidenceChips evidence={f.sample_evidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
