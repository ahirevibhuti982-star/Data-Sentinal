/**
 * ColumnStats.jsx
 * Card-grid showing per-column statistics returned by the API.
 * Numeric columns display min/max/mean/std; all columns show missing % bar.
 */
import { Database } from 'lucide-react'

function MissingBar({ pct }) {
  const color =
    pct > 20 ? 'var(--color-critical)' :
    pct > 5  ? 'var(--color-high)' :
    pct > 0  ? 'var(--color-medium)' :
               'var(--color-low)'

  return (
    <div className="missing-bar-wrap">
      <div className="missing-bar-label">
        <span>Missing</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="missing-bar-bg">
        <div
          className="missing-bar-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
    </div>
  )
}

function fmt(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return String(v)
}

export default function ColumnStats({ columnStats }) {
  if (!columnStats || Object.keys(columnStats).length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><Database size={40} /></div>
        <div className="empty-state-title">No column statistics yet</div>
        <div className="empty-state-sub">Run a scan to see per-column analysis.</div>
      </div>
    )
  }

  const isNumeric = (s) =>
    ['min', 'max', 'mean', 'std'].some((k) => s[k] !== undefined && s[k] !== null)

  return (
    <div className="col-stats-grid">
      {Object.entries(columnStats).map(([col, stats]) => (
        <div className="col-stat-card" key={col}>
          <div className="col-stat-name">
            {col}
            <span className="col-stat-type">{stats.dtype}</span>
          </div>

          <div className="col-stat-row">
            <span className="col-stat-key">Unique</span>
            <span className="col-stat-val">{fmt(stats.unique_count)}</span>
          </div>
          <div className="col-stat-row">
            <span className="col-stat-key">Missing</span>
            <span className="col-stat-val">{fmt(stats.missing_count)}</span>
          </div>

          {isNumeric(stats) && (
            <>
              <div className="col-stat-row">
                <span className="col-stat-key">Min</span>
                <span className="col-stat-val">{fmt(stats.min)}</span>
              </div>
              <div className="col-stat-row">
                <span className="col-stat-key">Max</span>
                <span className="col-stat-val">{fmt(stats.max)}</span>
              </div>
              <div className="col-stat-row">
                <span className="col-stat-key">Mean</span>
                <span className="col-stat-val">{fmt(stats.mean)}</span>
              </div>
              <div className="col-stat-row">
                <span className="col-stat-key">Std</span>
                <span className="col-stat-val">{fmt(stats.std)}</span>
              </div>
              <div className="col-stat-row">
                <span className="col-stat-key">P25 / P75</span>
                <span className="col-stat-val">{fmt(stats.p25)} / {fmt(stats.p75)}</span>
              </div>
            </>
          )}

          <MissingBar pct={stats.missing_pct ?? 0} />
        </div>
      ))}
    </div>
  )
}
