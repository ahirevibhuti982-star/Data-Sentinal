/**
 * Dashboard.jsx
 * Main dashboard panel. Receives the active scan data and renders:
 *  - Stat overview cards
 *  - Quality score gauge + issue bar chart
 *  - Findings table
 *  - Column statistics
 */
import { ShieldCheck, List, Database, AlertTriangle } from 'lucide-react'
import ScoreGauge from './ScoreGauge.jsx'
import FindingsTable from './FindingsTable.jsx'
import ColumnStats from './ColumnStats.jsx'
import IssueBarChart from './IssueBarChart.jsx'

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="stat-card">
      {Icon && (
        <div className="stat-icon">
          <Icon size={36} />
        </div>
      )}
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color ?? 'var(--color-indigo-light)' }}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function severityCounts(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings ?? []) c[f.severity] = (c[f.severity] || 0) + 1
  return c
}

export default function Dashboard({ scan, activeTab }) {
  if (!scan) {
    return (
      <div className="empty-state" style={{ padding: '96px 32px' }}>
        <div className="empty-state-icon">
          <ShieldCheck size={56} />
        </div>
        <div className="empty-state-title">No scan loaded</div>
        <div className="empty-state-sub">
          Upload a CSV file and click "Run Scan" to begin monitoring your data quality.
        </div>
      </div>
    )
  }

  const sc = severityCounts(scan.findings)

  if (activeTab === 'overview') {
    return (
      <div>
        {/* Stat cards */}
        <div className="stat-grid">
          <StatCard
            label="Total Rows"
            value={scan.row_count.toLocaleString()}
            sub={`${scan.col_count} columns`}
            icon={Database}
          />
          <StatCard
            label="Total Issues"
            value={scan.total_issues}
            sub="findings detected"
            icon={AlertTriangle}
            color={scan.total_issues > 0 ? 'var(--color-high)' : 'var(--color-low)'}
          />
          <StatCard
            label="Critical"
            value={sc.critical}
            sub="severity: critical"
            color={sc.critical > 0 ? 'var(--color-critical)' : 'var(--color-low)'}
          />
          <StatCard
            label="High"
            value={sc.high}
            sub="severity: high"
            color={sc.high > 0 ? 'var(--color-high)' : 'var(--color-low)'}
          />
          <StatCard
            label="Medium + Low"
            value={(sc.medium + sc.low)}
            sub="minor issues"
          />
        </div>

        {/* Score + chart row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <ShieldCheck size={17} color="var(--color-indigo-light)" />
                Quality Score
              </div>
            </div>
            <ScoreGauge score={scan.quality_score} />
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <AlertTriangle size={17} color="var(--color-high)" />
                Issues by Type
              </div>
            </div>
            <IssueBarChart findings={scan.findings} />
          </div>
        </div>

        {/* Scan meta */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">Scan Details</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { label: 'File', value: scan.filename },
              { label: 'Scanned at', value: new Date(scan.created_at + (scan.created_at?.includes?.('T') ? '' : 'Z')).toLocaleString() },
              { label: 'Rows', value: scan.row_count.toLocaleString() },
              { label: 'Columns', value: scan.col_count },
              { label: 'Score', value: `${scan.quality_score} / 100` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-muted" style={{ marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'findings') {
    return (
      <div>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <List size={17} color="var(--color-indigo-light)" />
                All Findings
              </div>
              <div className="card-subtitle">
                {scan.total_issues} issue{scan.total_issues !== 1 ? 's' : ''} detected · sorted by severity
              </div>
            </div>
          </div>
          <FindingsTable findings={scan.findings} />
        </div>
      </div>
    )
  }

  if (activeTab === 'columns') {
    return (
      <div>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Database size={17} color="var(--color-cyan)" />
                Column Statistics
              </div>
              <div className="card-subtitle">
                Per-column analysis for {scan.col_count} column{scan.col_count !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <ColumnStats columnStats={scan.column_stats} />
        </div>
      </div>
    )
  }

  return null
}
