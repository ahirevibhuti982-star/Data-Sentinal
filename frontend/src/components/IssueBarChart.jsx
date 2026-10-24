/**
 * IssueBarChart.jsx
 * Horizontal bar chart summarizing issue counts by type.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

const TYPE_COLORS = {
  missing_values: '#6366f1',
  duplicates:     '#06b6d4',
  invalid_values: '#f97316',
  outliers:       '#eab308',
}

const TYPE_LABELS = {
  missing_values: 'Missing Values',
  duplicates:     'Duplicates',
  invalid_values: 'Invalid Values',
  outliers:       'Outliers',
}

export default function IssueBarChart({ findings }) {
  if (!findings || findings.length === 0) return null

  // Aggregate by issue type
  const totals = {}
  for (const f of findings) {
    totals[f.issue_type] = (totals[f.issue_type] || 0) + f.affected_count
  }

  const data = Object.entries(totals).map(([type, count]) => ({
    name: TYPE_LABELS[type] ?? type,
    count,
    type,
  }))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{payload[0]?.payload?.name}</div>
        <div style={{ color: 'var(--text-secondary)' }}>
          {payload[0]?.value?.toLocaleString()} affected records
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 24, left: 10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(99,120,180,0.12)"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.type}
              fill={TYPE_COLORS[entry.type] ?? '#6366f1'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
